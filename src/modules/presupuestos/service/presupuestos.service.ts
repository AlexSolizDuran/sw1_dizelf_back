import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ActualizarPresupuestoDto } from '../dto/actualizar-presupuesto.dto';
import {
  CrearPresupuestoDto,
  LineaPresupuestoDto,
} from '../dto/crear-presupuesto.dto';
import {
  FuentePrecioDto,
  PresupuestoListaDto,
  PresupuestoRespuestaDto,
} from '../dto/presupuesto-respuesta.dto';
import type { PrecioResuelto } from '../precios/tipos';
import { PreciosService } from './precios.service';

const Decimal = Prisma.Decimal;

type PresupuestoConLineas = Prisma.PresupuestoGetPayload<{
  include: { lineas: true };
}>;

type PresupuestoDeLista = {
  id: string;
  nombre: string;
  fecha: Date;
  totalMaterialesBs: Prisma.Decimal;
  tipoCambioUsd: Prisma.Decimal;
  lineasPendientes: number;
  documentoHash: string;
};

/**
 * Presupuestos de materiales: snapshots congelados.
 *
 * El motor de medición vive en el frontend (mide la escena); acá se congelan
 * las cantidades que envía y se resuelven los precios contra las tiendas. El
 * resultado es inmutable salvo el nombre: si el plano cambia, se genera otro.
 */
@Injectable()
export class PresupuestosService {
  private readonly logger = new Logger(PresupuestosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly precios: PreciosService,
  ) {}

  async crear(
    proyectoId: string,
    usuarioId: number,
    dto: CrearPresupuestoDto,
  ): Promise<PresupuestoRespuestaDto> {
    const documentoHash = await this.hashDocumentoActual(proyectoId);
    const precios = await this.resolverPrecios(dto.lineas);

    const lineas = dto.lineas.map((linea, indice) =>
      this.armarLinea(linea, indice, precios.get(linea.claveMaterial) ?? null),
    );

    // Total solo con las líneas que tienen precio: lo pendiente no suma cero,
    // simplemente no suma. Se informa aparte para que nadie lea el total como
    // definitivo sin mirar `lineasPendientes`.
    const total = lineas
      .reduce(
        (acumulado, linea) =>
          linea.subtotalBs ? acumulado.add(linea.subtotalBs) : acumulado,
        new Decimal(0),
      )
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const pendientes = lineas.filter((linea) => linea.pendiente).length;

    const creado = await this.prisma.presupuesto.create({
      data: {
        proyectoId,
        creadorId: usuarioId,
        nombre: dto.nombre.trim(),
        tipoCambioUsd: new Decimal(dto.tipoCambioUsd),
        tipoCambioFuente: dto.tipoCambioFuente ?? 'manual',
        recetaVersion: dto.recetaVersion,
        documentoHash,
        totalMaterialesBs: total,
        lineasPendientes: pendientes,
        lineas: { create: lineas },
      },
      include: { lineas: { orderBy: { orden: 'asc' } } },
    });

    this.logger.log(
      `Presupuesto ${creado.id} creado en el proyecto ${proyectoId}: ` +
        `${lineas.length} líneas, ${pendientes} pendientes, Bs ${total.toFixed(2)}.`,
    );

    return this.aRespuesta(creado);
  }

  async listar(proyectoId: string): Promise<PresupuestoListaDto[]> {
    const [presupuestos, hashActual] = await Promise.all([
      this.prisma.presupuesto.findMany({
        where: { proyectoId },
        orderBy: { fecha: 'desc' },
        // Un proyecto no tiene cientos de presupuestos; el tope evita que un
        // cliente con datos raros traiga una lista enorme.
        take: 100,
        select: {
          id: true,
          nombre: true,
          fecha: true,
          totalMaterialesBs: true,
          tipoCambioUsd: true,
          lineasPendientes: true,
          documentoHash: true,
        },
      }),
      this.hashDocumentoActual(proyectoId),
    ]);

    return presupuestos.map((presupuesto) =>
      this.aLista(presupuesto, hashActual),
    );
  }

  async obtener(
    proyectoId: string,
    presupuestoId: string,
  ): Promise<PresupuestoRespuestaDto> {
    const presupuesto = await this.prisma.presupuesto.findFirst({
      // Filtra por proyecto además del id: sin eso, un id ajeno devolvería un
      // presupuesto de otro proyecto a quien tiene `leer` en el suyo.
      where: { id: presupuestoId, proyectoId },
      include: { lineas: { orderBy: { orden: 'asc' } } },
    });

    if (!presupuesto) {
      throw new NotFoundException(
        `Presupuesto con ID ${presupuestoId} no encontrado en este proyecto.`,
      );
    }

    return this.aRespuesta(presupuesto);
  }

  async renombrar(
    proyectoId: string,
    presupuestoId: string,
    dto: ActualizarPresupuestoDto,
  ): Promise<PresupuestoRespuestaDto> {
    const resultado = await this.prisma.presupuesto.updateMany({
      where: { id: presupuestoId, proyectoId },
      data: { nombre: dto.nombre.trim() },
    });

    if (resultado.count === 0) {
      throw new NotFoundException(
        `Presupuesto con ID ${presupuestoId} no encontrado en este proyecto.`,
      );
    }

    return this.obtener(proyectoId, presupuestoId);
  }

  async eliminar(
    proyectoId: string,
    presupuestoId: string,
  ): Promise<{ message: string }> {
    const resultado = await this.prisma.presupuesto.deleteMany({
      where: { id: presupuestoId, proyectoId },
    });

    if (resultado.count === 0) {
      throw new NotFoundException(
        `Presupuesto con ID ${presupuestoId} no encontrado en este proyecto.`,
      );
    }

    return { message: 'Presupuesto eliminado correctamente.' };
  }

  /**
   * Resuelve una sola vez por clave distinta y en serie: el mismo cemento en
   * cinco líneas hace una petición, y no se disparan diez consultas a la tienda
   * en paralelo.
   */
  private async resolverPrecios(
    lineas: LineaPresupuestoDto[],
  ): Promise<Map<string, PrecioResuelto | null>> {
    const claves = [...new Set(lineas.map((linea) => linea.claveMaterial))];
    const precios = new Map<string, PrecioResuelto | null>();

    for (const clave of claves) {
      precios.set(clave, await this.precios.resolver(clave));
    }

    return precios;
  }

  private armarLinea(
    linea: LineaPresupuestoDto,
    orden: number,
    resuelto: PrecioResuelto | null,
  ) {
    const cantidad = new Decimal(linea.cantidad);
    const capturadoEn = new Date().toISOString();

    // Precio manual primero: si el usuario escribió un número, es porque sabe
    // algo que el scraping no (una cotización local, un descuento).
    if (linea.precioManualBs !== undefined) {
      const precio = new Decimal(linea.precioManualBs);
      return {
        orden,
        categoria: linea.categoria,
        claveMaterial: linea.claveMaterial,
        descripcion: linea.descripcion,
        unidad: linea.unidad,
        cantidad,
        precioUnitarioBs: precio,
        subtotalBs: this.subtotal(cantidad, precio),
        pendiente: false,
        origen: 'MANUAL',
        fuente: {
          tipo: 'manual',
          proveedor: null,
          url: null,
          sku: null,
          unidadExterna: null,
          disponible: null,
          capturadoEn,
        } satisfies FuentePrecioDto as unknown as Prisma.InputJsonValue,
        nota: null,
      };
    }

    if (resuelto) {
      const precio = new Decimal(resuelto.precioUnitarioBs);
      return {
        orden,
        categoria: linea.categoria,
        claveMaterial: linea.claveMaterial,
        descripcion: linea.descripcion,
        unidad: linea.unidad,
        cantidad,
        precioUnitarioBs: precio,
        subtotalBs: this.subtotal(cantidad, precio),
        pendiente: false,
        origen: 'CALCULADO',
        fuente: {
          tipo: 'web',
          proveedor: resuelto.proveedor,
          url: resuelto.url,
          sku: resuelto.sku,
          unidadExterna: resuelto.unidadExterna,
          disponible: resuelto.disponible,
          capturadoEn: resuelto.capturadoEn,
        } satisfies FuentePrecioDto as unknown as Prisma.InputJsonValue,
        nota: resuelto.nota ?? null,
      };
    }

    // Sin precio y sin corrección manual: la línea se guarda PENDIENTE para no
    // perder la cantidad medida, pero no suma al total.
    return {
      orden,
      categoria: linea.categoria,
      claveMaterial: linea.claveMaterial,
      descripcion: linea.descripcion,
      unidad: linea.unidad,
      cantidad,
      precioUnitarioBs: null,
      subtotalBs: null,
      pendiente: true,
      origen: 'CALCULADO',
      fuente: {
        tipo: 'pendiente',
        proveedor: null,
        url: null,
        sku: null,
        unidadExterna: null,
        disponible: null,
        capturadoEn,
        motivo: 'sin_precio',
      } satisfies FuentePrecioDto as unknown as Prisma.InputJsonValue,
      nota: 'Sin precio de proveedor. Escribe un precio para incluir la línea.',
    };
  }

  private subtotal(cantidad: Prisma.Decimal, precio: Prisma.Decimal) {
    return cantidad
      .mul(precio)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /**
   * Huella del plano que se está presupuestando.
   *
   * Se calcula sobre el documento vivo si existe, y si no sobre el último
   * guardado. El cliente no la envía: si la mandara, podría "certificar" un
   * presupuesto de un plano que ya no es el que está abierto.
   */
  private async hashDocumentoActual(proyectoId: string): Promise<string> {
    const documento = await this.prisma.documentoColaborativo.findUnique({
      where: { proyectoId },
      select: { esquemaJson: true },
    });

    let esquema: unknown = documento?.esquemaJson;

    if (esquema === undefined) {
      const proyecto = await this.prisma.proyecto.findUnique({
        where: { id: proyectoId },
        select: { esquemaJson: true },
      });
      esquema = proyecto?.esquemaJson;
    }

    return createHash('sha256')
      .update(JSON.stringify(esquema ?? {}))
      .digest('hex');
  }

  private aRespuesta(
    presupuesto: PresupuestoConLineas,
  ): PresupuestoRespuestaDto {
    const totalBs = presupuesto.totalMaterialesBs;
    const totalUsd = totalBs
      .div(presupuesto.tipoCambioUsd)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      id: presupuesto.id,
      proyectoId: presupuesto.proyectoId,
      creadorId: presupuesto.creadorId,
      nombre: presupuesto.nombre,
      monedaBase: presupuesto.monedaBase,
      tipoCambioUsd: presupuesto.tipoCambioUsd.toFixed(4),
      tipoCambioFuente: presupuesto.tipoCambioFuente,
      recetaVersion: presupuesto.recetaVersion,
      documentoHash: presupuesto.documentoHash,
      totalMaterialesBs: totalBs.toFixed(2),
      totalMaterialesUsd: totalUsd.toFixed(2),
      lineasPendientes: presupuesto.lineasPendientes,
      fecha: presupuesto.fecha,
      lineas: presupuesto.lineas.map((linea) => ({
        id: linea.id,
        orden: linea.orden,
        categoria: linea.categoria,
        claveMaterial: linea.claveMaterial,
        descripcion: linea.descripcion,
        unidad: linea.unidad,
        cantidad: linea.cantidad.toFixed(3),
        precioUnitarioBs: linea.precioUnitarioBs?.toFixed(2) ?? null,
        subtotalBs: linea.subtotalBs?.toFixed(2) ?? null,
        pendiente: linea.pendiente,
        origen: linea.origen,
        fuente: this.aFuente(linea.fuente),
        nota: linea.nota,
      })),
    };
  }

  private aLista(
    presupuesto: PresupuestoDeLista,
    hashActual: string,
  ): PresupuestoListaDto {
    const totalUsd = presupuesto.totalMaterialesBs
      .div(presupuesto.tipoCambioUsd)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      id: presupuesto.id,
      nombre: presupuesto.nombre,
      fecha: presupuesto.fecha,
      totalMaterialesBs: presupuesto.totalMaterialesBs.toFixed(2),
      totalMaterialesUsd: totalUsd.toFixed(2),
      lineasPendientes: presupuesto.lineasPendientes,
      desactualizado: presupuesto.documentoHash !== hashActual,
    };
  }

  private aFuente(valor: Prisma.JsonValue | null): FuentePrecioDto | null {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
      return null;
    }
    return valor as unknown as FuentePrecioDto;
  }
}

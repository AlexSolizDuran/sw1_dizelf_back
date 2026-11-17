import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  ConsumoPorModeloDto,
  ConsumoPorOrigenDto,
  ConsumoPorProveedorDto,
  RegistroConsumoDto,
  ResumenConsumoDto,
  TotalesConsumoDto,
} from '../dto/consumo-respuesta.dto';
import { RegistrarConsumoDto } from '../dto/registrar-consumo.dto';
import { ResumenConsumoQueryDto } from '../dto/resumen-consumo.dto';

/**
 * Todos los cortes diarios se hacen en hora de Bolivia.
 *
 * El `dia` lo calcula el servidor, nunca el cliente: así una petición no puede
 * mover su consumo al mes anterior ni repartirlo entre dos días.
 */
const ZONA_HORARIA_CONSUMO = 'America/La_Paz';

@Injectable()
export class ConsumoIaService {
  private readonly logger = new Logger(ConsumoIaService.name);

  private static readonly formatoDia = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_CONSUMO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Suma el delta de una llamada a la fila del día.
   *
   * El UPSERT es atómico: dos rondas simultáneas del mismo turno no crean dos
   * filas ni pisan los acumulados.
   */
  async registrar(
    usuarioId: number,
    dto: RegistrarConsumoDto,
  ): Promise<RegistroConsumoDto> {
    const dia = this.diaActual();

    await this.prisma.$executeRaw`
      INSERT INTO "consumo_ia" (
        "usuario_id", "dia", "origen", "proveedor", "modelo",
        "llamadas", "tokens_entrada", "tokens_salida", "actualizado_en"
      ) VALUES (
        ${usuarioId}, ${dia}::date, ${dto.origen}, ${dto.proveedor}, ${dto.modelo},
        1, ${dto.tokensEntrada}, ${dto.tokensSalida}, now()
      )
      ON CONFLICT ("usuario_id", "dia", "origen", "proveedor", "modelo")
      DO UPDATE SET
        "llamadas" = "consumo_ia"."llamadas" + 1,
        "tokens_entrada" = "consumo_ia"."tokens_entrada" + EXCLUDED."tokens_entrada",
        "tokens_salida" = "consumo_ia"."tokens_salida" + EXCLUDED."tokens_salida",
        "actualizado_en" = now()
    `;

    this.logger.debug(
      `usuario=${usuarioId} dia=${dia} origen=${dto.origen} ` +
        `proveedor=${dto.proveedor} modelo=${dto.modelo} ` +
        `entrada=${dto.tokensEntrada} salida=${dto.tokensSalida}`,
    );

    return { registrado: true, dia };
  }

  /**
   * Resumen del propio usuario. No hay endpoint de administración: cada sesión
   * solo puede leer su consumo.
   */
  async resumen(
    usuarioId: number,
    query: ResumenConsumoQueryDto,
  ): Promise<ResumenConsumoDto> {
    const hasta = query.hasta ?? this.diaActual();
    const desde = query.desde ?? `${hasta.slice(0, 7)}-01`;
    const desdeFecha = this.parsearDia(desde, 'desde');
    const hastaFecha = this.parsearDia(hasta, 'hasta');

    if (desdeFecha.getTime() > hastaFecha.getTime()) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final.',
      );
    }

    const where: Prisma.ConsumoIAWhereInput = {
      usuarioId,
      dia: { gte: desdeFecha, lte: hastaFecha },
    };

    const [total, porProveedor, porModelo, porOrigen] = await Promise.all([
      this.prisma.consumoIA.aggregate({
        where,
        _sum: {
          llamadas: true,
          tokensEntrada: true,
          tokensSalida: true,
        },
      }),
      this.prisma.consumoIA.groupBy({
        by: ['proveedor'],
        where,
        _sum: {
          llamadas: true,
          tokensEntrada: true,
          tokensSalida: true,
        },
      }),
      this.prisma.consumoIA.groupBy({
        by: ['proveedor', 'modelo'],
        where,
        _sum: {
          llamadas: true,
          tokensEntrada: true,
          tokensSalida: true,
        },
      }),
      this.prisma.consumoIA.groupBy({
        by: ['origen'],
        where,
        _sum: {
          llamadas: true,
          tokensEntrada: true,
          tokensSalida: true,
        },
      }),
    ]);

    const respuesta: ResumenConsumoDto = {
      desde,
      hasta,
      total: this.totalesDe(total._sum),
      porProveedor: porProveedor
        .map(
          (fila): ConsumoPorProveedorDto => ({
            proveedor: fila.proveedor,
            ...this.totalesDe(fila._sum),
          }),
        )
        .sort((a, b) => b.tokensTotal - a.tokensTotal),
      porModelo: porModelo
        .map(
          (fila): ConsumoPorModeloDto => ({
            proveedor: fila.proveedor,
            modelo: fila.modelo,
            ...this.totalesDe(fila._sum),
          }),
        )
        .sort((a, b) => b.tokensTotal - a.tokensTotal),
      porOrigen: porOrigen
        .map(
          (fila): ConsumoPorOrigenDto => ({
            origen: fila.origen,
            ...this.totalesDe(fila._sum),
          }),
        )
        .sort((a, b) => b.tokensTotal - a.tokensTotal),
    };

    return respuesta;
  }

  private totalesDe(
    suma:
      | {
          llamadas?: number | null;
          tokensEntrada?: number | null;
          tokensSalida?: number | null;
        }
      | null
      | undefined,
  ): TotalesConsumoDto {
    const llamadas = suma?.llamadas ?? 0;
    const tokensEntrada = suma?.tokensEntrada ?? 0;
    const tokensSalida = suma?.tokensSalida ?? 0;
    return {
      llamadas,
      tokensEntrada,
      tokensSalida,
      tokensTotal: tokensEntrada + tokensSalida,
    };
  }

  private diaActual(): string {
    return ConsumoIaService.formatoDia.format(new Date());
  }

  private parsearDia(texto: string, campo: 'desde' | 'hasta'): Date {
    const fecha = new Date(`${texto}T00:00:00.000Z`);
    if (
      Number.isNaN(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== texto
    ) {
      throw new BadRequestException(
        `La fecha "${campo}" no es una fecha válida.`,
      );
    }
    return fecha;
  }
}

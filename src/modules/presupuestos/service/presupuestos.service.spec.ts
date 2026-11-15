import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { CrearPresupuestoDto } from '../dto/crear-presupuesto.dto';
import type { PrecioResuelto } from '../precios/tipos';
import type { PreciosService } from './precios.service';
import { PresupuestosService } from './presupuestos.service';

const Decimal = Prisma.Decimal;
const ESQUEMA = { nodos: ['muro-1'] };
const HASH_ACTUAL = createHash('sha256')
  .update(JSON.stringify(ESQUEMA))
  .digest('hex');

function dtoBase(): CrearPresupuestoDto {
  return {
    nombre: 'Casa 2 dormitorios',
    recetaVersion: '1.0.0',
    tipoCambioUsd: 6.96,
    tipoCambioFuente: 'manual',
    lineas: [
      {
        claveMaterial: 'ladrillo_6h',
        categoria: 'MAMPOSTERIA',
        descripcion: 'Ladrillo 6 huecos',
        unidad: 'pza',
        cantidad: 1800,
      },
    ],
  };
}

function prismaStub() {
  const crear = jest.fn(({ data }: { data: Record<string, unknown> }) => {
    const lineas = (
      data.lineas as { create: Array<Record<string, unknown>> }
    ).create;
    return Promise.resolve({
      id: '11111111-1111-1111-1111-111111111111',
      proyectoId: data.proyectoId,
      creadorId: data.creadorId,
      nombre: data.nombre,
      monedaBase: 'BOB',
      tipoCambioUsd: data.tipoCambioUsd,
      tipoCambioFuente: data.tipoCambioFuente,
      recetaVersion: data.recetaVersion,
      documentoHash: data.documentoHash,
      totalMaterialesBs: data.totalMaterialesBs,
      lineasPendientes: data.lineasPendientes,
      fecha: new Date('2026-11-12T10:00:00Z'),
      lineas: lineas.map((linea, indice) => ({ id: indice + 1, ...linea })),
    });
  });

  return {
    documentoColaborativo: {
      findUnique: jest.fn().mockResolvedValue({ esquemaJson: ESQUEMA }),
    },
    proyecto: {
      findUnique: jest.fn().mockResolvedValue({ esquemaJson: ESQUEMA }),
    },
    presupuesto: {
      create: crear,
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function preciosStub(valores: Record<string, PrecioResuelto | null>) {
  return {
    resolver: jest.fn((clave: string) =>
      Promise.resolve(valores[clave] ?? null),
    ),
  };
}

const cemento: PrecioResuelto = {
  precioUnitarioBs: '79.00',
  proveedor: 'constructorbolivia',
  url: 'https://www.constructorbolivia.com/producto/cemento/',
  sku: 'CEM-1',
  unidadExterna: 'bolsa 50 kg',
  disponible: true,
  capturadoEn: '2026-11-12T09:00:00.000Z',
};

function construir(
  valores: Record<string, PrecioResuelto | null> = {},
  prisma = prismaStub(),
) {
  const precios = preciosStub(valores);
  const servicio = new PresupuestosService(
    prisma as unknown as PrismaService,
    precios as unknown as PreciosService,
  );
  return { servicio, prisma, precios };
}

describe('PresupuestosService.crear', () => {
  it('congela el precio del proveedor, calcula subtotal y total, y firma el plano', async () => {
    const { servicio, prisma } = construir({
      ladrillo_6h: {
        ...cemento,
        precioUnitarioBs: '1.56',
        unidadExterna: 'pieza',
        url: 'https://www.constructorbolivia.com/producto/ladrillo/',
      },
    });

    const presupuesto = await servicio.crear(
      '22222222-2222-2222-2222-222222222222',
      7,
      dtoBase(),
    );

    // 1800 piezas × Bs 1,56
    expect(presupuesto.lineas[0].precioUnitarioBs).toBe('1.56');
    expect(presupuesto.lineas[0].subtotalBs).toBe('2808.00');
    expect(presupuesto.totalMaterialesBs).toBe('2808.00');
    expect(presupuesto.totalMaterialesUsd).toBe('403.45'); // 2808 / 6,96
    expect(presupuesto.lineasPendientes).toBe(0);
    expect(presupuesto.documentoHash).toBe(HASH_ACTUAL);
    expect(presupuesto.lineas[0].fuente).toMatchObject({
      tipo: 'web',
      proveedor: 'constructorbolivia',
    });

    const datos = prisma.presupuesto.create.mock.calls[0][0].data;
    expect(datos.tipoCambioUsd).toBeInstanceOf(Decimal);
  });

  it('deja pendiente la línea sin precio y no la suma al total', async () => {
    const dto = dtoBase();
    dto.lineas.push({
      claveMaterial: 'puerta_interior_080',
      categoria: 'ABERTURA',
      descripcion: 'Puerta interior 0,80 m',
      unidad: 'pza',
      cantidad: 3,
    });

    const { servicio } = construir({
      ladrillo_6h: { ...cemento, precioUnitarioBs: '1.56' },
    });

    const presupuesto = await servicio.crear(
      '22222222-2222-2222-2222-222222222222',
      7,
      dto,
    );

    const pendiente = presupuesto.lineas[1];
    expect(pendiente.pendiente).toBe(true);
    expect(pendiente.precioUnitarioBs).toBeNull();
    expect(pendiente.subtotalBs).toBeNull();
    expect(pendiente.fuente).toMatchObject({ tipo: 'pendiente' });
    expect(presupuesto.lineasPendientes).toBe(1);
    // El total es solo lo que tiene precio: no se rellena con 0.
    expect(presupuesto.totalMaterialesBs).toBe('2808.00');
  });

  it('el precio manual gana sobre el del proveedor y queda como MANUAL', async () => {
    const dto = dtoBase();
    dto.lineas[0].precioManualBs = 1.8;

    const { servicio } = construir({
      ladrillo_6h: { ...cemento, precioUnitarioBs: '1.56' },
    });

    const presupuesto = await servicio.crear(
      '22222222-2222-2222-2222-222222222222',
      7,
      dto,
    );

    expect(presupuesto.lineas[0].origen).toBe('MANUAL');
    expect(presupuesto.lineas[0].precioUnitarioBs).toBe('1.80');
    expect(presupuesto.lineas[0].subtotalBs).toBe('3240.00');
    expect(presupuesto.lineas[0].fuente).toMatchObject({ tipo: 'manual' });
  });

  it('redondea el subtotal a centavos con HALF_UP', async () => {
    const dto = dtoBase();
    dto.lineas[0].cantidad = 3;
    dto.lineas[0].precioManualBs = 1.5555;

    const { servicio } = construir();

    const presupuesto = await servicio.crear(
      '22222222-2222-2222-2222-222222222222',
      7,
      dto,
    );

    // 3 × 1,5555 = 4,6665 → 4,67 (no 4,66)
    expect(presupuesto.lineas[0].subtotalBs).toBe('4.67');
  });

  it('resuelve cada material distinto una sola vez', async () => {
    const dto = dtoBase();
    dto.lineas.push({ ...dto.lineas[0], cantidad: 500 });

    const { servicio, precios } = construir({
      ladrillo_6h: { ...cemento, precioUnitarioBs: '1.56' },
    });

    await servicio.crear('22222222-2222-2222-2222-222222222222', 7, dto);

    expect(precios.resolver).toHaveBeenCalledTimes(1);
  });
});

describe('PresupuestosService.obtener', () => {
  it('responde 404 si el presupuesto no pertenece al proyecto', async () => {
    const { servicio } = construir();

    await expect(
      servicio.obtener(
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PresupuestosService.listar', () => {
  it('marca desactualizado solo el presupuesto de un plano que cambió', async () => {
    const prisma = prismaStub();
    prisma.presupuesto.findMany.mockResolvedValue([
      {
        id: 'a',
        nombre: 'Vigente',
        fecha: new Date('2026-11-12T10:00:00Z'),
        totalMaterialesBs: new Decimal('2808.00'),
        tipoCambioUsd: new Decimal('6.96'),
        lineasPendientes: 0,
        documentoHash: HASH_ACTUAL,
      },
      {
        id: 'b',
        nombre: 'Viejo',
        fecha: new Date('2026-10-01T10:00:00Z'),
        totalMaterialesBs: new Decimal('1000.00'),
        tipoCambioUsd: new Decimal('6.96'),
        lineasPendientes: 2,
        documentoHash: 'f'.repeat(64),
      },
    ]);

    const { servicio } = construir({}, prisma);
    const lista = await servicio.listar(
      '22222222-2222-2222-2222-222222222222',
    );

    expect(lista[0].desactualizado).toBe(false);
    expect(lista[0].totalMaterialesUsd).toBe('403.45');
    expect(lista[1].desactualizado).toBe(true);
  });
});

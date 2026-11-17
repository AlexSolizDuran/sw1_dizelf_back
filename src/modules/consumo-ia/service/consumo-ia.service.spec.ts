import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import { ConsumoIaService } from './consumo-ia.service';

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function diaEnLaPaz(): string {
  return formatoDia.format(new Date());
}

function crearPrismaMock() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    consumoIA: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
  };
}

type PrismaMock = ReturnType<typeof crearPrismaMock>;

function crearServicio(prisma: PrismaMock): ConsumoIaService {
  return new ConsumoIaService(prisma as unknown as PrismaService);
}

describe('ConsumoIaService', () => {
  describe('registrar', () => {
    it('acumula el delta en el día de Bolivia y devuelve la fecha usada', async () => {
      const prisma = crearPrismaMock();
      const servicio = crearServicio(prisma);

      const resultado = await servicio.registrar(12, {
        origen: 'escena',
        proveedor: 'openrouter',
        modelo: 'google/gemma-4-31b-it:free',
        tokensEntrada: 5840,
        tokensSalida: 460,
      });

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(resultado.registrado).toBe(true);
      expect(resultado.dia).toBe(diaEnLaPaz());
    });
  });

  describe('resumen', () => {
    it('suma entrada y salida y calcula el total', async () => {
      const prisma = crearPrismaMock();
      prisma.consumoIA.aggregate.mockResolvedValue({
        _sum: { llamadas: 3, tokensEntrada: 1000, tokensSalida: 400 },
      });
      prisma.consumoIA.groupBy
        .mockResolvedValueOnce([
          {
            proveedor: 'openrouter',
            _sum: { llamadas: 3, tokensEntrada: 1000, tokensSalida: 400 },
          },
        ])
        .mockResolvedValueOnce([
          {
            proveedor: 'openrouter',
            modelo: 'google/gemma-4-31b-it:free',
            _sum: { llamadas: 3, tokensEntrada: 1000, tokensSalida: 400 },
          },
        ])
        .mockResolvedValueOnce([
          {
            origen: 'escena',
            _sum: { llamadas: 3, tokensEntrada: 1000, tokensSalida: 400 },
          },
        ]);

      const servicio = crearServicio(prisma);
      const resumen = await servicio.resumen(12, {
        desde: '2026-11-01',
        hasta: '2026-11-17',
      });

      expect(resumen.total).toEqual({
        llamadas: 3,
        tokensEntrada: 1000,
        tokensSalida: 400,
        tokensTotal: 1400,
      });
      expect(resumen.porProveedor[0].tokensTotal).toBe(1400);
      expect(resumen.porModelo[0].modelo).toBe('google/gemma-4-31b-it:free');
      expect(resumen.porOrigen[0].origen).toBe('escena');
    });

    it('usa el mes actual hasta hoy cuando no recibe fechas', async () => {
      const prisma = crearPrismaMock();
      prisma.consumoIA.aggregate.mockResolvedValue({
        _sum: { llamadas: 0, tokensEntrada: 0, tokensSalida: 0 },
      });
      prisma.consumoIA.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const servicio = crearServicio(prisma);
      const hoy = diaEnLaPaz();
      const resumen = await servicio.resumen(12, {});

      expect(resumen.hasta).toBe(hoy);
      expect(resumen.desde).toBe(`${hoy.slice(0, 7)}-01`);
      expect(resumen.total.tokensTotal).toBe(0);
    });

    it('rechaza un rango invertido', async () => {
      const prisma = crearPrismaMock();
      const servicio = crearServicio(prisma);

      await expect(
        servicio.resumen(12, { desde: '2026-11-18', hasta: '2026-11-17' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza una fecha inexistente', async () => {
      const prisma = crearPrismaMock();
      const servicio = crearServicio(prisma);

      await expect(
        servicio.resumen(12, { desde: '2026-02-30', hasta: '2026-03-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

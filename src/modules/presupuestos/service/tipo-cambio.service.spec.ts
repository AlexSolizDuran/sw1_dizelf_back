import { ServiceUnavailableException } from '@nestjs/common';
import { catalogoPublico } from '../precios/catalogo';
import { crearConsultorParalelo } from '../precios/tipo-cambio';
import { TipoCambioService } from './tipo-cambio.service';

const respuesta = (cuerpo: unknown, ok = true) =>
  ({
    ok,
    json: async () => cuerpo,
  }) as unknown as Response;

describe('crearConsultorParalelo', () => {
  it('toma la mediana y la devuelve como decimal de 4 cifras', async () => {
    const consultar = crearConsultorParalelo(async () =>
      respuesta({
        timestamp: '2026-11-13T16:12:16.676Z',
        buy: 11.95,
        sell: 11.86,
        median: 11.91,
      }),
    );

    await expect(consultar()).resolves.toMatchObject({
      tasa: '11.9100',
      compra: '11.9500',
      venta: '11.8600',
      fuenteUrl: 'https://paralelo.bo',
      capturadoEn: '2026-11-13T16:12:16.676Z',
    });
  });

  it('devuelve null si el servicio responde con error', async () => {
    const consultar = crearConsultorParalelo(async () =>
      respuesta({}, false),
    );

    await expect(consultar()).resolves.toBeNull();
  });

  it('descarta una mediana que no es un número', async () => {
    const consultar = crearConsultorParalelo(async () =>
      respuesta({ median: '11,91' }),
    );

    await expect(consultar()).resolves.toBeNull();
  });

  it('descarta una cotización de otra magnitud', async () => {
    // Un cambio de moneda mal hecho (Bs por 100 USD) daría 1191.
    const consultar = crearConsultorParalelo(async () =>
      respuesta({ median: 1191 }),
    );

    await expect(consultar()).resolves.toBeNull();
  });
});

describe('TipoCambioService', () => {
  it('cachea la cotización y no golpea la fuente dos veces', async () => {
    const consultar = jest.fn().mockResolvedValue({
      tasa: '11.9100',
      compra: null,
      venta: null,
      fuente: 'paralelo.bo (mediana P2P)',
      fuenteUrl: 'https://paralelo.bo',
      capturadoEn: '2026-11-13T16:12:16.676Z',
    });
    const servicio = new TipoCambioService(consultar);

    await servicio.actual();
    await servicio.actual();

    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it('responde 503 si no hay cotización, sin inventar una tasa', async () => {
    const servicio = new TipoCambioService(async () => null);

    await expect(servicio.actual()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('comparte el mismo pedido entre llamadas simultáneas', async () => {
    const consultar = jest.fn().mockResolvedValue({
      tasa: '11.9100',
      compra: null,
      venta: null,
      fuente: 'paralelo.bo (mediana P2P)',
      fuenteUrl: 'https://paralelo.bo',
      capturadoEn: '2026-11-13T16:12:16.676Z',
    });
    const servicio = new TipoCambioService(consultar);

    await Promise.all([servicio.actual(), servicio.actual()]);

    expect(consultar).toHaveBeenCalledTimes(1);
  });
});

describe('catalogoPublico', () => {
  it('incluye los materiales con precio de tienda y los manuales', () => {
    const catalogo = catalogoPublico();

    const cemento = catalogo.find((m) => m.clave === 'cemento_ip30_50kg');
    const puerta = catalogo.find((m) => m.clave === 'puerta_interior');

    expect(cemento).toMatchObject({ precioAutomatico: true, unidad: 'bolsa' });
    expect(puerta).toMatchObject({ precioAutomatico: false });
    expect(puerta?.nota).toContain('escribí el de tu proveedor');
  });

  it('da a cada material una imagen: la de la tienda o una del public', () => {
    const catalogo = catalogoPublico();

    expect(catalogo.every((m) => Boolean(m.imagen))).toBe(true);

    const cerradura = catalogo.find((m) => m.clave === 'cerradura_externa');
    const ceramica = catalogo.find((m) => m.clave === 'ceramica_piso');

    // La de tienda sale del CDN del proveedor que cotiza ese producto.
    expect(cerradura?.imagen).toMatch(/^https:\/\/cdn\.shopify\.com\//);
    // La manual se sirve desde el `public/` del frontend.
    expect(ceramica?.imagen).toBe('/materiales/ceramica_piso.svg');
  });
});

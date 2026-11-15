import type { BuscadorPrecios, ProveedorHallazgo } from '../precios/tipos';
import { PreciosService } from './precios.service';

const hallazgo = (
  precio: number,
  extra: Partial<ProveedorHallazgo> = {},
): ProveedorHallazgo => ({
  precio,
  url: 'https://www.constructorbolivia.com/producto/x/',
  sku: 'SKU-1',
  unidadExterna: 'bolsa 50 kg',
  disponible: true,
  ...extra,
});

describe('PreciosService', () => {
  it('congela el precio con dos decimales cuando el hallazgo es creíble', async () => {
    const servicio = new PreciosService(async () => hallazgo(79));

    const precio = await servicio.resolver('cemento_ip30_50kg');

    expect(precio).toMatchObject({
      precioUnitarioBs: '79.00',
      proveedor: 'constructorbolivia',
      disponible: true,
    });
  });

  it('descarta un precio de otra magnitud: los centavos de la API de WooCommerce', async () => {
    // 7900 es lo que devuelve la Store API en `price` (unidad menor).
    // Si se colara, el presupuesto saldría 100 veces más caro.
    const servicio = new PreciosService(async () => hallazgo(7900));

    await expect(servicio.resolver('cemento_ip30_50kg')).resolves.toBeNull();
  });

  it('descarta el precio de un combo por millar', async () => {
    // 1790 es el `price_range.max_amount` del ladrillo (1000 unidades).
    const servicio = new PreciosService(async () => hallazgo(1790));

    await expect(servicio.resolver('ladrillo_6h')).resolves.toBeNull();
  });

  it('no inventa un precio para una clave que no está en el catálogo', async () => {
    const buscar = jest.fn();
    const servicio = new PreciosService(buscar);

    await expect(servicio.resolver('puerta_interior_080')).resolves.toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });

  it('devuelve null si el proveedor falla, sin propagar la excepción', async () => {
    const servicio = new PreciosService(async () => {
      throw new Error('ETIMEDOUT');
    });

    await expect(servicio.resolver('cemento_ip30_50kg')).resolves.toBeNull();
  });

  it('advierte cuando el proveedor no tiene existencias', async () => {
    const servicio = new PreciosService(async () =>
      hallazgo(79, { disponible: false }),
    );

    const precio = await servicio.resolver('cemento_ip30_50kg');

    expect(precio?.disponible).toBe(false);
    expect(precio?.nota).toContain('no tiene existencias');
  });

  it('hace una sola petición para la misma clave: caché y single-flight', async () => {
    let llamadas = 0;
    const buscar: BuscadorPrecios = async () => {
      llamadas += 1;
      await new Promise((resolver) => setTimeout(resolver, 10));
      return hallazgo(79);
    };
    const servicio = new PreciosService(buscar);

    const [primero, segundo] = await Promise.all([
      servicio.resolver('cemento_ip30_50kg'),
      servicio.resolver('cemento_ip30_50kg'),
    ]);

    expect(llamadas).toBe(1);
    expect(primero).toEqual(segundo);
  });
});

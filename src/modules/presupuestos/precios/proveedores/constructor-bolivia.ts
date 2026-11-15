import { normalizarTexto } from './normalizar';
import type { CandidatoCatalogo, ProveedorHallazgo } from '../tipos';

/**
 * Constructor Bolivia: WooCommerce con Store API pública, sin autenticación.
 *
 * `GET /wp-json/wc/store/v1/products?search=...` es lo único que hace falta:
 * devuelve nombre, SKU, disponibilidad y precios. La tienda permite `Allow: /`
 * para clientes genéricos; nos identificamos con un User-Agent propio y
 * consultamos poco (caché de 24 h en `PreciosService`).
 *
 * DOS TRAMPAS DE ESTA API
 * -----------------------
 * 1. Los precios vienen en la unidad menor de la moneda: `price: "7900"` con
 *    `currency_minor_unit: 2` son Bs 79,00, no Bs 7.900. Leerlo mal multiplica
 *    el presupuesto por 100.
 * 2. En productos con variantes, `price` es el mínimo entre variantes y
 *    `price_range.max_amount` es el combo por millar (Bs 1.790 para el ladrillo).
 *    La API no expone el precio de cada variante, así que se usa el mínimo y el
 *    rango de sanidad del catálogo es el que decide si ese mínimo es creíble.
 */

const BASE = 'https://www.constructorbolivia.com';
const RUTA_PRODUCTOS = '/wp-json/wc/store/v1/products';
const AGENTE = 'DizelfBot/1.0 (+https://dizelf.com; presupuestos)';
const ESPERA_MS = 8000;

interface PreciosTienda {
  price?: string;
  currency_code?: string;
  currency_minor_unit?: string;
}

interface ProductoTienda {
  id: number;
  name: string;
  sku: string;
  permalink: string;
  is_in_stock: boolean;
  prices?: PreciosTienda;
}

export async function buscarEnConstructorBolivia(
  candidato: CandidatoCatalogo,
  fetchImpl: typeof globalThis.fetch,
): Promise<ProveedorHallazgo | null> {
  const url = new URL(RUTA_PRODUCTOS, BASE);
  url.searchParams.set('search', candidato.buscar);
  url.searchParams.set('per_page', '20');

  const respuesta = await fetchImpl(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': AGENTE },
    signal: AbortSignal.timeout(ESPERA_MS),
  });

  if (!respuesta.ok) {
    return null;
  }

  const cuerpo = (await respuesta.json()) as ProductoTienda[];
  if (!Array.isArray(cuerpo) || cuerpo.length === 0) {
    return null;
  }

  const elegido = buscarProducto(cuerpo, candidato);
  if (!elegido || !elegido.prices) {
    return null;
  }

  // Solo se aceptan precios en bolivianos: convertir de otra moneda sin tasa
  // sería inventar el número.
  if (
    elegido.prices.currency_code &&
    elegido.prices.currency_code !== 'BOB'
  ) {
    return null;
  }

  const unidadMenor = Number(elegido.prices.currency_minor_unit ?? 2);
  const precio = Number(elegido.prices.price) / 10 ** unidadMenor;

  if (!Number.isFinite(precio) || precio <= 0) {
    return null;
  }

  return {
    precio,
    url: elegido.permalink ?? null,
    sku: elegido.sku || null,
    unidadExterna: candidato.unidadExterna,
    disponible: Boolean(elegido.is_in_stock),
  };
}

/**
 * SKU exacto si la ficha lo declara; si no, nombre que contenga el texto.
 * Nunca "el primero que aparezca": un resultado cualquiera es un precio de otro
 * producto.
 */
function buscarProducto(
  productos: ProductoTienda[],
  candidato: CandidatoCatalogo,
): ProductoTienda | undefined {
  if (candidato.sku) {
    const porSku = productos.find(
      (producto) => producto.sku?.trim() === candidato.sku,
    );
    if (porSku) {
      return porSku;
    }
  }

  const esperado = normalizarTexto(candidato.nombreContiene ?? '');
  if (!esperado) {
    return undefined;
  }

  return productos.find((producto) =>
    normalizarTexto(producto.name).includes(esperado),
  );
}

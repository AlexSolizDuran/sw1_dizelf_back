import { normalizarTexto } from './normalizar';
import type { CandidatoCatalogo, ProveedorHallazgo } from '../tipos';

/**
 * Morales: Shopify, con envío a Santa Cruz.
 *
 * Se usa `/search/suggest.json` en lugar de recorrer `/products.json`: el
 * catálogo son más de 3.000 productos y bajarlo entero para encontrar tres
 * precios es un desperdicio. El buscador devuelve título, precio en bolivianos
 * (decimal, ya no en centavos), disponibilidad y URL.
 *
 * No se usa `variants`: el precio del listado de sugerencias ya es el de venta
 * de la presentación publicada, y el catálogo solo incluye ítems cuya
 * presentación es inequívoca (una cerradura es una cerradura).
 */

const BASE = 'https://morales.com.bo';
const RUTA_SUGERENCIAS = '/search/suggest.json';
const AGENTE = 'DizelfBot/1.0 (+https://dizelf.com; presupuestos)';
const ESPERA_MS = 8000;

interface ProductoSugerido {
  title: string;
  price: string;
  available: boolean;
  url: string;
  handle: string;
  tags?: string[];
}

interface RespuestaSugerencias {
  resources?: {
    results?: {
      products?: ProductoSugerido[];
    };
  };
}

export async function buscarEnMorales(
  candidato: CandidatoCatalogo,
  fetchImpl: typeof globalThis.fetch,
): Promise<ProveedorHallazgo | null> {
  const url = new URL(RUTA_SUGERENCIAS, BASE);
  url.searchParams.set('q', candidato.buscar);
  url.searchParams.set('resources[type]', 'product');
  url.searchParams.set('resources[limit]', '10');

  const respuesta = await fetchImpl(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': AGENTE },
    signal: AbortSignal.timeout(ESPERA_MS),
  });

  if (!respuesta.ok) {
    return null;
  }

  const cuerpo = (await respuesta.json()) as RespuestaSugerencias;
  const productos = cuerpo.resources?.results?.products ?? [];
  if (productos.length === 0) {
    return null;
  }

  const elegido = buscarProducto(productos, candidato);
  if (!elegido) {
    return null;
  }

  const precio = Number(elegido.price);
  if (!Number.isFinite(precio) || precio <= 0) {
    return null;
  }

  return {
    precio,
    // La URL de sugerencias trae parámetros de tracking (_pos, _psq, _ss):
    // se guarda la ruta limpia del producto.
    url: elegido.handle
      ? new URL(`/products/${elegido.handle}`, BASE).toString()
      : null,
    sku: elegido.tags?.[0] ?? null,
    unidadExterna: candidato.unidadExterna,
    disponible: Boolean(elegido.available),
  };
}

function buscarProducto(
  productos: ProductoSugerido[],
  candidato: CandidatoCatalogo,
): ProductoSugerido | undefined {
  if (candidato.sku) {
    const porSku = productos.find((producto) =>
      (producto.tags ?? []).includes(candidato.sku as string),
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
    normalizarTexto(producto.title).includes(esperado),
  );
}

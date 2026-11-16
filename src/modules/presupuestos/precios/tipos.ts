/**
 * Contrato de la resolución de precios.
 *
 * El backend resuelve los precios contra las tiendas; el plano solo aporta
 * cantidades. Se separa el "hallazgo" (lo que devolvió el proveedor, en su
 * unidad y su presentación) del "precio resuelto" (ya convertido a la unidad
 * base del catálogo y validado contra un rango de sanidad).
 */

/** Tiendas que se consultan. `manual` no es un proveedor: es el usuario. */
export type ProveedorPrecioSlug = 'constructorbolivia' | 'morales';

/** Lo que devuelve un proveedor, sin normalizar. */
export interface ProveedorHallazgo {
  /** Precio en Bs., en la presentación que vende el proveedor (bolsa, pza...). */
  precio: number;
  url: string | null;
  sku: string | null;
  unidadExterna: string;
  disponible: boolean;
}

/** Precio listo para congelar en una línea del presupuesto. */
export interface PrecioResuelto {
  /** Decimal como string: nunca `number`, para no arrastrar error de centavos. */
  precioUnitarioBs: string;
  proveedor: ProveedorPrecioSlug;
  url: string | null;
  sku: string | null;
  unidadExterna: string;
  disponible: boolean;
  capturadoEn: string;
  nota?: string;
}

/**
 * Un proveedor concreto para un material, con lo necesario para validar el
 * número: `factor` convierte la presentación del proveedor a la unidad base y
 * `rangoSanidad` es la red que atrapa los errores de magnitud (precios en
 * centavos, combos por millar, productos de muestra).
 */
export interface CandidatoCatalogo {
  proveedor: ProveedorPrecioSlug;
  /** Término de búsqueda. Un solo token: la tienda no resuelve frases. */
  buscar: string;
  /** Coincidencia exacta de SKU, si el proveedor lo publica. */
  sku?: string;
  /** Texto que debe contener el nombre cuando no hay SKU fiable. */
  nombreContiene?: string;
  unidadExterna: string;
  factor: number;
  rangoSanidad: [number, number];
}

export interface FichaCatalogo {
  nombre: string;
  categoria: string;
  unidadBase: string;
  /** Aclaración que se muestra al lado del material (por qué, o qué cuidar). */
  nota?: string;
  /**
   * URL de la foto del producto, tal como la publica la tienda.
   *
   * Se escribe acá (y no se resuelve en cada request) porque la imagen tiene que
   * ser la del producto exacto que cotiza la ficha: sacarla del primer resultado
   * de una búsqueda mostraría el cemento de otra marca con el precio de este.
   */
  imagen?: string;
  candidatos: CandidatoCatalogo[];
}

/**
 * Material que no tiene precio online publicable y se cotiza a mano.
 *
 * Vive acá, y no en el frontend, porque el catálogo que edita el usuario es uno
 * solo: si la lista de materiales estuviera partida en dos repositorios, agregar
 * una puerta exigiría dos despliegues y se desincronizaría en silencio.
 */
export interface FichaManual {
  clave: string;
  nombre: string;
  categoria: string;
  unidadBase: string;
  nota: string;
  /**
   * Ruta de la imagen dentro del `public/` del frontend.
   *
   * Los materiales manuales no tienen página de tienda de la que sacar la foto,
   * así que la ilustración la servimos nosotros. Es una ruta relativa al origen
   * del cliente, no una URL del backend.
   */
  imagen: string;
}

/** Busca un material en un proveedor. Devuelve `null` si no hay precio usable. */
export type BuscadorPrecios = (
  candidato: CandidatoCatalogo,
) => Promise<ProveedorHallazgo | null>;

export const FUENTE_PRECIOS = Symbol('FUENTE_PRECIOS');

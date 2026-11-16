/**
 * Respuestas de catálogo y tipo de cambio.
 *
 * El catálogo viaja desde el backend, y no está escrito en el frontend, para que
 * agregar o corregir un material sea un solo cambio: la misma lista alimenta el
 * selector del panel y el motor de precios que lo resuelve.
 */

/** Un material presupuestable, sin el mapeo interno de las tiendas. */
export class MaterialCatalogoDto {
  /** Clave estable: viaja en cada línea del presupuesto. */
  clave: string;
  nombre: string;
  categoria: string;
  /** Unidad de compra: bolsa, pza, barra, m2, m3, gal, kg. */
  unidad: string;
  /** `true` si el backend resuelve el precio en una tienda. */
  precioAutomatico: boolean;
  /** Aclaración para el usuario, o `null`. */
  nota: string | null;
  /**
   * Foto del producto: URL de la tienda para los que se cotizan solos, ruta del
   * `public/` del frontend para los manuales. `null` si no hay imagen.
   */
  imagen: string | null;
}

/**
 * Cotización sugerida para el campo de tipo de cambio.
 *
 * Es una referencia, no un dato del presupuesto: el usuario la edita y el
 * presupuesto guarda la tasa que él confirmó.
 */
export class TipoCambioDto {
  /** Decimal con 4 decimales, como string. */
  tasa: string;
  compra: string | null;
  venta: string | null;
  fuente: string;
  fuenteUrl: string;
  capturadoEn: string;
}

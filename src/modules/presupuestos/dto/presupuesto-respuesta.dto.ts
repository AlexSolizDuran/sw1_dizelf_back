/**
 * Respuesta del presupuesto.
 *
 * Los montos y cantidades viajan como STRING decimal ("2808.00"), no como
 * number: son `Decimal` en la base y pasarlos por coma flotante en el camino
 * haría que el total no coincida con la suma de los renglones.
 */

/** De dónde salió el precio de una línea. */
export interface FuentePrecioDto {
  tipo: 'web' | 'manual' | 'pendiente';
  proveedor: string | null;
  url: string | null;
  sku: string | null;
  unidadExterna: string | null;
  disponible: boolean | null;
  capturadoEn: string;
  motivo?: string;
}

export class LineaPresupuestoRespuestaDto {
  id: number;
  orden: number;
  categoria: string;
  claveMaterial: string;
  descripcion: string;
  unidad: string;
  /** Decimal con 3 decimales fijos. */
  cantidad: string;
  /** `null` si la línea está pendiente. */
  precioUnitarioBs: string | null;
  subtotalBs: string | null;
  /** `true` si no se pudo resolver el precio y el usuario no escribió uno. */
  pendiente: boolean;
  /** `CALCULADO` (precio de tienda) o `MANUAL` (lo escribió el usuario). */
  origen: string;
  fuente: FuentePrecioDto | null;
  nota: string | null;
}

export class PresupuestoRespuestaDto {
  id: string;
  proyectoId: string;
  creadorId: number;
  nombre: string;
  monedaBase: string;
  /** Decimal con 4 decimales, congelado al crear el presupuesto. */
  tipoCambioUsd: string;
  tipoCambioFuente: string;
  recetaVersion: string;
  documentoHash: string;
  totalMaterialesBs: string;
  /** Derivado con el tipo de cambio congelado, no con la tasa de hoy. */
  totalMaterialesUsd: string;
  lineasPendientes: number;
  fecha: Date;
  lineas: LineaPresupuestoRespuestaDto[];
}

export class PresupuestoListaDto {
  id: string;
  nombre: string;
  fecha: Date;
  totalMaterialesBs: string;
  totalMaterialesUsd: string;
  lineasPendientes: number;
  /**
   * `true` si el plano cambió desde que se generó: el presupuesto ya no
   * corresponde al documento actual y hay que regenerarlo para actualizarlo.
   */
  desactualizado: boolean;
}

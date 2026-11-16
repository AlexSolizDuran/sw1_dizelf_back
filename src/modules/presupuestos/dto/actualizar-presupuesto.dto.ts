import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Solo se puede renombrar un presupuesto ya generado.
 *
 * El contenido (precios y cantidades) es un snapshot congelado: si el plano o
 * los precios cambiaron, se genera uno nuevo. Permitir editarlo convertiría el
 * documento en una vista mutable y se perdería la trazabilidad de la fuente.
 */
export class ActualizarPresupuestoDto {
  @IsString({ message: 'El nombre debe ser texto.' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(120, { message: 'El nombre no puede exceder 120 caracteres.' })
  nombre: string;
}

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const MAX_LINEAS_PRESUPUESTO = 500;

/**
 * Una línea que el motor de medición calculó en el cliente.
 *
 * El cliente NO manda precios de tienda: manda la clave del material y la
 * cantidad. El precio lo resuelve el backend contra las tiendas, salvo que el
 * usuario escriba uno (`precioManualBs`), que es la única forma de cubrir los
 * materiales sin fuente online (puertas, ventanas, pintura).
 */
export class LineaPresupuestoDto {
  /** Clave del catálogo, o una clave propia para materiales sin precio web. */
  @IsString({ message: 'La clave del material debe ser texto.' })
  @Matches(/^[a-z0-9_]{3,60}$/, {
    message:
      'La clave del material solo admite minúsculas, números y guion bajo (3 a 60).',
  })
  claveMaterial: string;

  @IsString({ message: 'La categoría debe ser texto.' })
  @MinLength(3, { message: 'La categoría es demasiado corta.' })
  @MaxLength(30, { message: 'La categoría no puede exceder 30 caracteres.' })
  categoria: string;

  @IsString({ message: 'La descripción debe ser texto.' })
  @MinLength(3, { message: 'La descripción es demasiado corta.' })
  @MaxLength(200, { message: 'La descripción no puede exceder 200 caracteres.' })
  descripcion: string;

  @IsString({ message: 'La unidad debe ser texto.' })
  @MinLength(1, { message: 'La unidad es obligatoria.' })
  @MaxLength(10, { message: 'La unidad no puede exceder 10 caracteres.' })
  unidad: string;

  /** Cantidad medida. Tres decimales alcanzan para m² y ml. */
  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'La cantidad admite hasta 3 decimales.' },
  )
  @IsPositive({ message: 'La cantidad debe ser mayor que cero.' })
  cantidad: number;

  /**
   * Precio escrito por el usuario, en Bs. por unidad. Si viene, GANA sobre el
   * precio del proveedor: es una corrección deliberada, no un descuido.
   */
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'El precio manual admite hasta 4 decimales.' },
  )
  @Min(0.0001, { message: 'El precio manual debe ser mayor que cero.' })
  precioManualBs?: number;
}

export class CrearPresupuestoDto {
  @IsString({ message: 'El nombre debe ser texto.' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(120, { message: 'El nombre no puede exceder 120 caracteres.' })
  nombre: string;

  /** Versión de las recetas de consumo con las que se midió el plano. */
  @IsString({ message: 'La versión de receta debe ser texto.' })
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: 'La versión de receta debe tener el formato 1.0.0.',
  })
  recetaVersion: string;

  /**
   * Tipo de cambio congelado en el presupuesto. Es obligatorio a propósito: la
   * tasa oficial y la paralela difieren mucho, y elegir una por el usuario
   * cambiaría el monto sin que lo haya decidido.
   */
  @IsNumber(
    { maxDecimalPlaces: 4 },
    { message: 'El tipo de cambio admite hasta 4 decimales.' },
  )
  @IsPositive({ message: 'El tipo de cambio debe ser mayor que cero.' })
  @Min(0.01, { message: 'El tipo de cambio es demasiado bajo.' })
  @Max(10000, { message: 'El tipo de cambio es demasiado alto.' })
  tipoCambioUsd: number;

  @IsOptional()
  @IsIn(['manual', 'oficial'], {
    message: 'El origen del tipo de cambio debe ser "manual" u "oficial".',
  })
  tipoCambioFuente?: 'manual' | 'oficial' = 'manual';

  @IsArray({ message: 'Las líneas deben ser un arreglo.' })
  @ArrayMinSize(1, { message: 'El presupuesto necesita al menos una línea.' })
  @ArrayMaxSize(MAX_LINEAS_PRESUPUESTO, {
    message: `El presupuesto no puede exceder ${MAX_LINEAS_PRESUPUESTO} líneas.`,
  })
  @ValidateNested({ each: true })
  @Type(() => LineaPresupuestoDto)
  lineas: LineaPresupuestoDto[];
}

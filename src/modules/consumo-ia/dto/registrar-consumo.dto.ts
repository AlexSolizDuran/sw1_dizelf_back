import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Techo defensivo: un contexto real no llega a este número por llamada. */
export const MAX_TOKENS_POR_LLAMADA = 2_000_000;

export const ORIGENES_CONSUMO = ['escena', 'ayuda'] as const;
export type OrigenConsumo = (typeof ORIGENES_CONSUMO)[number];

export const PROVEEDORES_CONSUMO = [
  'hf-space',
  'openrouter',
  'huggingface',
] as const;
export type ProveedorConsumo = (typeof PROVEEDORES_CONSUMO)[number];

/**
 * Delta de una llamada al proveedor de IA.
 *
 * El backend lo acumula en la fila diaria. `usuarioId` no viene acá: sale del
 * JWT. `dia` tampoco: lo calcula el servidor en hora de Bolivia.
 */
export class RegistrarConsumoDto {
  @IsIn(ORIGENES_CONSUMO, {
    message: 'El origen debe ser "escena" o "ayuda".',
  })
  origen: OrigenConsumo;

  @IsIn(PROVEEDORES_CONSUMO, {
    message: 'El proveedor no es válido.',
  })
  proveedor: ProveedorConsumo;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'El modelo debe ser texto.' })
  @MinLength(1, { message: 'El modelo no puede estar vacío.' })
  @MaxLength(120, { message: 'El modelo no puede exceder 120 caracteres.' })
  modelo: string;

  @IsInt({ message: 'Los tokens de entrada deben ser un entero.' })
  @Min(0, { message: 'Los tokens de entrada no pueden ser negativos.' })
  @Max(MAX_TOKENS_POR_LLAMADA, {
    message: 'Los tokens de entrada exceden el máximo permitido.',
  })
  tokensEntrada: number;

  @IsInt({ message: 'Los tokens de salida deben ser un entero.' })
  @Min(0, { message: 'Los tokens de salida no pueden ser negativos.' })
  @Max(MAX_TOKENS_POR_LLAMADA, {
    message: 'Los tokens de salida exceden el máximo permitido.',
  })
  tokensSalida: number;
}

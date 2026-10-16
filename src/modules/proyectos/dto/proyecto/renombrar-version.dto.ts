import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenombrarVersionDto {
  /** Nueva etiqueta de la versión en el historial. */
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @MinLength(1, { message: 'El nombre no puede estar vacío.' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres.' })
  nombre: string;
}

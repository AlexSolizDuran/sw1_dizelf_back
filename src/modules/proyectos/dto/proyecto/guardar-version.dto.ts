import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GuardarVersionDto {
  /**
   * Etiqueta opcional para reconocer la versión en el historial.
   *
   * La tabla `version` no tiene columna de nombre: hoy queda como `null` en la
   * respuesta y esta DTO es el punto donde se agregaría.
   */
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres.' })
  nombre?: string;
}

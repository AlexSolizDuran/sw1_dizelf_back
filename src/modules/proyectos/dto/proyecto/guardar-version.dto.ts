import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class GuardarVersionDto {
  /**
   * Etiqueta opcional para reconocer la versión en el historial.
   */
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres.' })
  nombre?: string;

  /**
   * Documento que el usuario está viendo al guardar la versión.
   *
   * Si viene, la versión se crea con esto y no con lo último que alcanzó a
   * persistir el gateway (que puede estar hasta 1,5 s atrás por el debounce).
   */
  @IsOptional()
  @IsObject({ message: 'El esquema debe ser un objeto JSON válido.' })
  esquemaJson?: Record<string, unknown>;
}

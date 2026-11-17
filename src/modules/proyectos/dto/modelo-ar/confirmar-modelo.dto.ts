import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

/**
 * Confirmación de que el `PUT` a la URL prefirmada terminó.
 *
 * La clave es lo único imprescindible: se valida contra el proyecto de la ruta
 * para que nadie confirme un objeto de otro proyecto. El tamaño que manda el
 * cliente (`bytes`) se acepta pero **no se usa**: el tamaño real se mide con
 * `HeadObject`, porque el cliente no es confiable.
 */
export class ConfirmarModeloDto {
  @IsString({ message: 'La clave del objeto debe ser una cadena de texto.' })
  @Matches(/^modelos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.glb$/, {
    message:
      'La clave del objeto no tiene el formato esperado (modelos/<proyecto>/<uuid>.glb).',
  })
  clave: string;

  /** Tamaño que cree haber subido el cliente. Solo informativo. */
  @IsOptional()
  @IsInt({ message: 'El tamaño debe ser un número entero de bytes.' })
  @Min(1, { message: 'El tamaño debe ser mayor que cero.' })
  bytes?: number;
}

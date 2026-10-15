import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { listarPermisos } from '../../../../common/capacidades/capacidades-proyecto';

export class AgregarColaboradorDto {
  @IsString({ message: 'El identificador debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El username o correo es obligatorio.' })
  @MaxLength(100, {
    message: 'El identificador no puede exceder 100 caracteres.',
  })
  identificador: string;

  /**
   * Permiso del catálogo: EDITOR escribe en el plano, LECTOR solo mira.
   *
   * Se valida contra `listarPermisos()` y no contra un enum propio, para que
   * agregar un permiso al catálogo no requiera tocar este DTO.
   */
  @IsString({ message: 'El rol debe ser una cadena de texto.' })
  @IsIn(listarPermisos(), {
    message: `El rol debe ser uno de: ${listarPermisos().join(', ')}.`,
  })
  rol: string;
}

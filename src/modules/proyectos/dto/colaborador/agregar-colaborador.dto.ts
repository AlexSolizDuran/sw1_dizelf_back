import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { listarPermisos } from '../../../../common/capacidades/capacidades-proyecto';

export class AgregarColaboradorDto {
  /**
   * Correo (o username) del usuario a invitar. El correo es el identificador
   * natural: se busca contra `persona.gmail`.
   */
  @IsString({ message: 'El identificador debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El correo es obligatorio.' })
  @MaxLength(100, {
    message: 'El identificador no puede exceder 100 caracteres.',
  })
  identificador: string;

  /**
   * Permiso del catálogo: EDITOR escribe en el plano, LECTOR solo mira.
   *
   * Es opcional: sin especificarlo, el invitado entra como LECTOR
   * (`PERMISO_POR_DEFECTO`). Se valida contra `listarPermisos()` y no contra un
   * enum propio, para que agregar un permiso al catálogo no requiera tocar este
   * DTO.
   */
  @IsOptional()
  @IsString({ message: 'El rol debe ser una cadena de texto.' })
  @IsIn(listarPermisos(), {
    message: `El rol debe ser uno de: ${listarPermisos().join(', ')}.`,
  })
  rol?: string;
}

import { IsIn, IsString } from 'class-validator';
import { listarPermisos } from '../../../../common/capacidades/capacidades-proyecto';

export class ActualizarColaboradorDto {
  /**
   * Nuevo permiso del colaborador. Obligatorio: este endpoint existe para
   * cambiarlo, y un cuerpo vacío no tendría sentido.
   */
  @IsString({ message: 'El rol debe ser una cadena de texto.' })
  @IsIn(listarPermisos(), {
    message: `El rol debe ser uno de: ${listarPermisos().join(', ')}.`,
  })
  rol: string;
}

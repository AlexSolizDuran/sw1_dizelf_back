import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Actualización de metadatos del proyecto.
 *
 * El documento vivo no se actualiza por HTTP: lo persiste el gateway de sync,
 * que es el único que tiene el estado CRDT mezclado de todos los clientes.
 */
export class ActualizarProyectoDto {
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres.' })
  nombre?: string;
}

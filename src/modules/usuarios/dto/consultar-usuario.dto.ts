import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ConsultarUsuarioDto {
  @IsString({ message: 'El término de búsqueda debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El término de búsqueda es obligatorio.' })
  @MinLength(2, { message: 'El término debe tener al menos 2 caracteres.' })
  termino: string;
}

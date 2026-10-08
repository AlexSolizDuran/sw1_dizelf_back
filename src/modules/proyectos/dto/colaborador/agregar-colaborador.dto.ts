import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AgregarColaboradorDto {
  @IsString({ message: 'El identificador debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El username o correo es obligatorio.' })
  @MaxLength(100, {
    message: 'El identificador no puede exceder 100 caracteres.',
  })
  identificador: string;
}

import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO para la solicitud de inicio de sesión.
 * Permite autenticarse mediante nombre de usuario o correo electrónico.
 */
export class LoginDto {
  @IsString({ message: 'El identificador debe ser una cadena de texto.' })
  @IsNotEmpty({
    message: 'Debe ingresar su nombre de usuario o correo electrónico.',
  })
  identificador: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password: string;
}

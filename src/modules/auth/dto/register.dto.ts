import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsStrongPassword,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO para la solicitud de registro de una nueva cuenta.
 * Valida los datos requeridos para crear atómicamente Persona y Usuario.
 */
export class RegisterDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(80, { message: 'El nombre no puede exceder 80 caracteres.' })
  nombre: string;

  @IsString({ message: 'El apellido debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El apellido es obligatorio.' })
  @MaxLength(80, { message: 'El apellido no puede exceder 80 caracteres.' })
  apellido: string;

  @IsEmail(
    {},
    { message: 'El correo electrónico debe tener un formato válido.' },
  )
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio.' })
  @MaxLength(80, {
    message: 'El correo electrónico no puede exceder 80 caracteres.',
  })
  gmail: string;

  @IsString({ message: 'El nombre de usuario debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre de usuario es obligatorio.' })
  @MinLength(3, {
    message: 'El nombre de usuario debe tener al menos 3 caracteres.',
  })
  @MaxLength(50, {
    message: 'El nombre de usuario no puede exceder 50 caracteres.',
  })
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'El nombre de usuario solo puede contener letras, números, puntos, guiones y guiones bajos.',
  })
  username: string;

  @IsString({ message: 'La contraseña debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @IsStrongPassword(
    {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        'La contraseña debe tener al menos 8 caracteres, incluyendo una letra mayúscula, una minúscula, un número y un símbolo.',
    },
  )
  password: string;
}

import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CrearProyectoDto {
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre del proyecto es obligatorio.' })
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(100, { message: 'El nombre no puede exceder 100 caracteres.' })
  nombre: string;

  @IsOptional()
  @IsObject({ message: 'El esquema debe ser un objeto JSON válido.' })
  esquemaJson: Record<string, unknown> = {};
}

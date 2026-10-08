import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_LIMITE_PROYECTOS = 50;

export class ConsultarProyectosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1.' })
  pagina?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero.' })
  @Min(1, { message: 'El límite debe ser mayor o igual a 1.' })
  @Max(MAX_LIMITE_PROYECTOS, {
    message: `El límite no puede exceder ${MAX_LIMITE_PROYECTOS}.`,
  })
  limite?: number = 10;
}

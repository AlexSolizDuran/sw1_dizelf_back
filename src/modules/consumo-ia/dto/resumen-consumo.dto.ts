import { IsOptional, Matches } from 'class-validator';

/**
 * Rango de días del resumen, en formato `YYYY-MM-DD`.
 *
 * Si no se envía `desde`, arranca el primer día del mes de `hasta`. Si no se
 * envía `hasta`, llega al día actual en hora de Bolivia.
 */
export class ResumenConsumoQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha inicial debe tener el formato YYYY-MM-DD.',
  })
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha final debe tener el formato YYYY-MM-DD.',
  })
  hasta?: string;
}

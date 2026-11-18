import { IsString, Matches, MaxLength } from 'class-validator';
import { PATRON_TOKEN_PUSH } from './registrar-dispositivo.dto';

/** Baja del token al cerrar sesión. Solo se borra si pertenece al usuario. */
export class BajaDispositivoDto {
  @IsString()
  @MaxLength(200)
  @Matches(PATRON_TOKEN_PUSH, {
    message: 'El token de push no tiene el formato de Expo.',
  })
  token: string;
}

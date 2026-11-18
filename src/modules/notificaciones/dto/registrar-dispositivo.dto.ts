import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Formato de los tokens que emite `expo-notifications`. */
export const PATRON_TOKEN_PUSH =
  /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;

/**
 * Alta o actualización del token de push de este dispositivo.
 *
 * El `usuarioId` NO viaja en el cuerpo: sale del JWT. Si el mismo celular
 * cambia de cuenta, el backend reasigna el token al usuario autenticado.
 */
export class RegistrarDispositivoDto {
  @IsString()
  @MaxLength(200)
  @Matches(PATRON_TOKEN_PUSH, {
    message: 'El token de push no tiene el formato de Expo.',
  })
  token: string;

  @IsIn(['android', 'ios'])
  plataforma: 'android' | 'ios';

  /**
   * UUID estable por instalación. Lo genera la app una vez y lo guarda en
   * SecureStore; sirve para reemplazar el token cuando Expo lo rota.
   */
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._:-]+$/, {
    message: 'El identificador del dispositivo no es válido.',
  })
  dispositivoId: string;
}

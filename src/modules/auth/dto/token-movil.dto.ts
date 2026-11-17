import { UsuarioPerfilDto } from '../../usuarios/dto/usuario-perfil.dto';

/**
 * Respuesta de `POST /auth/token` para clientes nativos.
 *
 * A diferencia de `AuthResponseDto`, incluye el JWT: la app no puede leer la
 * cookie httpOnly y necesita el token en el cuerpo para mandarlo como
 * `Authorization: Bearer`. No hay cookie en esta respuesta.
 */
export class TokenMovilDto {
  /** JWT firmado con la vigencia móvil (30 días por defecto). */
  token: string;

  /** Segundos de validez, para que la app programe su re-login sin decodificar. */
  expiraEnSegundos: number;

  usuario: UsuarioPerfilDto;
}

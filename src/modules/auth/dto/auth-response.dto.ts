import { UsuarioPerfilDto } from '../../usuarios/dto/usuario-perfil.dto';

/**
 * DTO de respuesta para operaciones de autenticación exitosas.
 * Incluye mensaje descriptivo y datos públicos del perfil del usuario (sin contraseñas).
 */
export class AuthResponseDto {
  message: string;
  usuario: UsuarioPerfilDto;
}

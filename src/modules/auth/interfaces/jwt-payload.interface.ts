/**
 * Representa la estructura de datos almacenada y firmada dentro del token JWT.
 */
export interface JwtPayload {
  /**
   * Identificador único del usuario (sub = subject estándar de JWT).
   */
  sub: number;

  /**
   * Nombre de usuario único del sistema.
   */
  username: string;

  /**
   * Correo electrónico del usuario.
   */
  gmail: string;
}

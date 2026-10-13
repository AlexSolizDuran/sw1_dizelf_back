/**
 * DTO que representa la información pública y segura de la Persona.
 */
export class PersonaPerfilDto {
  id: number;
  nombre: string;
  apellido: string;
  gmail: string;
}

/**
 * DTO de salida para el perfil del Usuario.
 * Garantiza que la entidad de Prisma nunca se exponga directamente
 * y que el hash de la contraseña jamás sea transmitido al cliente.
 */
export class UsuarioPerfilDto {
  id: number;
  username: string;
  persona: PersonaPerfilDto;
}

export class ColaboradorRespuestaDto {
  id: number;
  proyectoId: string;
  usuarioId: number;
  username: string;
  gmail: string;

  /**
   * Nombre del permiso tal como está en la tabla `permiso`.
   *
   * Antes era el enum `RolProyecto` de TypeScript. Devolver el dato crudo
   * permite que el frontend reaccione a un permiso nuevo sin que haya que
   * cambiar el enum ni desplegar.
   */
  permiso: string;

  /** Derivado del permiso, para que el front no tenga que replicar la tabla. */
  puedeEditar: boolean;
}

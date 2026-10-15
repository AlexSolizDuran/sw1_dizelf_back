/**
 * De dónde viene el documento que está mostrando el editor.
 *
 * `COLABORATIVO` es el documento vivo (`documento_colaborativo`), que gana
 * sobre `proyecto.esquema_json`. El frontend lo usa para decidir a dónde
 * guarda: el autosave va al documento vivo, nunca al proyecto.
 */
export type OrigenDocumento = 'COLABORATIVO' | 'PROYECTO';

export class ProyectoRespuestaDto {
  id: string;
  nombre: string;
  esquemaJson: Record<string, unknown>;
  creadorId: number;

  /**
   * Nombre del permiso en la tabla, o `CREADOR` si es el dueño.
   *
   * El creador no es un permiso del catálogo: es la propiedad del proyecto,
   * reconocida por `proyecto.creador_id`. Se devuelve como string para que un
   * permiso nuevo llegue al frontend sin cambiar el enum.
   */
  miRol: string;
  totalColaboradores: number;

  /** De qué tabla salió `esquemaJson`. */
  origen: OrigenDocumento;

  /** Derivado de `miRol`, para que el front no replique el catálogo. */
  puedeEditar: boolean;
}

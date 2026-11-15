/**
 * Una fila del historial de guardados manuales.
 *
 * No trae `esquemaJson`: el historial son decenas de escenas completas y
 * listarlas todas sería pesado. El contenido se pide de a uno, al restaurar.
 */
export class VersionRespuestaDto {
  id: number;
  fecha: Date;
  /** Etiqueta opcional que el usuario dio al guardar. */
  nombre: string | null;
}

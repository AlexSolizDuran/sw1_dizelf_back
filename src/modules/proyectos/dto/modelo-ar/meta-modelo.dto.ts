/**
 * Estado del GLB publicado, sin la clave del objeto.
 *
 * La clave no se expone para que el cliente no pueda fabricar URLs ni pedir
 * objetos de otros proyectos: si necesita los bytes, pide `/modelo` y el
 * backend firma la lectura.
 */
export class MetaModeloDto {
  /** `false` mientras el proyecto no se haya publicado nunca en AR. */
  hay: boolean;

  /** 0 si no hay modelo; se incrementa en cada publicación. */
  version: number;

  /** Tamaño real del GLB en bytes. */
  bytes: number;

  /** ISO de la última publicación, o `null`. */
  actualizado: string | null;
}

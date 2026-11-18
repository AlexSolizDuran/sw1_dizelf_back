export class ProyectoListaDto {
  id: string;
  nombre: string;
  creadorId: number;
  /** CREADOR si es el dueño; si no, el nombre del permiso en la base. */
  miRol: string;
  totalColaboradores: number;
  /** Derivado de `miRol`: si puede abrir el plano en modo edición. */
  puedeEditar: boolean;
  /**
   * `true` si hay un GLB publicado. La app móvil no muestra los accesos a AR ni
   * a la vista 3D cuando falta: sin modelo no hay nada que abrir.
   */
  tieneModelo: boolean;
}

export class ProyectosPaginadosDto {
  datos: ProyectoListaDto[];
  total: number;
  pagina: number;
  limite: number;
}

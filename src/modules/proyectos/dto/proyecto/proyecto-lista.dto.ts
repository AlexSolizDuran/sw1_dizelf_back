export class ProyectoListaDto {
  id: string;
  nombre: string;
  creadorId: number;
  /** CREADOR si es el dueño; si no, el nombre del permiso en la base. */
  miRol: string;
  totalColaboradores: number;
  /** Derivado de `miRol`: si puede abrir el plano en modo edición. */
  puedeEditar: boolean;
}

export class ProyectosPaginadosDto {
  datos: ProyectoListaDto[];
  total: number;
  pagina: number;
  limite: number;
}

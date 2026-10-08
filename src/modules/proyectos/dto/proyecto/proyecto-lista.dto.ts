import type { RolProyecto } from '../../enums/rol-proyecto.enum';

export class ProyectoListaDto {
  id: string;
  nombre: string;
  creadorId: number;
  miRol: RolProyecto;
  totalColaboradores: number;
}

export class ProyectosPaginadosDto {
  datos: ProyectoListaDto[];
  total: number;
  pagina: number;
  limite: number;
}

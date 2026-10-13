import type { RolProyecto } from '../../enums/rol-proyecto.enum';

export class ProyectoRespuestaDto {
  id: string;
  nombre: string;
  esquemaJson: Record<string, unknown>;
  creadorId: number;
  miRol: RolProyecto;
  totalColaboradores: number;
}

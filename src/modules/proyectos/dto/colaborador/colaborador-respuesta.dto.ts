import type { RolProyecto } from '../../enums/rol-proyecto.enum';

export class ColaboradorRespuestaDto {
  id: number;
  proyectoId: string;
  usuarioId: number;
  username: string;
  gmail: string;
  rol: RolProyecto;
}

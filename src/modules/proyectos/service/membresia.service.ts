import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CAPACIDADES_CREADOR,
  capacidadesDe,
  type Capacidades,
} from '../../../common/capacidades/capacidades-proyecto';

export type MiembroProyecto = Capacidades & {
  /** `CREADOR` si es el dueño; si no, el nombre del permiso en la base. */
  rol: string;
  esCreador: boolean;
};

/**
 * Resultado de resolver pertenencia.
 *
 * Distingue "no existe" de "no sos miembro" porque las respuestas tienen que
 * ser distintas: un 403 dice que el proyecto existe, y eso ya es información
 * para quien no tiene nada que ver con él. Un 404 no la da.
 */
export type ResultadoMembresia =
  | { estado: 'NO_EXISTE' }
  | { estado: 'NO_MIEMBRO' }
  | ({ estado: 'MIEMBRO' } & MiembroProyecto);

/**
 * Resuelve la pertenencia de un usuario a un proyecto contra la base.
 *
 * Vive aparte porque la consultan dos caminos distintos: el guard HTTP y el
 * gateway de WebSocket. El handshake no pasa por el guard, así que sin esto la
 * presencia sería una puerta atrás —abrir un socket a un proyecto ajeno solo
 * con conocer el id.
 *
 * Una sola consulta: proyecto, creador y el permiso del colaborador.
 */
@Injectable()
export class MembresiaService {
  constructor(private readonly prisma: PrismaService) {}

  async resolver(
    proyectoId: string,
    usuarioId: number,
  ): Promise<ResultadoMembresia> {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: {
        id: true,
        creadorId: true,
        colaboradores: {
          where: { usuarioId },
          select: { permiso: { select: { nombre: true } } },
          take: 1,
        },
      },
    });

    if (!proyecto) return { estado: 'NO_EXISTE' };

    if (proyecto.creadorId === usuarioId) {
      return {
        estado: 'MIEMBRO',
        rol: 'CREADOR',
        esCreador: true,
        ...CAPACIDADES_CREADOR,
      };
    }

    const permiso = proyecto.colaboradores[0]?.permiso?.nombre;
    if (!permiso) return { estado: 'NO_MIEMBRO' };

    return {
      estado: 'MIEMBRO',
      rol: permiso,
      esCreador: false,
      ...capacidadesDe(permiso),
    };
  }

  /** Nombre visible de un usuario, para la lista de presencia. */
  async nombreDe(usuarioId: number): Promise<string> {
    const mapa = await this.nombresDe([usuarioId]);
    return mapa.get(usuarioId) ?? `Usuario ${usuarioId}`;
  }

  /**
   * Nombres de varios usuarios en UNA consulta.
   *
   * Existe porque la presencia difunde la lista entera en cada conexión y
   * desconexión. Con `nombreDe` por persona eran N consultas EN SERIE: con diez
   * gente son diez round-trips encadenados, y abrir el proyecto disparaba uno
   * por entrada, con el `await` frenando el handler de conexión.
   */
  async nombresDe(usuarioIds: number[]): Promise<Map<number, string>> {
    const unicos = [...new Set(usuarioIds)];
    if (unicos.length === 0) return new Map();

    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: unicos } },
      // `id`, no `usuario_id`: eso es el nombre de la columna. El campo de
      // Prisma es `id` y está mapeado con `@map`.
      select: {
        id: true,
        username: true,
        persona: { select: { nombre: true } },
      },
    });

    return new Map(
      usuarios.map((u) => [
        u.id,
        u.persona?.nombre || u.username || `Usuario ${u.id}`,
      ]),
    );
  }
}

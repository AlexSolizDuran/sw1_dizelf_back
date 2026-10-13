import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ActualizarProyectoDto } from '../dto/proyecto/actualizar-proyecto.dto';
import { ConsultarProyectosDto } from '../dto/proyecto/consultar-proyectos.dto';
import { CrearProyectoDto } from '../dto/proyecto/crear-proyecto.dto';
import {
  ProyectoListaDto,
  ProyectosPaginadosDto,
} from '../dto/proyecto/proyecto-lista.dto';
import { ProyectoRespuestaDto } from '../dto/proyecto/proyecto-respuesta.dto';
import { RolProyecto } from '../enums/rol-proyecto.enum';

type ProyectoBase = {
  id: string;
  nombre: string;
  esquemaJson: unknown;
  creadorId: number;
};

type ProyectoListaBase = {
  id: string;
  nombre: string;
  creadorId: number;
};

@Injectable()
export class ProyectosService {
  private readonly logger = new Logger(ProyectosService.name);

  constructor(private readonly prisma: PrismaService) {}

  async crear(
    creadorId: number,
    dto: CrearProyectoDto,
  ): Promise<ProyectoRespuestaDto> {
    const proyecto = await this.prisma.proyecto.create({
      data: {
        nombre: dto.nombre.trim(),
        esquemaJson: dto.esquemaJson as unknown as Prisma.InputJsonValue,
        creadorId,
      },
      select: {
        id: true,
        nombre: true,
        esquemaJson: true,
        creadorId: true,
      },
    });

    this.logger.log(
      `Proyecto creado: ${proyecto.id} por usuario ${creadorId}.`,
    );

    return this.mapearRespuesta(proyecto, RolProyecto.CREADOR, 0);
  }

  async listarParaUsuario(
    usuarioId: number,
    consulta: ConsultarProyectosDto,
  ): Promise<ProyectosPaginadosDto> {
    const pagina = consulta.pagina ?? 1;
    const limite = consulta.limite ?? 10;

    const filtro = {
      OR: [
        { creadorId: usuarioId },
        { colaboradores: { some: { usuarioId } } },
      ],
    };

    const [total, proyectos] = await Promise.all([
      this.prisma.proyecto.count({ where: filtro }),
      this.prisma.proyecto.findMany({
        where: filtro,
        orderBy: { nombre: 'asc' },
        skip: (pagina - 1) * limite,
        take: limite,
        select: {
          id: true,
          nombre: true,
          creadorId: true,
          colaboradores: {
            where: { usuarioId },
            select: { usuarioId: true },
          },
          _count: { select: { colaboradores: true } },
        },
      }),
    ]);

    const datos: ProyectoListaDto[] = proyectos.map((proyecto) => {
      const rol = this.resolverRol(proyecto, usuarioId);
      if (!rol) {
        throw new ForbiddenException(
          'Acceso denegado: No es miembro de este proyecto.',
        );
      }
      return this.mapearLista(proyecto, rol, proyecto._count.colaboradores);
    });

    return { datos, total, pagina, limite };
  }

  async obtenerParaMiembro(
    proyectoId: string,
    usuarioId: number,
  ): Promise<ProyectoRespuestaDto> {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: {
        id: true,
        nombre: true,
        esquemaJson: true,
        creadorId: true,
        colaboradores: {
          where: { usuarioId },
          select: { usuarioId: true },
        },
        _count: { select: { colaboradores: true } },
      },
    });

    if (!proyecto) {
      throw new NotFoundException(
        `Proyecto con ID ${proyectoId} no encontrado.`,
      );
    }

    const rol = this.resolverRol(proyecto, usuarioId);
    if (!rol) {
      throw new ForbiddenException(
        'Acceso denegado: No es miembro de este proyecto.',
      );
    }

    return this.mapearRespuesta(proyecto, rol, proyecto._count.colaboradores);
  }

  async actualizarParaMiembro(
    proyectoId: string,
    usuarioId: number,
    dto: ActualizarProyectoDto,
  ): Promise<ProyectoRespuestaDto> {
    await this.obtenerParaMiembro(proyectoId, usuarioId);

    const proyecto = await this.prisma.proyecto.update({
      where: { id: proyectoId },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        ...(dto.esquemaJson !== undefined
          ? {
              esquemaJson: dto.esquemaJson as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
      select: {
        id: true,
        nombre: true,
        esquemaJson: true,
        creadorId: true,
      },
    });

    const rol =
      proyecto.creadorId === usuarioId
        ? RolProyecto.CREADOR
        : RolProyecto.INVITADO;

    const totalColaboradores = await this.prisma.colaborador.count({
      where: { proyectoId },
    });

    this.logger.log(
      `Proyecto ${proyectoId} actualizado por usuario ${usuarioId} (rol ${rol}).`,
    );

    return this.mapearRespuesta(proyecto, rol, totalColaboradores);
  }

  async eliminarComoCreador(
    proyectoId: string,
    usuarioId: number,
  ): Promise<{ message: string }> {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: { id: true, creadorId: true },
    });

    if (!proyecto) {
      throw new NotFoundException(
        `Proyecto con ID ${proyectoId} no encontrado.`,
      );
    }

    if (proyecto.creadorId !== usuarioId) {
      this.logger.warn(
        `Eliminación denegada: usuario ${usuarioId} no es creador del proyecto ${proyectoId}.`,
      );
      throw new ForbiddenException(
        'Acceso denegado: Solo el usuario con rol CREADOR puede eliminar el proyecto.',
      );
    }

    await this.prisma.proyecto.delete({ where: { id: proyectoId } });

    this.logger.log(
      `Proyecto ${proyectoId} eliminado por su creador ${usuarioId}.`,
    );

    return { message: 'Proyecto eliminado exitosamente.' };
  }

  private resolverRol(
    proyecto: { creadorId: number; colaboradores?: { usuarioId: number }[] },
    usuarioId: number,
  ): RolProyecto | null {
    if (proyecto.creadorId === usuarioId) {
      return RolProyecto.CREADOR;
    }
    if (
      proyecto.colaboradores &&
      proyecto.colaboradores.some((c) => c.usuarioId === usuarioId)
    ) {
      return RolProyecto.INVITADO;
    }
    return null;
  }

  private mapearLista(
    proyecto: ProyectoListaBase,
    rol: RolProyecto,
    totalColaboradores: number,
  ): ProyectoListaDto {
    return {
      id: proyecto.id,
      nombre: proyecto.nombre,
      creadorId: proyecto.creadorId,
      miRol: rol,
      totalColaboradores,
    };
  }

  private mapearRespuesta(
    proyecto: ProyectoBase,
    rol: RolProyecto,
    totalColaboradores: number,
  ): ProyectoRespuestaDto {
    return {
      id: proyecto.id,
      nombre: proyecto.nombre,
      esquemaJson: (proyecto.esquemaJson ?? {}) as Record<string, unknown>,
      creadorId: proyecto.creadorId,
      miRol: rol,
      totalColaboradores,
    };
  }
}

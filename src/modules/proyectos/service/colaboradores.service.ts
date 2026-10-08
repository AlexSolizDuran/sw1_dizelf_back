import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RolProyecto } from '../enums/rol-proyecto.enum';
import { AgregarColaboradorDto } from '../dto/colaborador/agregar-colaborador.dto';
import { ColaboradorRespuestaDto } from '../dto/colaborador/colaborador-respuesta.dto';

type ColaboradorBase = {
  id: number;
  proyectoId: string;
  usuarioId: number;
  username: string;
  gmail: string;
};

/**
 * Servicio del subdominio de Colaboradores dentro de Proyectos.
 * Solo el creador puede agregar o eliminar; cualquier miembro puede listar.
 * El rol asignado siempre es INVITADO (permisoId se resuelve dinámicamente
 * para que agregar roles futuros sea solo un INSERT en permiso).
 */
@Injectable()
export class ColaboradoresService {
  private readonly logger = new Logger(ColaboradoresService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Agrega un colaborador al proyecto por username o gmail exactos.
   * Doble capa de autorización: el Guard ya exige CREADOR, aquí se re-verifica.
   *
   * @param proyectoId Identificador del proyecto.
   * @param creadorId Identificador del usuario que invita (debe ser el creador).
   * @param dto Identificador del invitado (username o gmail).
   * @throws NotFoundException si el proyecto, el usuario o el permiso no existen.
   * @throws ForbiddenException si quien invita no es el creador.
   * @throws ConflictException si se auto-invita o ya es colaborador.
   */
  async agregarComoCreador(
    proyectoId: string,
    creadorId: number,
    dto: AgregarColaboradorDto,
  ): Promise<ColaboradorRespuestaDto> {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: { id: true, creadorId: true },
    });

    if (!proyecto) {
      throw new NotFoundException(
        `Proyecto con ID ${proyectoId} no encontrado.`,
      );
    }

    if (proyecto.creadorId !== creadorId) {
      this.logger.warn(
        `Agregado denegado: usuario ${creadorId} no es creador del proyecto ${proyectoId}.`,
      );
      throw new ForbiddenException(
        'Acceso denegado: Solo el usuario con rol CREADOR puede agregar colaboradores.',
      );
    }

    const identificador = dto.identificador.trim();

    const invitado = await this.prisma.usuario.findFirst({
      where: {
        OR: [
          { username: identificador },
          { persona: { gmail: identificador } },
        ],
      },
      select: {
        id: true,
        username: true,
        persona: { select: { gmail: true } },
      },
    });

    if (!invitado) {
      throw new NotFoundException(
        `No existe un usuario con username o correo '${identificador}'.`,
      );
    }

    if (invitado.id === creadorId) {
      throw new ConflictException('El creador ya es miembro del proyecto.');
    }

    const permiso = await this.prisma.permiso.findFirst({
      where: { nombre: RolProyecto.INVITADO },
      select: { id: true },
    });

    if (!permiso) {
      throw new NotFoundException(
        'Rol INVITADO no configurado en la tabla permiso. Ejecute el seed inicial.',
      );
    }

    try {
      const creado = await this.prisma.colaborador.create({
        data: {
          proyectoId,
          usuarioId: invitado.id,
          permisoId: permiso.id,
        },
        select: {
          id: true,
          proyectoId: true,
          usuarioId: true,
        },
      });

      this.logger.log(
        `Colaborador ${invitado.id} agregado al proyecto ${proyectoId} por creador ${creadorId}.`,
      );

      return this.mapearRespuesta(
        {
          id: creado.id,
          proyectoId: creado.proyectoId,
          usuarioId: creado.usuarioId,
          username: invitado.username,
          gmail: invitado.persona.gmail,
        },
        RolProyecto.INVITADO,
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'El usuario ya es colaborador del proyecto.',
        );
      }
      throw error;
    }
  }

  /**
   * Elimina un colaborador del proyecto. Solo el creador.
   *
   * @param proyectoId Identificador del proyecto.
   * @param creadorId Identificador del usuario que elimina (debe ser el creador).
   * @param usuarioId Identificador del colaborador a eliminar.
   * @throws NotFoundException si el proyecto o la colaboración no existen.
   * @throws ForbiddenException si quien elimina no es el creador.
   */
  async eliminarComoCreador(
    proyectoId: string,
    creadorId: number,
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

    if (proyecto.creadorId !== creadorId) {
      this.logger.warn(
        `Eliminación denegada: usuario ${creadorId} no es creador del proyecto ${proyectoId}.`,
      );
      throw new ForbiddenException(
        'Acceso denegado: Solo el usuario con rol CREADOR puede eliminar colaboradores.',
      );
    }

    const borrado = await this.prisma.colaborador.deleteMany({
      where: { proyectoId, usuarioId },
    });

    if (borrado.count === 0) {
      throw new NotFoundException(
        `El usuario ${usuarioId} no es colaborador del proyecto ${proyectoId}.`,
      );
    }

    this.logger.log(
      `Colaborador ${usuarioId} eliminado del proyecto ${proyectoId} por creador ${creadorId}.`,
    );

    return { message: 'Colaborador eliminado exitosamente.' };
  }

  /**
   * Lista los colaboradores del proyecto. Cualquier miembro (CREADOR o INVITADO).
   *
   * @param proyectoId Identificador del proyecto.
   */
  async listarParaMiembro(
    proyectoId: string,
  ): Promise<ColaboradorRespuestaDto[]> {
    const colaboradores = await this.prisma.colaborador.findMany({
      where: { proyectoId },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        proyectoId: true,
        usuarioId: true,
        permiso: { select: { nombre: true } },
        usuario: {
          select: {
            username: true,
            persona: { select: { gmail: true } },
          },
        },
      },
    });

    return colaboradores.map((c) =>
      this.mapearRespuesta(
        {
          id: c.id,
          proyectoId: c.proyectoId,
          usuarioId: c.usuarioId,
          username: c.usuario.username,
          gmail: c.usuario.persona.gmail,
        },
        c.permiso.nombre as RolProyecto,
      ),
    );
  }

  private mapearRespuesta(
    colaborador: ColaboradorBase,
    rol: RolProyecto,
  ): ColaboradorRespuestaDto {
    return {
      id: colaborador.id,
      proyectoId: colaborador.proyectoId,
      usuarioId: colaborador.usuarioId,
      username: colaborador.username,
      gmail: colaborador.gmail,
      rol,
    };
  }
}

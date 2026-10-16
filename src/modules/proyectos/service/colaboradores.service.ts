import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AgregarColaboradorDto } from '../dto/colaborador/agregar-colaborador.dto';
import {
  PERMISO_POR_DEFECTO,
  capacidadesDe,
} from '../../../common/capacidades/capacidades-proyecto';
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
 * El permiso asignado viene del DTO (`EDITOR` o `LECTOR`) y se resuelve por
 * nombre contra la tabla `permiso`, de modo que agregar un permiso al
 * catálogo es solo un INSERT y no un deploy.
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
        'Acceso denegado: Solo el creador del proyecto puede agregar colaboradores.',
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

    const nombrePermiso = dto.rol ?? PERMISO_POR_DEFECTO;
    const permiso = await this.prisma.permiso.findUnique({
      where: { nombre: nombrePermiso },
      select: { id: true },
    });

    if (!permiso) {
      throw new NotFoundException(
        `Permiso ${nombrePermiso} no configurado en la tabla permiso. Ejecute el seed.`,
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
        nombrePermiso,
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
   * Cambia el permiso de un colaborador existente. Solo el creador.
   *
   * Es el equivalente a quitar y volver a invitar, sin perder la fila ni
   * mandar dos requests. Igual que al invitar, la doble capa de autorización:
   * el Guard ya exige CREADOR, aquí se re-verifica.
   *
   * @throws NotFoundException si el proyecto, el permiso o la colaboración no existen.
   * @throws ForbiddenException si quien cambia no es el creador.
   */
  async actualizarPermisoComoCreador(
    proyectoId: string,
    creadorId: number,
    usuarioId: number,
    rol: string,
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
        `Cambio de permiso denegado: usuario ${creadorId} no es creador del proyecto ${proyectoId}.`,
      );
      throw new ForbiddenException(
        'Acceso denegado: Solo el creador del proyecto puede gestionar colaboradores.',
      );
    }

    const permiso = await this.prisma.permiso.findUnique({
      where: { nombre: rol },
      select: { id: true },
    });
    if (!permiso) {
      throw new NotFoundException(
        `Permiso ${rol} no configurado en la tabla permiso. Ejecute el seed.`,
      );
    }

    const colaborador = await this.prisma.colaborador.findFirst({
      where: { proyectoId, usuarioId },
      select: { id: true },
    });
    if (!colaborador) {
      throw new NotFoundException(
        `El usuario ${usuarioId} no es colaborador del proyecto ${proyectoId}.`,
      );
    }

    const actualizado = await this.prisma.colaborador.update({
      where: { id: colaborador.id },
      data: { permisoId: permiso.id },
      select: {
        id: true,
        proyectoId: true,
        usuarioId: true,
        usuario: {
          select: {
            username: true,
            persona: { select: { gmail: true } },
          },
        },
      },
    });

    this.logger.log(
      `Permiso de ${usuarioId} en el proyecto ${proyectoId} cambiado a ${rol} por creador ${creadorId}.`,
    );

    return this.mapearRespuesta(
      {
        id: actualizado.id,
        proyectoId: actualizado.proyectoId,
        usuarioId: actualizado.usuarioId,
        username: actualizado.usuario.username,
        gmail: actualizado.usuario.persona.gmail,
      },
      rol,
    );
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
        'Acceso denegado: Solo el creador del proyecto puede eliminar colaboradores.',
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
   * Lista los colaboradores del proyecto. Cualquier miembro del proyecto.
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
        c.permiso.nombre,
      ),
    );
  }

  /**
   * El permiso viaja como el nombre crudo de la tabla, más `puedeEditar`
   * derivado. El frontend no tiene que replicar el catálogo para saber si
   * puede escribir: si mañana aparece ADMINISTRADOR, el front lo recibe bien.
   */
  private mapearRespuesta(
    colaborador: ColaboradorBase,
    permiso: string,
  ): ColaboradorRespuestaDto {
    return {
      id: colaborador.id,
      proyectoId: colaborador.proyectoId,
      usuarioId: colaborador.usuarioId,
      username: colaborador.username,
      gmail: colaborador.gmail,
      permiso,
      puedeEditar: capacidadesDe(permiso).puedeEditar,
    };
  }
}

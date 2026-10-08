import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RolProyecto } from '../../modules/proyectos/enums/rol-proyecto.enum';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
import { ROLES_PROYECTO_KEY } from '../decorators/roles-proyecto.decorator';

type SolicitudConUsuario = Request & {
  user?: JwtPayload;
  rolProyecto?: RolProyecto;
};

@Injectable()
export class ProyectoRolGuard implements CanActivate {
  private readonly logger = new Logger(ProyectoRolGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const rolesExigidos =
      this.reflector.getAllAndOverride<RolProyecto[]>(ROLES_PROYECTO_KEY, [
        contexto.getHandler(),
        contexto.getClass(),
      ]) ?? [];

    const solicitud = contexto.switchToHttp().getRequest<SolicitudConUsuario>();
    const params = solicitud.params as Record<string, string | undefined>;
    const proyectoId = params?.id ?? params?.proyectoId;

    if (!proyectoId) {
      return true;
    }

    const usuario = solicitud.user;
    if (!usuario) {
      throw new UnauthorizedException(
        'Acceso no autorizado: Debe iniciar sesión para continuar.',
      );
    }

    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: {
        id: true,
        creadorId: true,
        colaboradores: {
          where: { usuarioId: usuario.sub },
          select: { usuarioId: true },
        },
      },
    });

    if (!proyecto) {
      throw new NotFoundException(
        `Proyecto con ID ${proyectoId} no encontrado.`,
      );
    }

    const rol: RolProyecto | null =
      proyecto.creadorId === usuario.sub
        ? RolProyecto.CREADOR
        : proyecto.colaboradores.length > 0
          ? RolProyecto.INVITADO
          : null;

    if (!rol) {
      this.logger.warn(
        `Acceso denegado: usuario ${usuario.sub} no es miembro del proyecto ${proyectoId}.`,
      );
      throw new ForbiddenException(
        'Acceso denegado: No es miembro de este proyecto.',
      );
    }

    solicitud.rolProyecto = rol;

    if (rolesExigidos.length > 0 && !rolesExigidos.includes(rol)) {
      this.logger.warn(
        `Acceso denegado: usuario ${usuario.sub} con rol ${rol} intentó acceder al proyecto ${proyectoId} (requiere: ${rolesExigidos.join(', ')}).`,
      );
      throw new ForbiddenException(
        rolesExigidos.length === 1 && rolesExigidos[0] === RolProyecto.CREADOR
          ? 'Acceso denegado: Solo el usuario con rol CREADOR puede realizar esta acción.'
          : `Acceso denegado: Se requiere uno de los roles: ${rolesExigidos.join(', ')}.`,
      );
    }

    return true;
  }
}

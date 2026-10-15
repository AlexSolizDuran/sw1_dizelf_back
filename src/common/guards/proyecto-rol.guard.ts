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
import {
  CAPACIDADES_CREADOR,
  capacidadesDe,
  type Capacidades,
} from '../capacidades/capacidades-proyecto';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
import { CAPACIDAD_PROYECTO_KEY } from '../decorators/capacidad-proyecto.decorator';

export type Capacidad = 'leer' | 'editar' | 'invitar' | 'administrar';

type SolicitudConUsuario = Request & {
  user?: JwtPayload;
  /** Capacidades ya resueltas contra la base. */
  capacidadesProyecto?: Capacidades;
  /** `CREADOR` si es dueño; si no, el nombre del permiso de la tabla. */
  rolProyecto?: string;
};

/**
 * Guardia de proyecto: resuelve la membresía contra la base y exige una
 * capacidad concreta.
 *
 * Antes comparaba contra el enum `RolProyecto` sin mirar la tabla `permiso`:
 * seleccionaba `{ usuarioId: true }` y deducía el rol por la forma de la
 * relación. Sembrar `LECTOR` en `permiso` no concedía nada, porque todo
 * colaborador quedaba clasificado como `INVITADO` sin consultar su permiso.
 *
 * Ahora trae `permiso.nombre` de la base y traduce a capacidades. El catálogo
 * es dato: agregar un permiso es un `INSERT`, no un deploy.
 */
@Injectable()
export class ProyectoRolGuard implements CanActivate {
  private readonly logger = new Logger(ProyectoRolGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const capacidadesExigidas =
      this.reflector.getAllAndOverride<Capacidad[]>(CAPACIDAD_PROYECTO_KEY, [
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
          select: { permiso: { select: { nombre: true } } },
          take: 1,
        },
      },
    });

    if (!proyecto) {
      throw new NotFoundException(
        `Proyecto con ID ${proyectoId} no encontrado.`,
      );
    }

    const esCreador = proyecto.creadorId === usuario.sub;
    const permiso = proyecto.colaboradores[0]?.permiso?.nombre ?? null;

    if (!esCreador && !permiso) {
      this.logger.warn(
        `Acceso denegado: usuario ${usuario.sub} no es miembro del proyecto ${proyectoId}.`,
      );
      throw new ForbiddenException(
        'Acceso denegado: No es miembro de este proyecto.',
      );
    }

    const capacidades = esCreador
      ? CAPACIDADES_CREADOR
      : capacidadesDe(permiso);

    // Se adjuntan a la solicitud para que los servicios no vuelvan a consultar.
    solicitud.capacidadesProyecto = capacidades;
    solicitud.rolProyecto = esCreador ? 'CREADOR' : permiso;

    const faltante = capacidadesExigidas.find(
      (capacidad) => !cumple(capacidades, capacidad),
    );

    if (faltante) {
      this.logger.warn(
        `Acceso denegado: usuario ${usuario.sub} con rol ${solicitud.rolProyecto} intentó ${contexto.getClass().name}.${contexto.getHandler().name} (requiere: ${faltante}).`,
      );
      throw new ForbiddenException(mensajeDeFalta(faltante));
    }

    return true;
  }
}

function cumple(capacidades: Capacidades, capacidad: Capacidad): boolean {
  switch (capacidad) {
    case 'leer':
      return true;
    case 'editar':
      return capacidades.puedeEditar;
    case 'invitar':
      return capacidades.puedeInvitar;
    case 'administrar':
      return capacidades.puedeAdministrar;
  }
}

function mensajeDeFalta(capacidad: Capacidad): string {
  switch (capacidad) {
    case 'editar':
      return 'Acceso denegado: Tu permiso en este proyecto es de solo lectura.';
    case 'invitar':
      return 'Acceso denegado: Solo el creador del proyecto puede invitar colaboradores.';
    case 'administrar':
      return 'Acceso denegado: Solo el creador del proyecto puede administrarlo.';
    default:
      return 'Acceso denegado.';
  }
}

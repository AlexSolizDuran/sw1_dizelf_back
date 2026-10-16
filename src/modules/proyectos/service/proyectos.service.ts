import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  CAPACIDADES_CREADOR,
  capacidadesDe,
} from '../../../common/capacidades/capacidades-proyecto';
import { ActualizarProyectoDto } from '../dto/proyecto/actualizar-proyecto.dto';
import { ConsultarProyectosDto } from '../dto/proyecto/consultar-proyectos.dto';
import { CrearProyectoDto } from '../dto/proyecto/crear-proyecto.dto';
import {
  ProyectoListaDto,
  ProyectosPaginadosDto,
} from '../dto/proyecto/proyecto-lista.dto';
import {
  ProyectoRespuestaDto,
  type OrigenDocumento,
} from '../dto/proyecto/proyecto-respuesta.dto';
import { VersionRespuestaDto } from '../dto/proyecto/version-respuesta.dto';
import { SyncGateway, type EscenaPlana } from '../sync/sync.gateway';
import { DocumentoService } from './documento.service';

/**
 * Estado que devuelve el guard en la solicitud.
 *
 * El guard ya resolvió la membresía contra la base; repetirla acá sería una
 * consulta de más por request.
 */
type Miembro = { rol: string; puedeEditar: boolean };

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly documento: DocumentoService,
    private readonly sync: SyncGateway,
  ) {}

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

    return this.mapearRespuesta(
      { ...proyecto, esquemaJson: proyecto.esquemaJson },
      { rol: 'CREADOR', ...CAPACIDADES_CREADOR },
      0,
      proyecto.esquemaJson,
      'PROYECTO',
    );
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
            select: { permiso: { select: { nombre: true } } },
          },
          _count: { select: { colaboradores: true } },
        },
      }),
    ]);

    const datos: ProyectoListaDto[] = proyectos.map((proyecto) => {
      const rol = this.rolDe(
        proyecto.creadorId === usuarioId,
        proyecto.colaboradores[0]?.permiso?.nombre,
      );
      if (!rol) {
        throw new ForbiddenException(
          'Acceso denegado: No es miembro de este proyecto.',
        );
      }
      return this.mapearLista(proyecto, rol, proyecto._count.colaboradores);
    });

    return { datos, total, pagina, limite };
  }

  /**
   * Detalle del proyecto para un miembro.
   *
   * Devuelve el documento vivo si existe: `documento_colaborativo` gana sobre
   * `proyecto.esquema_json`, que queda como el último guardado consolidado. El
   * campo `origen` le dice al frontend de dónde salió, para que el autosave
   * escriba en la fila correcta en vez de pisar el proyecto.
   */
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
          select: { permiso: { select: { nombre: true } } },
          take: 1,
        },
        documentos: { select: { esquemaJson: true }, take: 1 },
        _count: { select: { colaboradores: true } },
      },
    });

    if (!proyecto) {
      throw new NotFoundException(
        `Proyecto con ID ${proyectoId} no encontrado.`,
      );
    }

    const rol = this.rolDe(
      proyecto.creadorId === usuarioId,
      proyecto.colaboradores[0]?.permiso?.nombre,
    );
    if (!rol) {
      throw new ForbiddenException(
        'Acceso denegado: No es miembro de este proyecto.',
      );
    }

    const documentoVivo = proyecto.documentos[0]?.esquemaJson;

    return this.mapearRespuesta(
      proyecto,
      rol,
      proyecto._count.colaboradores,
      documentoVivo ?? proyecto.esquemaJson,
      documentoVivo ? 'COLABORATIVO' : 'PROYECTO',
    );
  }

  /**
   * Escritura del autosave (el editor llama ~1 vez por segundo).
   *
   * `esquemaJson` va al documento vivo, NO al proyecto. El proyecto solo se
   * toca en `guardarVersion`, que es el guardado manual: ahí se crea la fila en
   * `version` y se consolida `proyecto.esquema_json`.
   *
   * `upsert` porque el documento vivo se crea con la primera edición: hasta
   * entonces el editor abre siempre el documento del proyecto.
   */
  async actualizarParaMiembro(
    proyectoId: string,
    usuarioId: number,
    dto: ActualizarProyectoDto,
  ): Promise<ProyectoRespuestaDto> {
    await this.obtenerParaMiembro(proyectoId, usuarioId);

    if (dto.esquemaJson !== undefined) {
      await this.prisma.documentoColaborativo.upsert({
        where: { proyectoId },
        create: {
          proyectoId,
          usuarioId,
          esquemaJson: dto.esquemaJson as unknown as Prisma.InputJsonValue,
        },
        update: {
          usuarioId,
          esquemaJson: dto.esquemaJson as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // El nombre sí sigue siendo del proyecto: no es del documento vivo.
    if (dto.nombre !== undefined) {
      await this.prisma.proyecto.update({
        where: { id: proyectoId },
        data: { nombre: dto.nombre.trim() },
      });
    }

    this.logger.log(
      `Documento de ${proyectoId} actualizado por usuario ${usuarioId}.`,
    );

    return this.obtenerParaMiembro(proyectoId, usuarioId);
  }

  /**
   * Guardado manual: consolida.
   *
   * Crea una fila en `version` con el documento vigente y actualiza
   * `proyecto.esquema_json` con el mismo contenido. A partir de acá el proyecto
   * queda respaldado: si se pierde la fila de `documento_colaborativo`, se
   * recupera desde la última versión guardada.
   *
   * @param nombre Etiqueta opcional para reconocer la versión en el historial.
   */
  async guardarVersion(
    proyectoId: string,
    usuarioId: number,
    nombre?: string,
  ): Promise<VersionRespuestaDto> {
    await this.obtenerParaMiembro(proyectoId, usuarioId);

    const proyecto = await this.prisma.proyecto.findUniqueOrThrow({
      where: { id: proyectoId },
      select: { esquemaJson: true },
    });

    const vigente = await this.prisma.documentoColaborativo.findUnique({
      where: { proyectoId },
      select: { esquemaJson: true },
    });

    // Sin documento vivo se versiona el proyecto: es el único estado que hay.
    const contenido = vigente?.esquemaJson ?? proyecto.esquemaJson;

    const [version] = await this.prisma.$transaction([
      this.prisma.version.create({
        data: {
          proyectoId,
          nombre: nombre ?? null,
          esquemaJson: contenido as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, fecha: true, nombre: true },
      }),
      this.prisma.proyecto.update({
        where: { id: proyectoId },
        data: { esquemaJson: contenido as unknown as Prisma.InputJsonValue },
      }),
    ]);

    this.logger.log(
      `Versión ${version.id} del proyecto ${proyectoId} guardada por ${usuarioId}${nombre ? ` («${nombre}»)` : ''}.`,
    );

    return { id: version.id, fecha: version.fecha, nombre: version.nombre };
  }

  /**
   * Historial del proyecto, del más nuevo al más viejo.
   *
   * Se apoya en `version_fecha_version_idx`, que ya existe en el esquema.
   * No trae el `esquemaJson`: el historial son decenas de escenas completas y
   * listarlas completas sería pesado. El contenido se pide de a uno.
   */
  async listarVersiones(
    proyectoId: string,
    usuarioId: number,
    limite = 20,
  ): Promise<VersionRespuestaDto[]> {
    await this.obtenerParaMiembro(proyectoId, usuarioId);

    const versiones = await this.prisma.version.findMany({
      where: { proyectoId },
      orderBy: { fecha: 'desc' },
      take: limite,
      select: { id: true, fecha: true, nombre: true },
    });

    return versiones.map((v) => ({
      id: v.id,
      fecha: v.fecha,
      nombre: v.nombre,
    }));
  }

  /**
   * Restaura una versión: escribe su contenido en el documento vivo y consolida
   * el proyecto. Queda un nuevo guardado manual, no un borrado del historial.
   */
  async restaurarVersion(
    proyectoId: string,
    usuarioId: number,
    versionId: number,
  ): Promise<ProyectoRespuestaDto> {
    await this.obtenerParaMiembro(proyectoId, usuarioId);

    const version = await this.prisma.version.findFirst({
      where: { id: versionId, proyectoId },
      select: { id: true, esquemaJson: true },
    });

    if (!version) {
      throw new NotFoundException(
        `La versión ${versionId} no pertenece al proyecto ${proyectoId}.`,
      );
    }

    const contenido = version.esquemaJson as unknown as Prisma.InputJsonValue;

    await this.prisma.$transaction([
      this.prisma.documentoColaborativo.upsert({
        where: { proyectoId },
        create: { proyectoId, usuarioId, esquemaJson: contenido },
        update: { usuarioId, esquemaJson: contenido },
      }),
      this.prisma.proyecto.update({
        where: { id: proyectoId },
        data: { esquemaJson: contenido },
      }),
    ]);

    // La base ya quedó con lo restaurado, pero el gateway mantiene el doc vivo
    // en memoria: si no se corrige acá, el próximo guardado o el disconnect lo
    // volvería a pisar con la escena vieja.
    const escena = this.documento.desenvolver(contenido) as EscenaPlana | null;
    this.sync.aplicarRestauracion(proyectoId, escena);

    this.logger.log(
      `Versión ${versionId} del proyecto ${proyectoId} restaurada por ${usuarioId}.`,
    );

    return this.obtenerParaMiembro(proyectoId, usuarioId);
  }

  /**
   * Renombra una versión del historial.
   *
   * La etiqueta es solo para reconocerla en la lista; no toca el contenido ni
   * el documento vivo.
   */
  async renombrarVersion(
    proyectoId: string,
    usuarioId: number,
    versionId: number,
    nombre: string,
  ): Promise<VersionRespuestaDto> {
    await this.obtenerParaMiembro(proyectoId, usuarioId);

    const version = await this.prisma.version.findFirst({
      where: { id: versionId, proyectoId },
      select: { id: true },
    });
    if (!version) {
      throw new NotFoundException(
        `La versión ${versionId} no pertenece al proyecto ${proyectoId}.`,
      );
    }

    const actualizada = await this.prisma.version.update({
      where: { id: versionId },
      data: { nombre },
      select: { id: true, fecha: true, nombre: true },
    });

    return {
      id: actualizada.id,
      fecha: actualizada.fecha,
      nombre: actualizada.nombre,
    };
  }

  /**
   * Borra una versión del historial.
   *
   * No toca el documento vivo ni `proyecto.esquema_json`: una versión es un
   * punto de restauración, no el estado actual. Borrarla solo quita la
   * posibilidad de volver a ese punto.
   */
  async eliminarVersion(
    proyectoId: string,
    usuarioId: number,
    versionId: number,
  ): Promise<{ message: string }> {
    await this.obtenerParaMiembro(proyectoId, usuarioId);

    const version = await this.prisma.version.findFirst({
      where: { id: versionId, proyectoId },
      select: { id: true },
    });
    if (!version) {
      throw new NotFoundException(
        `La versión ${versionId} no pertenece al proyecto ${proyectoId}.`,
      );
    }

    await this.prisma.version.delete({ where: { id: versionId } });

    this.logger.log(
      `Versión ${versionId} del proyecto ${proyectoId} eliminada por ${usuarioId}.`,
    );

    return { message: `Versión ${versionId} eliminada.` };
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
        'Acceso denegado: Solo el creador del proyecto puede eliminarlo.',
      );
    }

    await this.prisma.proyecto.delete({ where: { id: proyectoId } });

    this.logger.log(
      `Proyecto ${proyectoId} eliminado por su creador ${usuarioId}.`,
    );

    return { message: 'Proyecto eliminado exitosamente.' };
  }

  /**
   * Rol efectivo: `CREADOR` para el dueño, el nombre del permiso de la base
   * para un colaborador, `null` si no es miembro.
   *
   * El creador no es un permiso del catálogo: es la propiedad del proyecto. Por
   * eso `rolDe` devuelve el string ya resuelto y no consulta nada.
   */
  private rolDe(esCreador: boolean, permiso?: string | null): Miembro | null {
    if (esCreador) {
      return { rol: 'CREADOR', ...CAPACIDADES_CREADOR };
    }
    if (!permiso) {
      return null;
    }
    return { rol: permiso, ...capacidadesDe(permiso) };
  }

  private mapearLista(
    proyecto: ProyectoListaBase,
    miembro: Miembro,
    totalColaboradores: number,
  ): ProyectoListaDto {
    return {
      id: proyecto.id,
      nombre: proyecto.nombre,
      creadorId: proyecto.creadorId,
      miRol: miembro.rol,
      totalColaboradores,
      puedeEditar: miembro.puedeEditar,
    };
  }

  private mapearRespuesta(
    proyecto: ProyectoBase,
    miembro: Miembro,
    totalColaboradores: number,
    esquemaJson: unknown,
    origen: OrigenDocumento,
  ): ProyectoRespuestaDto {
    return {
      id: proyecto.id,
      nombre: proyecto.nombre,
      esquemaJson: (esquemaJson ?? {}) as Record<string, unknown>,
      creadorId: proyecto.creadorId,
      miRol: miembro.rol,
      totalColaboradores,
      origen,
      puedeEditar: miembro.puedeEditar,
    };
  }
}

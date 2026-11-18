import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DispositivosService } from './dispositivos.service';
import { PushService, type MensajePush } from './push.service';

export type TipoAvisoModelo = 'creado' | 'actualizado';

export interface AvisoModelo {
  proyectoId: string;
  /** Usuario que publicó. No recibe su propio aviso. */
  actorId: number;
  version: number;
  tipo: TipoAvisoModelo;
}

/**
 * Avisos de negocio: traduce "se publicó un GLB" a mensajes de push.
 *
 * Destinatarios: creador + colaboradores, sin importar si son `EDITOR` o
 * `LECTOR` (todos los que son miembros pueden abrir la vista 3D/AR), menos el
 * usuario que hizo la publicación.
 *
 * El envío es best-effort. `confirmar()` ya guardó el GLB; si Expo está caído,
 * el usuario igual puede entrar a la app y verlo. El error se registra y no se
 * propaga.
 */
@Injectable()
export class NotificacionesService {
  private readonly logger = new Logger(NotificacionesService.name);

  /**
   * Último aviso por proyecto+usuario. Evita duplicados por doble clic o por
   * dos publicaciones seguidas. Vive en memoria: con una sola instancia de
   * Render alcanza; si se escala horizontalmente, hay que moverlo a la base.
   */
  private readonly ultimoAviso = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly dispositivos: DispositivosService,
    private readonly config: ConfigService,
  ) {}

  async avisarModeloPublicado(aviso: AvisoModelo): Promise<void> {
    try {
      const proyecto = await this.prisma.proyecto.findUnique({
        where: { id: aviso.proyectoId },
        select: {
          nombre: true,
          creadorId: true,
          colaboradores: { select: { usuarioId: true } },
        },
      });

      if (!proyecto) return;

      const destinatarios = new Set<number>([proyecto.creadorId]);
      for (const colaborador of proyecto.colaboradores) {
        destinatarios.add(colaborador.usuarioId);
      }
      destinatarios.delete(aviso.actorId);

      if (destinatarios.size === 0) return;

      const ahora = Date.now();
      const ventana =
        this.config.get<number>('app.pushThrottleSegundos', 60) * 1000;

      this.limpiarThrottle(ahora, ventana);

      const ids: number[] = [];
      for (const usuarioId of destinatarios) {
        const clave = `${aviso.proyectoId}:${usuarioId}`;
        const ultimo = this.ultimoAviso.get(clave) ?? 0;

        if (ahora - ultimo < ventana) continue;

        // Se marca antes de enviar: si dos publicaciones llegan casi juntas,
        // la segunda no duplica el aviso aunque la primera todavía esté en vuelo.
        this.ultimoAviso.set(clave, ahora);
        ids.push(usuarioId);
      }

      if (ids.length === 0) return;

      const dispositivos = await this.prisma.dispositivoPush.findMany({
        where: { usuarioId: { in: ids } },
        select: { token: true },
      });

      if (dispositivos.length === 0) return;

      const mensajes = dispositivos.map((dispositivo) =>
        this.construirMensaje(dispositivo.token, proyecto.nombre, aviso),
      );

      const resultado = await this.push.enviar(mensajes);

      if (resultado.invalidos.length > 0) {
        await this.dispositivos.borrarTokensInvalidos(resultado.invalidos);
      }

      this.logger.log(
        `Push ${aviso.tipo} de ${aviso.proyectoId} v${aviso.version}: ${resultado.enviados}/${mensajes.length} enviados a ${ids.length} usuario(s).`,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo avisar la publicación del modelo ${aviso.proyectoId}.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private construirMensaje(
    token: string,
    nombre: string,
    aviso: AvisoModelo,
  ): MensajePush {
    const titulo =
      aviso.tipo === 'creado' ? 'Modelo 3D listo' : 'Modelo 3D actualizado';

    const cuerpo =
      aviso.tipo === 'creado'
        ? `${nombre} ya se puede ver en 3D y AR.`
        : `${nombre} tiene una nueva versión (v${aviso.version}).`;

    return {
      to: token,
      title: titulo,
      body: cuerpo,
      sound: 'default',
      priority: 'high',
      channelId: 'modelos-ar',
      collapseId: aviso.proyectoId,
      tag: `modelo-ar-${aviso.proyectoId}`,
      data: {
        tipo: 'modelo-ar',
        proyectoId: aviso.proyectoId,
        version: aviso.version,
        // Ruta interna de Expo Router: funciona con la app cerrada y no
        // depende de que el scheme `dizelfar` esté bien resuelto.
        url: `/plano?proyectoId=${aviso.proyectoId}&nombre=${encodeURIComponent(nombre)}`,
      },
    };
  }

  /** Poda entradas viejas para que el mapa no crezca sin límite. */
  private limpiarThrottle(ahora: number, ventana: number): void {
    if (this.ultimoAviso.size < 500) return;

    for (const [clave, marca] of this.ultimoAviso) {
      if (ahora - marca >= ventana) this.ultimoAviso.delete(clave);
    }
  }
}

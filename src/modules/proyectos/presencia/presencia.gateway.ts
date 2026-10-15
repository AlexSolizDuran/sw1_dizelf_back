import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TokenVerificadorService } from '../../../common/auth/token-verificador.service';
import { MembresiaService } from '../service/membresia.service';

/**
 * Qué está haciendo cada persona en el plano ahora mismo.
 *
 * Todo sale de stores que el frontend ya tenía suscritos: `useViewer` para la
 * selección y el nivel, `useEditor` para el modo y la vista. No es el documento
 * —eso lo sincroniza el CRDT—, es el "quién está mirando qué".
 */
export interface EstadoPresencia {
  usuarioId: number;
  nombre: string;
  rol: string;
  puedeEditar: boolean;
  /** Nodo seleccionado en el visor, si hay uno. */
  nodoSeleccionado: string | null;
  /** Nivel abierto. */
  nivelId: string | null;
  /** Edificio abierto. */
  edificioId: string | null;
  /** Modo de la herramienta activa. */
  modo: string | null;
  /** 2d o 3d. */
  vista: string | null;
  actualizadoEn: string;
}

interface EstadoCliente {
  usuarioId: number;
  proyectoId: string;
  puedeEditar: boolean;
}

/**
 * `socket.data` viene como `any` en socket.io. Se accede siempre por acá para
 * no perder el tipado: `data` es un objeto plano controlado por este gateway y
 * leerlo suelto obligaría a castear en cada uso.
 */
interface DatosSocket {
  estado?: EstadoCliente;
  presenciaId?: string;
  ultimoEstado?: EstadoPresencia;
}

// Acepta `Socket` y `RemoteSocket` (lo que devuelve `fetchSockets()`): ambos
// traen `data`, y es lo único que se lee de ellos.
const datos = (socket: { data: unknown }): DatosSocket =>
  socket.data as DatosSocket;

/**
 * Gateway de presencia.
 *
 * Difunde quién está en el proyecto y qué está mirando. NO sincroniza el
 * documento: eso es trabajo del CRDT. Acá no viaja ni un byte del plano, así que
 * un LECTOR recibe exactamente lo mismo que un EDITOR y no puede escribir por
 * este canal.
 *
 * Autenticación en el handshake: el `JwtAuthGuard` es un `CanActivate` y solo
 * corre en el ciclo HTTP, así que un socket sin esta comprobación sería una
 * puerta trasera —conocer el id de un proyecto alcanza para abrirlo. Se lee la
 * cookie httpOnly del handshake y se resuelve la membresía contra la base.
 */
@WebSocketGateway({
  namespace: '/presencia',
  cors: { origin: true, credentials: true },
})
export class PresenciaGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(PresenciaGateway.name);

  @WebSocketServer()
  private server!: Server;

  /**
   * Estado por conexión, guardado en el socket (`data`) y no en un mapa del
   * servidor: si el proceso se reinicia, los sockets también, y no queda un
   * registro con conexiones muertas.
   */
  private connectionId = 0;

  constructor(
    private readonly tokenVerificador: TokenVerificadorService,
    private readonly membresia: MembresiaService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const proyectoId = String(socket.handshake.query?.proyectoId ?? '');
    if (!proyectoId) {
      socket.emit('presencia:error', { mensaje: 'Falta el proyecto.' });
      socket.disconnect(true);
      return;
    }

    const token = await this.tokenVerificador.verificar({
      // El handshake trae la cookie httpOnly igual que una petición: el
      // navegador la manda sola porque el socket se abre al mismo origen.
      cookies: this.leerCookies(socket),
      headers: socket.handshake.headers,
    });

    if (!token) {
      this.logger.warn(
        `Presencia rechazada: sin sesión válida en ${proyectoId}.`,
      );
      socket.emit('presencia:error', { mensaje: 'Sesión no válida.' });
      socket.disconnect(true);
      return;
    }

    const resultado = await this.membresia.resolver(proyectoId, token.sub);
    if (resultado.estado !== 'MIEMBRO') {
      // Mismo mensaje para "no existe" y "no sos miembro": un socket es un
      // canal abierto a cualquiera que conozca el id, así que no se le confirma
      // si el proyecto está.
      this.logger.warn(
        `Presencia rechazada: usuario ${token.sub} en ${proyectoId} (${resultado.estado.toLowerCase()}).`,
      );
      socket.emit('presencia:error', {
        mensaje: 'No podés entrar a este proyecto.',
      });
      socket.disconnect(true);
      return;
    }

    const estado: EstadoCliente = {
      usuarioId: token.sub,
      proyectoId,
      puedeEditar: resultado.puedeEditar,
    };

    datos(socket).estado = estado;
    // Id estable y opaca: el cliente no necesita conocer la secuencia del
    // servidor, solo desuscribirse de la sala cuando se va.
    datos(socket).presenciaId = `p${++this.connectionId}`;
    void socket.join(this.sala(proyectoId));

    this.logger.log(
      `Presencia: usuario ${token.sub} (${resultado.rol}) entró en ${proyectoId}.`,
    );

    await this.difundir(proyectoId);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const estado = datos(socket).estado;
    if (!estado) return;

    this.logger.log(
      `Presencia: usuario ${estado.usuarioId} salió de ${estado.proyectoId}.`,
    );
    await this.difundir(estado.proyectoId);
  }

  /**
   * El cliente reporta a qué está mirando. Se revalida `puedeEditar` en cada
   * mensaje y no solo al conectar: sin eso, abriría el socket con un permiso y
   * seguiría emitiendo tras un cambio de rol.
   */
  @SubscribeMessage('presencia:actualizar')
  async actualizar(
    @ConnectedSocket() socket: Socket,
    @MessageBody() parcial: Partial<EstadoPresencia>,
  ): Promise<void> {
    const estado = datos(socket).estado;
    if (!estado) return;

    if (!estado.puedeEditar) return;

    const actual = await this.membresia.resolver(
      estado.proyectoId,
      estado.usuarioId,
    );
    if (actual.estado !== 'MIEMBRO' || !actual.puedeEditar) {
      socket.emit('presencia:error', {
        mensaje: 'Tu permiso cambió: ya no podés editar.',
      });
      return;
    }

    datos(socket).ultimoEstado = this.normalizar(parcial, estado.usuarioId);
    socket
      .to(this.sala(estado.proyectoId))
      .emit('presencia:cambio', datos(socket).ultimoEstado);
  }

  onModuleDestroy(): void {
    this.logger.log('Presencia: gateway cerrado.');
  }

  private sala(proyectoId: string): string {
    return `proyecto:${proyectoId}`;
  }

  private leerCookies(socket: Socket): Record<string, string | undefined> {
    const cabecera = socket.handshake.headers.cookie;
    if (!cabecera) return {};
    const salida: Record<string, string | undefined> = {};
    for (const parte of cabecera.split(';')) {
      const [clave, ...resto] = parte.trim().split('=');
      if (clave) salida[clave] = decodeURIComponent(resto.join('='));
    }
    return salida;
  }

  /**
   * Compone la lista completa de presentes del proyecto.
   *
   * Se difunde la lista entera en lugar de un delta porque son pocas personas y
   * evita el caso de un cliente que entra a mitad de camino y queda con una
   * presencia desactualizada.
   */
  private async difundir(proyectoId: string): Promise<void> {
    const presentes: EstadoPresencia[] = [];

    for (const socket of await this.server
      .in(this.sala(proyectoId))
      .fetchSockets()) {
      const estado = datos(socket).estado;
      if (!estado) continue;
      const nombre = await this.membresia.nombreDe(estado.usuarioId);
      presentes.push(
        datos(socket).ultimoEstado ?? {
          usuarioId: estado.usuarioId,
          nombre,
          rol: '',
          puedeEditar: estado.puedeEditar,
          nodoSeleccionado: null,
          nivelId: null,
          edificioId: null,
          modo: null,
          vista: null,
          actualizadoEn: new Date().toISOString(),
        },
      );
    }

    this.server.to(this.sala(proyectoId)).emit('presencia:lista', presentes);
  }

  /** Solo deja pasar los campos del contrato; lo demás lo descarta el cliente. */
  private normalizar(
    parcial: Partial<EstadoPresencia>,
    usuarioId: number,
  ): EstadoPresencia {
    const texto = (v: unknown, max = 64): string | null =>
      typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;

    return {
      usuarioId,
      nombre: texto(parcial.nombre, 100) ?? `Usuario ${usuarioId}`,
      rol: texto(parcial.rol, 32) ?? '',
      puedeEditar: parcial.puedeEditar === true,
      nodoSeleccionado: texto(parcial.nodoSeleccionado, 128),
      nivelId: texto(parcial.nivelId, 128),
      edificioId: texto(parcial.edificioId, 128),
      modo: texto(parcial.modo, 64),
      vista: parcial.vista === '3d' ? '3d' : '2d',
      actualizadoEn: new Date().toISOString(),
    };
  }
}

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
  /** Nombre visible. Lo resuelve el servidor, no lo manda el cliente. */
  nombre: string;
  /** Permiso vigente. Se actualiza en vivo con `presencia:permiso`/`difundir`. */
  rol: string;
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
      socket.emit('presencia:error', {
        codigo: 'PROYECTO_FALTANTE',
        mensaje: 'Falta el proyecto.',
      });
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
      socket.emit('presencia:error', {
        codigo: 'SIN_SESION',
        mensaje: 'Sesión no válida.',
      });
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
        codigo: 'SIN_ACCESO',
        mensaje: 'No podés entrar a este proyecto.',
      });
      socket.disconnect(true);
      return;
    }

    // La identidad se resuelve UNA vez, del lado del servidor. El cliente solo
    // reporta qué está mirando; nunca su nombre, rol ni permiso.
    const nombre = await this.membresia.nombreDe(token.sub);
    const estado: EstadoCliente = {
      usuarioId: token.sub,
      proyectoId,
      nombre,
      rol: resultado.rol,
      puedeEditar: resultado.puedeEditar,
    };

    datos(socket).estado = estado;
    // Id estable y opaca: el cliente no necesita conocer la secuencia del
    // servidor, solo desuscribirse de la sala cuando se va.
    datos(socket).presenciaId = `p${++this.connectionId}`;
    // Estado inicial completo: sin esto, hasta el primer movimiento el usuario
    // aparecía en la lista con nombre genérico, rol vacío y solo lectura.
    datos(socket).ultimoEstado = {
      usuarioId: estado.usuarioId,
      nombre: estado.nombre,
      rol: estado.rol,
      puedeEditar: estado.puedeEditar,
      nodoSeleccionado: null,
      nivelId: null,
      edificioId: null,
      modo: null,
      vista: null,
      actualizadoEn: new Date().toISOString(),
    };
    // El `await` es obligatorio: si `join` es asíncrono, `difundir` arma la
    // lista sin este socket y el recién llegado no recibe `presencia:lista`
    // hasta que entre o salga otra persona.
    await socket.join(this.sala(proyectoId));

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

    // Un LECTOR no reporta: su presencia se queda en el estado inicial. Si lo
    // promovieron, `notificarPermiso` ya actualizó este flag.
    if (!estado.puedeEditar) return;

    const actual = await this.membresia.resolver(
      estado.proyectoId,
      estado.usuarioId,
    );
    if (actual.estado !== 'MIEMBRO') {
      socket.emit('presencia:error', {
        codigo: 'SIN_ACCESO',
        mensaje: 'Ya no tenés acceso a este proyecto.',
      });
      socket.disconnect(true);
      return;
    }

    // Se refresca la identidad con lo que dice la base, no con lo que mandó el
    // cliente: el rol pudo cambiar sin que el aviso llegue antes que este
    // mensaje.
    estado.rol = actual.rol;
    estado.puedeEditar = actual.puedeEditar;
    if (!actual.puedeEditar) {
      socket.emit('presencia:error', {
        codigo: 'SIN_PERMISO',
        mensaje: 'Tu permiso cambió: ya no podés editar.',
      });
      return;
    }

    datos(socket).ultimoEstado = this.normalizar(parcial, estado);
    socket
      .to(this.sala(estado.proyectoId))
      .emit('presencia:cambio', datos(socket).ultimoEstado);
  }

  /**
   * Refleja en vivo un cambio de permiso.
   *
   * Actualiza el estado del socket (lo que valida los próximos mensajes) y el
   * último estado difundido, y vuelve a mandar la lista para que todos vean el
   * rol nuevo. El usuario puede estar en varias pestañas: se actualizan todas.
   */
  async notificarPermiso(
    proyectoId: string,
    usuarioId: number,
    rol: string,
    puedeEditar: boolean,
  ): Promise<void> {
    const sockets = await this.server.fetchSockets();
    let toco = false;

    for (const socket of sockets) {
      const estado = datos(socket).estado;
      if (
        !estado ||
        estado.proyectoId !== proyectoId ||
        estado.usuarioId !== usuarioId
      ) {
        continue;
      }

      estado.rol = rol;
      estado.puedeEditar = puedeEditar;
      const ultimo = datos(socket).ultimoEstado;
      if (ultimo) {
        ultimo.rol = rol;
        ultimo.puedeEditar = puedeEditar;
      }
      toco = true;
    }

    if (toco) await this.difundir(proyectoId);
  }

  /**
   * Cierra los sockets de un colaborador eliminado.
   *
   * El `presencia:error` sale antes del `disconnect` para que el cliente sepa
   * que no debe reconectar. El `handleDisconnect` de cada socket vuelve a
   * difundir la lista sin él.
   */
  async expulsar(proyectoId: string, usuarioId: number): Promise<void> {
    const sockets = await this.server.fetchSockets();

    for (const socket of sockets) {
      const estado = datos(socket).estado;
      if (
        !estado ||
        estado.proyectoId !== proyectoId ||
        estado.usuarioId !== usuarioId
      ) {
        continue;
      }

      socket.emit('presencia:error', {
        codigo: 'EXPULSADO',
        mensaje: 'Te quitaron de este proyecto.',
      });
      socket.disconnect(true);
    }
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
    const sockets = await this.server.in(this.sala(proyectoId)).fetchSockets();

    // Los nombres salen en UNA consulta para toda la sala. Antes era una por
    // persona y encadenadas con `await`: con diez gente son diez round-trips
    // en serie, y esto corre en cada conexión y cada desconexión.
    const ids = sockets
      .map((s) => datos(s).estado?.usuarioId)
      .filter((id): id is number => typeof id === 'number');
    const nombres = await this.membresia.nombresDe(ids);

    const presentes: EstadoPresencia[] = [];

    for (const socket of sockets) {
      const estado = datos(socket).estado;
      if (!estado) continue;
      const nombre =
        nombres.get(estado.usuarioId) ?? `Usuario ${estado.usuarioId}`;

      // La identidad sale SIEMPRE del servidor. `ultimoEstado` solo aporta los
      // campos de vista: si se difundiera tal cual, un cliente podría mandar
      // `rol` o `puedeEditar` falsos.
      const base = datos(socket).ultimoEstado;
      if (base) {
        base.nombre = nombre;
        base.rol = estado.rol;
        base.puedeEditar = estado.puedeEditar;
      }

      presentes.push(
        base ?? {
          usuarioId: estado.usuarioId,
          nombre,
          rol: estado.rol,
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

  /**
   * Solo deja pasar los campos de vista; la identidad la pone el servidor.
   *
   * Antes esta función armaba el objeto entero con valores por defecto, y el
   * primer `presencia:actualizar` pisaba el nombre real por `Usuario X`, el rol
   * por `''` y el permiso por `false`. Con la identidad tomada de `estado`, un
   * cliente no puede degradarse ni degradar a nadie.
   */
  private normalizar(
    parcial: Partial<EstadoPresencia>,
    estado: EstadoCliente,
  ): EstadoPresencia {
    const texto = (v: unknown, max = 64): string | null =>
      typeof v === 'string' && v.length > 0 ? v.slice(0, max) : null;

    return {
      usuarioId: estado.usuarioId,
      nombre: estado.nombre,
      rol: estado.rol,
      puedeEditar: estado.puedeEditar,
      nodoSeleccionado: texto(parcial.nodoSeleccionado, 128),
      nivelId: texto(parcial.nivelId, 128),
      edificioId: texto(parcial.edificioId, 128),
      modo: texto(parcial.modo, 64),
      vista:
        parcial.vista === '3d' ? '3d' : parcial.vista === '2d' ? '2d' : null,
      actualizadoEn: new Date().toISOString(),
    };
  }
}

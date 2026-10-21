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
import * as Y from 'yjs';
import type { Server, Socket } from 'socket.io';
import { sembrarDocumento, type EscenaPlana } from './documento-yjs';
import { TokenVerificadorService } from '../../../common/auth/token-verificador.service';
import { MembresiaService } from '../service/membresia.service';
import { DocumentoService } from '../service/documento.service';

/** Documento vivo de un proyecto. Vive mientras haya alguien conectado. */
interface Sesion {
  doc: Y.Doc;
  refCount: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Hubo alguna escritura desde que se sembró: define si vale la pena persistir. */
  sucio: boolean;
  /** Generación del doc. Sube con cada re-seed (restaurar versión). */
  epoch: number;
}

interface EstadoSocket {
  usuarioId: number;
  proyectoId: string;
  /** Nombre del permiso vigente. Se actualiza en vivo con `sync:permiso`. */
  rol: string;
  puedeEditar: boolean;
  /**
   * Generación del doc que este socket tiene aplicada. Empieza en `-1` (todavía
   * no confirmó el `sync:inicial`) y se pone al día cuando el cliente manda
   * `sync:listo`. Un `sync:update` con epoch viejo se descarta: viene de la
   * escena anterior a un re-seed y aplicarlo resucitaría los nodos viejos.
   */
  epoch: number;
}

// Acepta `Socket` y `RemoteSocket` (lo que devuelve `fetchSockets()`): ambos
// traen `data`, y es lo único que se lee de ellos.
const datos = (socket: { data: unknown }): { estado?: EstadoSocket } =>
  socket.data as { estado?: EstadoSocket };

const estadoDe = (socket: Socket): EstadoSocket | undefined =>
  datos(socket).estado;

/**
 * Gateway de sincronización del plano.
 *
 * Es el servidor Yjs estándar: mantiene el documento autoritativo en memoria por
 * proyecto y reenvía los updates entre los conectados. No interpreta la escena
 * —solo mueve updates binarios— y por eso no necesita conocer el esquema de
 * nodos.
 *
 * LA PERSISTENCIA
 * ---------------
 * Lo que se guarda en `documento_colaborativo` es la escena MATERIALIZADA, no el
 * binario de Yjs, y la columna es JSONB. Materializar es estructural: los
 * `toJSON()` de Y.Map y Y.Array dan las cinco estructuras que importan y listo.
 * Así el resto del sistema sigue leyendo el documento como un objeto, y
 * `GET /proyectos/:id` no cambia.
 *
 * Se persiste con debounce: una sesión genera updates varias veces por segundo
 * y una escritura por update sería absurdo.
 *
 * UN LECTOR NO ESCRIBE
 * --------------------
 * `sync:update` exige `puedeEditar`, revalidado en cada mensaje y no solo al
 * conectar: un LECTOR entra, recibe el estado inicial y no puede emitir.
 */
@WebSocketGateway({
  namespace: '/sync',
  cors: { origin: true, credentials: true },
})
export class SyncGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(SyncGateway.name);

  @WebSocketServer()
  private server!: Server;

  private readonly sesiones = new Map<string, Sesion>();

  /**
   * Creaciones de sesión en curso, por proyecto.
   *
   * SIN ESTO EL PROYECTO SE PARTE EN DOS. `asegurarDocumento` tiene un `await`
   * (la lectura a la base) entre mirar el map y escribir en él. Si dos usuarios
   * conectan a la vez —lo normal cuando varios abren el mismo enlace—:
   *
   *   A mira el map, no está      B mira el map, no está
   *   A await leer(...)           B await leer(...)
   *   A crea docA, lo pone        B crea docB, SOBREESCRIBE a A
   *
   * Los dos quedan en la misma sala de socket.io pero aplicando los updates
   * sobre Y.Docs distintos: no se ven entre sí, y lo que escribió A no se
   * persiste nunca porque al salir el último se guarda docB.
   *
   * Guardando la PROMESA de creación en vez de la sesión resuelta, el primero
   * que llega la crea y los demás la esperan. Todos reciben el mismo doc.
   */
  private readonly creando = new Map<string, Promise<Sesion>>();

  private readonly DEBOUNCE_MS = 1500;

  constructor(
    private readonly tokenVerificador: TokenVerificadorService,
    private readonly membresia: MembresiaService,
    private readonly documento: DocumentoService,
  ) {}

  async handleConnection(socket: Socket): Promise<void> {
    const proyectoId = String(socket.handshake.query?.proyectoId ?? '');
    if (!proyectoId) {
      socket.emit('sync:error', {
        codigo: 'PROYECTO_FALTANTE',
        mensaje: 'Falta el proyecto.',
      });
      socket.disconnect(true);
      return;
    }

    const token = await this.tokenVerificador.verificar({
      cookies: this.leerCookies(socket),
      headers: socket.handshake.headers,
    });
    if (!token) {
      this.logger.warn(`Sync rechazada: sin sesión válida en ${proyectoId}.`);
      socket.emit('sync:error', {
        codigo: 'SIN_SESION',
        mensaje: 'Sesión no válida.',
      });
      socket.disconnect(true);
      return;
    }

    const miembro = await this.membresia.resolver(proyectoId, token.sub);
    if (miembro.estado !== 'MIEMBRO') {
      this.logger.warn(
        `Sync rechazada: usuario ${token.sub} en ${proyectoId} (${miembro.estado.toLowerCase()}).`,
      );
      socket.emit('sync:error', {
        codigo: 'SIN_ACCESO',
        mensaje: 'No podés entrar a este proyecto.',
      });
      socket.disconnect(true);
      return;
    }

    const sesion = await this.asegurarDocumento(proyectoId);
    sesion.refCount += 1;

    datos(socket).estado = {
      usuarioId: token.sub,
      proyectoId,
      rol: miembro.rol,
      puedeEditar: miembro.puedeEditar,
      epoch: -1,
    } satisfies EstadoSocket;
    // Se espera el join: si es asíncrono, un re-seed entre este punto y el
    // `sync:inicial` dejaría al socket fuera de la sala y perdería el estado
    // re-sembrado.
    await socket.join(this.sala(proyectoId));

    // `reemplazar: false` = reconexión normal: el cliente FUSIONA este estado
    // con su doc local en vez de destruirlo. Así conserva lo que editó mientras
    // estuvo desconectado. La restauración de versión manda `true`.
    socket.emit('sync:inicial', Y.encodeStateAsUpdate(sesion.doc), {
      reemplazar: false,
    });

    this.logger.log(
      `Sync: usuario ${token.sub} (${miembro.rol}) en ${proyectoId}. Presentes: ${sesion.refCount}.`,
    );
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const estado = estadoDe(socket);
    if (!estado) return;

    const sesion = this.sesiones.get(estado.proyectoId);
    if (!sesion) return;

    sesion.refCount = Math.max(0, sesion.refCount - 1);
    this.logger.log(
      `Sync: usuario ${estado.usuarioId} salió de ${estado.proyectoId}. Presentes: ${sesion.refCount}.`,
    );

    if (sesion.refCount === 0) {
      await this.persistirYLiberar(estado.proyectoId, sesion);
    }
  }

  @SubscribeMessage('sync:update')
  async recibirUpdate(
    @ConnectedSocket() socket: Socket,
    @MessageBody() update: ArrayBuffer | Uint8Array,
  ): Promise<void> {
    const estado = estadoDe(socket);
    if (!estado || !estado.puedeEditar) return;

    const sesion = this.sesiones.get(estado.proyectoId);
    if (!sesion) return;

    // El update viene de una generación anterior al doc (un re-seed por
    // restaurar versión). Aplicarlo fusionaría los nodos viejos sobre lo
    // restaurado. Se descarta: el cliente ya recibió el `sync:inicial` nuevo y
    // en cuanto lo confirme con `sync:listo` vuelve a operar.
    if (estado.epoch !== sesion.epoch) return;

    // Revalidación por mensaje: el permiso pudo cambiar desde que conectó.
    const actual = await this.membresia.resolver(
      estado.proyectoId,
      estado.usuarioId,
    );
    if (actual.estado !== 'MIEMBRO') {
      socket.emit('sync:error', {
        codigo: 'SIN_ACCESO',
        mensaje: 'Ya no tenés acceso a este proyecto.',
      });
      socket.disconnect(true);
      return;
    }

    estado.rol = actual.rol;
    estado.puedeEditar = actual.puedeEditar;
    if (!actual.puedeEditar) {
      socket.emit('sync:error', {
        codigo: 'SIN_PERMISO',
        mensaje: 'Tu permiso cambió: ya no podés editar.',
      });
      return;
    }

    const bytes =
      update instanceof Uint8Array ? update : new Uint8Array(update);
    Y.applyUpdate(sesion.doc, bytes, socket.id);

    // Reenvío a los demás: el emisor ya lo tiene aplicado en local.
    socket.to(this.sala(estado.proyectoId)).emit('sync:update', bytes);
    sesion.sucio = true;
    this.programarPersistencia(estado.proyectoId, sesion);
  }

  /**
   * El cliente confirma que aplicó el `sync:inicial`.
   *
   * Cierra la carrera del restore: hasta que llega este ack, el socket queda en
   * la generación vieja y sus `sync:update` se descartan. Así un update que ya
   * estaba en vuelo cuando se re-sembró el doc no resucita la escena anterior.
   */
  @SubscribeMessage('sync:listo')
  confirmarInicial(@ConnectedSocket() socket: Socket): void {
    const estado = estadoDe(socket);
    if (!estado) return;
    const sesion = this.sesiones.get(estado.proyectoId);
    if (!sesion) return;
    estado.epoch = sesion.epoch;
  }

  /**
   * Avisa en vivo que el permiso de un usuario cambió.
   *
   * Se recorren los sockets del namespace y no se revalida acá: quien llama ya
   * actualizó la base y conoce el rol nuevo. Si el usuario tiene dos pestañas,
   * las dos reciben el aviso.
   */
  async notificarPermiso(
    proyectoId: string,
    usuarioId: number,
    rol: string,
    puedeEditar: boolean,
  ): Promise<void> {
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

      estado.rol = rol;
      estado.puedeEditar = puedeEditar;
      socket.emit('sync:permiso', { rol, puedeEditar });
    }
  }

  /**
   * Cierra los sockets de un colaborador eliminado.
   *
   * El `sync:error` sale antes del `disconnect` para que el cliente sepa por
   * qué se cerró y no intente reconectar. El servidor no puede volver a
   * aceptarlo: la membresía ya no existe.
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

      socket.emit('sync:error', {
        codigo: 'EXPULSADO',
        mensaje: 'Te quitaron de este proyecto.',
      });
      socket.disconnect(true);
    }
  }

  /**
   * Impone el estado restaurado sobre la sesión en vivo.
   *
   * Restaurar una versión escribe la base, pero el gateway es la fuente de
   * verdad mientras hay gente conectada: su `Y.Doc` en memoria sigue con la
   * escena vieja y la volvería a persistir al desconectar el último cliente
   * (por eso "restaurar y se revierte"). Acá se re-siembra el doc desde la
   * escena restaurada y se difunde el estado completo a la sala.
   *
   * Se emite `sync:inicial`, NO `sync:update`: el cliente lo aplica con
   * `setScene`, que reemplaza la escena entera. Con un update suelto —fusión
   * CRDT— los nodos que el cliente tenía de más no se borrarían. El segundo
   * argumento `reemplazar: true` le dice al cliente que descarte su doc local;
   * en una reconexión normal ese mismo evento llega con `false` y el cliente
   * fusiona.
   *
   * Sin sesión no hay nada que corregir: la base ya tiene lo restaurado y el
   * próximo que entre siembra desde ahí.
   */
  aplicarRestauracion(proyectoId: string, escena: EscenaPlana | null): void {
    const sesion = this.sesiones.get(proyectoId);
    if (!sesion) return;

    // El debounce pendiente persistiría el doc viejo: se cancela antes de
    // reemplazarlo.
    if (sesion.timer) {
      clearTimeout(sesion.timer);
      sesion.timer = null;
    }

    sesion.doc.destroy();
    sesion.doc = sembrarDocumento(escena);
    // Nueva generación: los sockets quedan desactualizados hasta que apliquen
    // el `sync:inicial` de abajo y lo confirmen con `sync:listo`.
    sesion.epoch += 1;
    // El doc re-sembrado es el estado autoritativo: al desconectar el último
    // hay que persistirlo (es idéntico a lo que ya hay en la base).
    sesion.sucio = true;

    this.server
      ?.to(this.sala(proyectoId))
      .emit('sync:inicial', Y.encodeStateAsUpdate(sesion.doc), {
        reemplazar: true,
      });

    this.logger.log(
      `Sync: documento de ${proyectoId} re-sembrado con la versión restaurada.`,
    );
  }

  onModuleDestroy(): void {
    for (const [proyectoId, sesion] of this.sesiones) {
      if (sesion.timer) clearTimeout(sesion.timer);
      void this.documento.guardarMaterializado(proyectoId, sesion.doc);
    }
    this.sesiones.clear();
    this.creando.clear();
  }

  /** Carga el doc desde la base la primera vez, o crea uno vacío. */
  private async asegurarDocumento(proyectoId: string): Promise<Sesion> {
    const existente = this.sesiones.get(proyectoId);
    if (existente) {
      if (existente.timer) {
        clearTimeout(existente.timer);
        existente.timer = null;
      }
      return existente;
    }

    // La promesa se registra en el map ANTES de esperar nada. Quien llegue
    // mientras el primero está en su `await` se engancha a esta misma promesa
    // en vez de crear un doc paralelo. Ver la nota de `creando`.
    let pendiente = this.creando.get(proyectoId);

    if (!pendiente) {
      pendiente = (async () => {
        const escena = await this.documento.leer(proyectoId);
        const doc = sembrarDocumento(escena);
        const sesion: Sesion = {
          doc,
          refCount: 0,
          timer: null,
          sucio: false,
          epoch: 0,
        };
        this.sesiones.set(proyectoId, sesion);
        return sesion;
      })();
      this.creando.set(proyectoId, pendiente);
    }

    try {
      return await pendiente;
    } finally {
      // Se limpia solo si sigue siendo esta: si otra generación entró en
      // paralelo, no hay que pisarla.
      if (this.creando.get(proyectoId) === pendiente) {
        this.creando.delete(proyectoId);
      }
    }
  }

  private programarPersistencia(proyectoId: string, sesion: Sesion): void {
    if (sesion.timer) clearTimeout(sesion.timer);
    sesion.timer = setTimeout(() => {
      sesion.timer = null;
      void this.documento.guardarMaterializado(proyectoId, sesion.doc);
    }, this.DEBOUNCE_MS);
  }

  private async persistirYLiberar(
    proyectoId: string,
    sesion: Sesion,
  ): Promise<void> {
    if (sesion.timer) clearTimeout(sesion.timer);
    // Si nadie escribió, el doc es el que se sembró desde la base: persistirlo
    // sería una escritura idéntica a lo que ya está. Sobre todo importa para
    // el LECTOR, que abre y cierra sin tocar nada.
    if (sesion.sucio) {
      await this.documento.guardarMaterializado(proyectoId, sesion.doc);
      this.logger.log(
        `Sync: documento de ${proyectoId} persistido y liberado.`,
      );
    } else {
      this.logger.log(
        `Sync: sesión de ${proyectoId} cerrada sin cambios; no se persiste.`,
      );
    }
    sesion.doc.destroy();
    this.sesiones.delete(proyectoId);
    this.creando.delete(proyectoId);
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
}

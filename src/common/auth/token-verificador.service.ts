import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

export interface TokenValido {
  sub: number;
  username?: string;
}

/** Alcance del ticket: solo sirve para abrir el socket de sync. */
export const TICKET_SCOPE = 'sync';

/** Vida del ticket. Corta a propósito: el socket lo renueva en cada reconexión. */
export const TICKET_TTL_SEGUNDOS = 120;

interface PayloadTicket {
  sub?: number;
  proyectoId?: string;
  scope?: string;
}

/**
 * Verificación del token, compartida entre HTTP y WebSocket.
 *
 * Antes vivía dentro de `JwtAuthGuard`, que es un `CanActivate`: solo se
 * dispara en el ciclo de una petición HTTP. El handshake de un WebSocket no
 * pasa por guard, así que el gateway no tenía forma de autenticar: sin esto,
 * cualquiera podía abrir un socket y entrar a un proyecto ajeno.
 *
 * Extraerlo deja una sola implementación de "lee el token y verifícalo", y el
 * guard pasa a ser una capa fina encima.
 */
@Injectable()
export class TokenVerificadorService {
  private readonly logger = new Logger(TokenVerificadorService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Saca el token de una petición o de un handshake.
   *
   * La cookie httpOnly manda, igual que en HTTP: es lo que fija el login y no
   * es accesible desde JavaScript, así que no puede ser robada por un XSS.
   * `Authorization: Bearer` queda como respaldo para clientes no-navegador, que
   * es el mismo criterio que usa el guard.
   */
  extraerToken(fuente: {
    cookies?: Record<string, string | undefined>;
    headers: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const cookies = fuente.cookies;
    if (cookies) {
      if (cookies['tokenAcceso']) return cookies['tokenAcceso'];
      // Compatibilidad con sesiones emitidas antes del renombre.
      if (cookies['access_token']) return cookies['access_token'];
    }

    const authHeader = fuente.headers.authorization;
    if (typeof authHeader === 'string') {
      const [tipo, token] = authHeader.split(' ');
      if (tipo === 'Bearer' && token) return token;
    }
    return undefined;
  }

  /**
   * Verifica el token y devuelve el payload, o `null` si no hay, expiró o es
   * inválido.
   *
   * Devolver `null` en vez de lanzar es a propósito: el guard HTTP quiere
   * diferenciar "no hay token" (401 con mensaje propio) de "token inválido",
   * y el gateway solo necesita saber si puede dejar entrar o no.
   */
  async verificar(fuente: {
    cookies?: Record<string, string | undefined>;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<TokenValido | null> {
    const token = this.extraerToken(fuente);
    if (!token) {
      this.logger.warn('Petición sin token de sesión.');
      return null;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('app.jwtSecret'),
      });
      return { sub: payload.sub, username: payload.username };
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`Token inválido o expirado: ${mensaje}`);
      return null;
    }
  }

  /**
   * Secreto del ticket, DERIVADO de `JWT_SECRET`.
   *
   * Sin variable nueva: `SYNC_TICKET_SECRET` sería otra cosa que rotar y otra
   * cosa que olvidar configurar en Render. Derivarlo con un sufijo da un secreto
   * distinto del de sesión y con la misma raíz de confianza:
   *
   *  - un ticket NO sirve como token de sesión (firma con otro secreto);
   *  - un token de sesión NO sirve como ticket (idem, y además falta `scope`).
   *
   * Rotar `JWT_SECRET` invalida los tickets en vuelo, que duran dos minutos.
   */
  private secretoDeTicket(): string {
    return `${this.configService.get<string>('app.jwtSecret') ?? ''}:sync-ticket`;
  }

  /**
   * Emite un ticket de corta duración para abrir el WebSocket de un proyecto.
   *
   * Existe porque el HTTP pasó a ir por el proxy same-origin del front (la
   * cookie quedó host-only del dominio de Vercel), pero Vercel no puede proxear
   * WebSockets: el socket sigue yendo directo a Render, donde esa cookie ya no
   * llega. El ticket viaja en `handshake.auth`, que es un campo del payload del
   * handshake, no una cabecera que el navegador agregue sola.
   *
   * Quien lo emite es el backend, no el front: así el secreto nunca sale de
   * Render y la pertenencia al proyecto se valida del lado del servidor.
   */
  async firmarTicket(usuarioId: number, proyectoId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: usuarioId, proyectoId, scope: TICKET_SCOPE },
      {
        secret: this.secretoDeTicket(),
        expiresIn: TICKET_TTL_SEGUNDOS,
      },
    );
  }

  /**
   * Verifica el ticket de un handshake.
   *
   * Devuelve `null` —y no lanza— igual que `verificar`: el gateway solo necesita
   * saber si deja entrar. Se comprueban las tres cosas que un ticket de sesión
   * normal no garantiza: firma derivada, alcance `sync` y que el proyecto del
   * ticket sea el del `query` del socket (si no, un ticket de un proyecto propio
   * abriría cualquier otro).
   */
  async verificarTicket(
    ticket: string | undefined,
    proyectoId: string,
  ): Promise<TokenValido | null> {
    if (!ticket) return null;

    try {
      const payload = await this.jwtService.verifyAsync<PayloadTicket>(ticket, {
        secret: this.secretoDeTicket(),
      });

      if (payload.scope !== TICKET_SCOPE) {
        this.logger.warn('Ticket de sync con alcance inválido.');
        return null;
      }
      if (payload.proyectoId !== proyectoId) {
        this.logger.warn(
          `Ticket de sync para otro proyecto (${payload.proyectoId ?? 'sin id'}).`,
        );
        return null;
      }
      if (typeof payload.sub !== 'number') {
        this.logger.warn('Ticket de sync sin usuario.');
        return null;
      }

      return { sub: payload.sub };
    } catch (error: unknown) {
      const mensaje = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`Ticket de sync inválido o expirado: ${mensaje}`);
      return null;
    }
  }

  /**
   * Lee el ticket de `handshake.auth`, que socket.io deja como objeto plano.
   *
   * Se valida el tipo porque `auth` lo controla el cliente: podría mandar un
   * objeto, un array o nada.
   */
  leerTicket(auth: unknown): string | undefined {
    if (!auth || typeof auth !== 'object') return undefined;
    const ticket = (auth as Record<string, unknown>).ticket;
    return typeof ticket === 'string' && ticket.length > 0 ? ticket : undefined;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

export interface TokenValido {
  sub: number;
  username?: string;
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
}

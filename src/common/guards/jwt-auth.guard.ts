import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guardia global de autenticación JWT.
 * Inspecciona cada solicitud entrante buscando el token en la cookie 'tokenAcceso'
 * (con respaldo a 'access_token' legada) o en el encabezado 'Authorization: Bearer <token>'.
 * Si el endpoint está anotado con @Public(), permite el acceso sin verificación.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Verificar si la ruta es pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // 2. Extraer el token de la cookie o del encabezado Bearer
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extraerTokenDeRequest(request);

    if (!token) {
      this.logger.warn(
        `Acceso denegado a ${request.method} ${request.url}: Token no proporcionado.`,
      );
      throw new UnauthorizedException(
        'Acceso no autorizado: Debe iniciar sesión para continuar.',
      );
    }

    // 3. Verificar la validez del token
    try {
      const secret = this.configService.get<string>('app.jwtSecret');
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });
      // Adjuntar el usuario autenticado a la solicitud
      (request as Request & { user: JwtPayload }).user = payload;
    } catch (error: unknown) {
      const mensaje =
        error instanceof Error ? error.message : 'Error desconocido';
      this.logger.warn(
        `Token inválido o expirado en ${request.method} ${request.url}: ${mensaje}`,
      );
      throw new UnauthorizedException(
        'Acceso no autorizado: Token de sesión inválido o expirado.',
      );
    }

    return true;
  }

  /**
   * Extrae el token priorizando la cookie segura 'tokenAcceso'.
   * Como respaldo, acepta la cookie legada 'access_token' y la cabecera
   * Authorization Bearer (transición + clientes no-navegador).
   */
  private extraerTokenDeRequest(request: Request): string | undefined {
    // Prioridad 1: Cookie httpOnly estándar
    const cookies = request.cookies as Record<string, string> | undefined;
    if (cookies) {
      if (cookies['tokenAcceso']) {
        return cookies['tokenAcceso'];
      }
      // Compatibilidad con sesiones emitidas antes del renombre
      if (cookies['access_token']) {
        return cookies['access_token'];
      }
    }

    // Prioridad 2: Header Bearer
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [tipo, token] = authHeader.split(' ');
      if (tipo === 'Bearer' && token) {
        return token;
      }
    }

    return undefined;
  }
}

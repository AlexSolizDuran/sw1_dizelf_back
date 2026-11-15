import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** Métodos que no cambian estado y por lo tanto no necesitan validación. */
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Quita la barra final para comparar 'http://a.com/' con 'http://a.com'. */
const normalizar = (origen: string): string => origen.trim().replace(/\/$/, '');

/**
 * Guardia global anti-CSRF basado en la cabecera `Origin`.
 *
 * POR QUÉ HACE FALTA: la cookie de sesión sale con `SameSite=None; Secure`
 * cuando `COOKIE_SECURE=true` (`auth.service.ts`), porque el front (Vercel) y
 * el back (Render) viven en dominios distintos. `SameSite=None` significa
 * "adjuntá la cookie también en peticiones de terceros", que es exactamente lo
 * que hace posible el CSRF.
 *
 * CORS no cierra esto: bloquea que el navegador *lea* la respuesta, no que la
 * petición *se envíe*. Un `<form>` en un sitio ajeno dispara la petición con la
 * cookie del usuario y el backend la ejecuta. El caso más grave acá son los
 * endpoints que escriben el documento completo (`POST /proyectos/:id/versiones`
 * y restaurar): un atacante podría vaciarle el plano a otra persona.
 *
 * POR QUÉ `Origin` Y NO SOLO UN TOKEN: no requiere cambios en el frontend ni
 * una segunda cookie. `Origin` no es falsificable desde el navegador y todos
 * los navegadores modernos la envían en POST/PUT/PATCH/DELETE.
 *
 * POR QUÉ PASA CUANDO NO HAY `ORIGIN`: CSRF exige que sea *el navegador* el que
 * adjunte las credenciales. Una petición sin `Origin` viene de curl, Postman o
 * un script servidor-a-servidor, y ninguno de esos adjunta la cookie del
 * usuario por su cuenta, así que no hay nada que exfiltrar. `enableCors` en
 * `main.ts` ya permite a propósito las peticiones sin origen por ese mismo
 * motivo, y este guard mantiene la misma política en vez de contradecirla.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfOriginGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (METODOS_SEGUROS.has(request.method)) {
      return true;
    }

    const permitidos = this.configService.get<string[]>('app.frontendUrls', []);
    const origen = this.origenDeLaPeticion(request);

    if (origen === null) {
      // Cliente no-navegador: no es un ataque CSRF posible. Ver el comentario
      // de la clase. Se acepta también el caso de un origen propio del back.
      return true;
    }

    if (permitidos.includes(origen)) {
      return true;
    }

    this.logger.warn(
      `CSRF bloqueó ${request.method} ${request.url}: origen "${origen}" no está en la lista de permitidos (${permitidos.join(', ')})`,
    );
    throw new ForbiddenException('Origen no permitido para esta operación.');
  }

  /**
   * Devuelve el origen de la petición, o `null` si no se puede determinar.
   *
   * `Origin` es lo primario. `Referer` es el respaldo para navegadores viejos
   * que no la envían en algún método; se usa solo su componente de origen.
   */
  private origenDeLaPeticion(request: Request): string | null {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && origin.length > 0) {
      return normalizar(origin);
    }

    const referer = request.headers.referer;
    if (typeof referer === 'string' && referer.length > 0) {
      try {
        return normalizar(new URL(referer).origin);
      } catch {
        // Referer mal formado: se trata como ausente.
        return null;
      }
    }

    return null;
  }
}

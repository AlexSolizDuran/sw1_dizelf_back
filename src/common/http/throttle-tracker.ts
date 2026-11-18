import type { ThrottlerGetTrackerFunction } from '@nestjs/throttler';

/** Largo máximo del email que se usa como clave (evita claves enormes). */
export const LARGO_MAXIMO_EMAIL = 200;

/** Lo único que necesita el tracker de la petición de Express. */
interface PeticionRastreable {
  ip?: string;
  user?: { sub?: number };
  body?: { email?: unknown };
}

/**
 * Clave con la que el rate limit cuenta los pedidos.
 *
 * POR QUÉ NO ALCANZA CON LA IP: en producción el navegador no llama directo a
 * Render, pasa por el proxy same-origin de Vercel (`/api/backend/*`). Para
 * Render, todos esos pedidos vienen de la IP de salida de Vercel: contar por IP
 * ahí castigaría a todos los usuarios juntos. El tracker usa, en orden:
 *
 *  1. `usuario:<id>`: petición autenticada. El `JwtAuthGuard` corre antes que
 *     el throttler y deja el payload en `req.user`.
 *  2. `email:<normalizado>`: login, registro y token móvil, que son públicos y
 *     donde el objetivo es frenar fuerza bruta contra una cuenta.
 *  3. `ip:<ip>`: respaldo para clientes sin sesión ni email (curl, health).
 *
 * El límite sigue siendo por ruta: el guard arma la clave final con el
 * controlador y el handler, así que agotar los intentos de login no bloquea
 * el resto de la API.
 */
export function claveDeRastreo(req: PeticionRastreable): string {
  const usuarioId = req.user?.sub;
  if (typeof usuarioId === 'number' && Number.isFinite(usuarioId)) {
    return `usuario:${usuarioId}`;
  }

  const email = req.body?.email;
  if (typeof email === 'string') {
    const normalizado = email.trim().toLowerCase().slice(0, LARGO_MAXIMO_EMAIL);
    if (normalizado.length > 0) {
      return `email:${normalizado}`;
    }
  }

  return `ip:${req.ip ?? 'desconocida'}`;
}

/**
 * Adaptador para `ThrottlerModule`. La librería tipa el request como
 * `Record<string, any>`; el casteo queda aislado acá.
 */
export const rastrearSolicitud: ThrottlerGetTrackerFunction = (req) =>
  claveDeRastreo(req as PeticionRastreable);

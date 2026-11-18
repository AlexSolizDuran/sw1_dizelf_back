/**
 * Orígenes permitidos para CORS y para el guard anti-CSRF.
 *
 * Vive acá y no en `main.ts` porque los gateways de WebSocket no pueden
 * inyectar `ConfigService` en el decorador `@WebSocketGateway`: sus opciones se
 * evalúan al definir la clase. Con una sola implementación, HTTP y sockets
 * aceptan exactamente la misma lista y no hay forma de que se desincronicen.
 */

/** Quita espacios y la barra final: `https://x.dev/` y `https://x.dev` son el mismo origen. */
export function normalizarOrigen(origen: string): string {
  return origen.trim().replace(/\/$/, '');
}

/**
 * Lista de orígenes a partir de `FRONTEND_URL` (separada por comas).
 *
 * El default es `localhost:3000` (Next.js). Antes `main.ts` caía en 5173
 * (Vite), un puerto que este proyecto no usa.
 */
export function origenesPermitidos(
  valor: string | undefined = process.env.FRONTEND_URL,
): string[] {
  const lista = (valor || 'http://localhost:3000')
    .split(',')
    .map(normalizarOrigen)
    .filter((origen) => origen.length > 0);

  return [...new Set(lista)];
}

/**
 * `true` si el origen puede entrar. Sin `Origin` también: curl, Postman,
 * health checks y las apps nativas no lo mandan, y CORS no protege de ellos
 * (la autenticación sí).
 */
export function origenPermitido(
  origen: string | undefined,
  permitidos: string[] = origenesPermitidos(),
): boolean {
  if (!origen) return true;
  return permitidos.includes(normalizarOrigen(origen));
}

/**
 * Adaptador para la opción `cors.origin` de socket.io. Rechaza con error (y no
 * con `false` a secas) para que el navegador no reciba la cabecera CORS.
 */
export function permitirOrigenSocket(
  origen: string | undefined,
  callback: (error: Error | null, permitir?: boolean) => void,
): void {
  if (origenPermitido(origen)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origen no permitido por CORS: ${origen}`), false);
}

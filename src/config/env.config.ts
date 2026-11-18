import { registerAs } from '@nestjs/config';

/**
 * Interface que representa la configuración fuertemente tipada de la aplicación.
 */
export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  /** Vigencia del token de la app (segundos). 30 días por defecto. */
  jwtExpiracionMovilSegundos: number;
  frontendUrl: string;
  frontendUrls: string[];
  cookieSecure: boolean;
  /** Push de la app móvil (Expo). Deshabilitado por defecto. */
  pushEnabled: boolean;
  expoAccessToken: string;
  pushTimeoutMs: number;
  /** Ventana antiduplicados por proyecto+usuario, en segundos. */
  pushThrottleSegundos: number;
}

/**
 * Registro de configuración tipada para inyección en servicios y módulos.
 */
export default registerAs('app', (): AppConfig => {
  // `localhost:3000`, no 5173: este proyecto usa Next.js, no Vite. El 5173
  // venía de un starter de Vite y hacía que, sin FRONTEND_URL en el entorno,
  // CORS rechazara al front real. Importa también para CsrfOriginGuard, que
  // usa esta misma lista: un default equivocado bloquea las escrituras del
  // front en vez de solo dejar de permitir la lectura.
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  // Permite lista separada por comas para preview/Vercel + local sin cambiar código.
  const frontendUrls = frontendUrl
    .split(',')
    .map((origen) => origen.trim().replace(/\/$/, ''))
    .filter((origen) => origen.length > 0);

  return {
    // 3001 y no 3000: el front corre en 3000. Con el default en 3000, arrancar
    // sin PORT hacía que ambos tomaran el mismo puerto.
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.NEON_DB_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRACION || '1d',
    // 30 días: una app instalada no debe pedir la contraseña cada día.
    jwtExpiracionMovilSegundos: parseInt(
      process.env.JWT_EXPIRACION_MOVIL_SEGUNDOS || '2592000',
      10,
    ),
    frontendUrl: frontendUrls[0] || 'http://localhost:3000',
    frontendUrls,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    // Apagado por defecto: sin token de Expo el envío funciona, pero conviene
    // activarlo explícitamente cuando la app móvil ya está publicada.
    pushEnabled: process.env.PUSH_ENABLED === 'true',
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',
    pushTimeoutMs: parseInt(process.env.PUSH_TIMEOUT_MS || '4000', 10),
    pushThrottleSegundos: parseInt(
      process.env.PUSH_THROTTLE_SEGUNDOS || '60',
      10,
    ),
  };
});

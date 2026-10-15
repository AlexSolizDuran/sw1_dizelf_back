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
  frontendUrl: string;
  frontendUrls: string[];
  cookieSecure: boolean;
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
    frontendUrl: frontendUrls[0] || 'http://localhost:3000',
    frontendUrls,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  };
});

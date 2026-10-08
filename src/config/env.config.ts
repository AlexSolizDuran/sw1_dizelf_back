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
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  // Permite lista separada por comas para preview/Vercel + local sin cambiar código.
  const frontendUrls = frontendUrl
    .split(',')
    .map((origen) => origen.trim().replace(/\/$/, ''))
    .filter((origen) => origen.length > 0);

  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.NEON_DB_URL || '',
    jwtSecret: process.env.JWT_SECRET || '',
    jwtExpiresIn: process.env.JWT_EXPIRACION || '1d',
    frontendUrl: frontendUrls[0] || 'http://localhost:5173',
    frontendUrls,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  };
});

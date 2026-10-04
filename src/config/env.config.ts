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
}

/**
 * Registro de configuración tipada para inyección en servicios y módulos.
 */
export default registerAs('app', (): AppConfig => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.NEON_DB_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRACION || '1d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
}));

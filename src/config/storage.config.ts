import { registerAs } from '@nestjs/config';

/**
 * Configuración de Neon Object Storage (S3 compatible).
 *
 * Las credenciales las emite `neon env pull` y se llaman igual que en AWS
 * (`AWS_*`), que es lo que esperan el SDK y la CLI de Neon. El bucket se elige
 * con `MODELOS_BUCKET` porque es el único nombre que el proyecto decide.
 *
 * Los valores son opcionales a propósito: sin bucket configurado la API
 * arranca y solo los endpoints de modelo AR responden 503. Así `npm start` no
 * exige credenciales de storage para trabajar en el resto del proyecto.
 */
export interface StorageConfig {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export default registerAs('storage', (): StorageConfig => ({
  bucket: process.env.MODELOS_BUCKET || 'modelos-ar',
  endpoint: process.env.AWS_ENDPOINT_URL_S3 || '',
  // Región por defecto de los buckets de Neon; el SDK la exige siempre.
  region: process.env.AWS_REGION || 'us-east-2',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
}));

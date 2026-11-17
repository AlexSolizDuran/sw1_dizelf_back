import * as Joi from 'joi';

/**
 * Esquema de validación para las variables de entorno de la aplicación.
 * Garantiza el principio fail-fast: la API no arranca si faltan variables críticas.
 */
export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  NEON_DB_URL: Joi.string().required().messages({
    'any.required':
      'La variable NEON_DB_URL es obligatoria para conectar con PostgreSQL/Neon.',
    'string.empty': 'La variable NEON_DB_URL no puede estar vacía.',
  }),
  JWT_SECRET: Joi.string().min(16).required().messages({
    'any.required':
      'La variable JWT_SECRET es obligatoria para firmar tokens JWT.',
    'string.min':
      'JWT_SECRET debe tener al menos 16 caracteres para garantizar seguridad.',
  }),
  JWT_EXPIRACION: Joi.string().default('1d'),
  // Vigencia del token de la app móvil, en segundos (30 días por defecto).
  JWT_EXPIRACION_MOVIL_SEGUNDOS: Joi.number().min(60).default(2592000),
  FRONTEND_URL: Joi.string().default('http://localhost:3000'),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  // Object Storage (GLB de AR). Opcionales: sin ellas la API arranca y solo los
  // endpoints de modelo responden 503 (ver StorageConfig).
  MODELOS_BUCKET: Joi.string().default('modelos-ar'),
  AWS_ENDPOINT_URL_S3: Joi.string().allow('').optional(),
  AWS_REGION: Joi.string().default('us-east-2'),
  AWS_ACCESS_KEY_ID: Joi.string().allow('').optional(),
  AWS_SECRET_ACCESS_KEY: Joi.string().allow('').optional(),
});

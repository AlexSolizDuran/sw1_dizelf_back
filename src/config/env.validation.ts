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
  FRONTEND_URL: Joi.string().default('http://localhost:5173'),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
});

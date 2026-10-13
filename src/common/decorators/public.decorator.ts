import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorador para marcar endpoints que no requieren autenticación (como registro y login).
 * Por defecto, todos los endpoints sin este decorador requerirán un token JWT válido.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

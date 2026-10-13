import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

/**
 * Decorador de parámetro para inyectar los datos del usuario autenticado en los controladores.
 * Puede extraer un campo puntual (ej: `@CurrentUser('sub') userId: number`) o el payload completo.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);

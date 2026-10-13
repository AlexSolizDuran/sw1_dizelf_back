import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RolProyecto } from '../../modules/proyectos/enums/rol-proyecto.enum';

export const RolProyectoActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RolProyecto | undefined => {
    const solicitud = ctx
      .switchToHttp()
      .getRequest<Request & { rolProyecto?: RolProyecto }>();
    return solicitud.rolProyecto;
  },
);

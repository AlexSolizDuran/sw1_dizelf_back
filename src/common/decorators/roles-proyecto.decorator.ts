import { SetMetadata } from '@nestjs/common';
import { RolProyecto } from '../../modules/proyectos/enums/rol-proyecto.enum';

export const ROLES_PROYECTO_KEY = 'rolesProyecto';

export const RolesProyecto = (...roles: RolProyecto[]) =>
  SetMetadata(ROLES_PROYECTO_KEY, roles);

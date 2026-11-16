import { SetMetadata } from '@nestjs/common';
import type { Capacidad } from '../guards/proyecto-rol.guard';

export const CAPACIDAD_PROYECTO_KEY = 'capacidadProyecto';

/**
 * Declara qué capacidad exige un endpoint.
 *
 * Antes se usaba `@RolesProyecto(RolProyecto.CREADOR)`, que comparaba contra
 * un enum de TypeScript sin mirar la tabla `permiso`. Ahora se declaran
 * capacidades y las resuelve el guard leyendo el permiso de la base, de modo
 * que un permiso nuevo no obliga a tocar el enum ni a desplegar.
 *
 * El creador pasa todo: es dueño, no un permiso del catálogo.
 */
export const RequiereCapacidad = (...capacidades: Capacidad[]) =>
  SetMetadata(CAPACIDAD_PROYECTO_KEY, capacidades);

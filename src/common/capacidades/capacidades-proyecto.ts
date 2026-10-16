/**
 * Capacidades por permiso de proyecto.
 *
 * QUÉ CAMBIA RESPECTO DE ANTES
 * ----------------------------
 * El guard no leía `permiso`: seleccionaba `usuarioId` y deducía el rol por la
 * forma de la relación (`es creador → CREADOR`, `es colaborador → INVITADO`).
 * Eso hacía que la tabla `permiso` fuera decorativa: sembrar un permiso nuevo
 * no concedía nada, porque la decisión se tomaba contra un enum de TypeScript.
 *
 * Ahora el nombre del permiso se resuelve de la base y las capacidades se
 * derivan de ese nombre. Dar de alta un permiso nuevo es un `INSERT` en
 * `permiso`, sin tocar código.
 *
 * EL CREADOR NO ES UN PERMISO
 * ---------------------------
 * El creador es dueño: se reconoce por `proyecto.creador_id`, una FK, y por eso
 * no tiene fila en `permiso` ni aparece en el catálogo. Es una relación, no un
 * permiso. El rango de la sesión colaborativa son `EDITOR` y `LECTOR`.
 */

export type ClavePermiso = 'EDITOR' | 'LECTOR';

export interface Capacidades {
  /** Puede modificar el documento de la escena. */
  puedeEditar: boolean;
  /** Puede invitar y quitar colaboradores del proyecto. */
  puedeInvitar: boolean;
  /** Puede eliminar o renombrar el proyecto. */
  puedeAdministrar: boolean;
}

/** Capacidades del dueño del proyecto. No pasa por la tabla `permiso`. */
export const CAPACIDADES_CREADOR: Capacidades = Object.freeze({
  puedeEditar: true,
  puedeInvitar: true,
  puedeAdministrar: true,
});

/**
 * Permisos que puede recibir un colaborador.
 *
 * `LECTOR` es solo lectura: entra a la sesión, ve las ediciones en vivo y no
 * escribe. El editor le pone `readOnly` con `useScene.getState().setReadOnly()`.
 */
export const CAPACIDADES_POR_PERMISO: Record<ClavePermiso, Capacidades> = {
  EDITOR: Object.freeze({
    puedeEditar: true,
    puedeInvitar: false,
    puedeAdministrar: false,
  }),
  LECTOR: Object.freeze({
    puedeEditar: false,
    puedeInvitar: false,
    puedeAdministrar: false,
  }),
};

/** Permiso por defecto al invitar a alguien sin especificar. */
export const PERMISO_POR_DEFECTO: ClavePermiso = 'LECTOR';

const PERMISOS_CONOCIDOS = Object.keys(
  CAPACIDADES_POR_PERMISO,
) as ClavePermiso[];

/** Nombres válidos del catálogo. Para validar DTOs sin repetir la lista. */
export function esPermisoValido(nombre: string): nombre is ClavePermiso {
  return (PERMISOS_CONOCIDOS as string[]).includes(nombre);
}

export function listarPermisos(): ClavePermiso[] {
  return [...PERMISOS_CONOCIDOS];
}

/**
 * Capacidades de un nombre de permiso leído de la base.
 *
 * Un permiso desconocido no es un error fatal: degrada a solo lectura. Si el
 * catálogo se desincroniza del código, lo preferible es que ese usuario no
 * pueda escribir —denegar por defecto— y que el bug sea visible en los logs,
 * no que quede con permisos de edición.
 */
export function capacidadesDe(nombre: string | null | undefined): Capacidades {
  if (!nombre) {
    return CAPACIDADES_POR_PERMISO.LECTOR;
  }
  const capacidades = CAPACIDADES_POR_PERMISO[nombre as ClavePermiso];
  if (!capacidades) {
    console.warn(
      `[capacidades] Permiso desconocido en la base: "${nombre}". Se degrada a solo lectura.`,
    );
    return CAPACIDADES_POR_PERMISO.LECTOR;
  }
  return capacidades;
}

import type { AlmacenObjetosService } from './almacen-objetos.service';

/**
 * Token de inyección del almacén de objetos.
 *
 * Se inyecta por token y no por clase para que los servicios que lo consumen no
 * importen (en runtime) el módulo de configuración: `@nestjs/config` se publica
 * como ESM y arrastra el mapeo de módulos de Jest al cargarlo desde un test.
 */
export const ALMACEN_OBJETOS = Symbol('ALMACEN_OBJETOS');

/** Contrato del almacén, para tipar la inyección por token. */
export type AlmacenDeObjetos = Pick<
  AlmacenObjetosService,
  | 'configurado'
  | 'urlSubida'
  | 'urlLectura'
  | 'cabeza'
  | 'primerosBytes'
  | 'borrar'
>;

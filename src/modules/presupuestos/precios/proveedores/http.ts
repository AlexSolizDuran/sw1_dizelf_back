import { buscarEnConstructorBolivia } from './constructor-bolivia';
import { buscarEnMorales } from './morales';
import type { BuscadorPrecios } from '../tipos';

/**
 * Despacha la búsqueda al proveedor que declara la ficha del catálogo.
 *
 * Se arma como función inyectable (`FUENTE_PRECIOS`) para que los tests no
 * toquen la red: el servicio de precios no sabe de HTTP, solo de candidatos.
 */
export function crearBuscadorHttp(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): BuscadorPrecios {
  return async (candidato) => {
    switch (candidato.proveedor) {
      case 'constructorbolivia':
        return buscarEnConstructorBolivia(candidato, fetchImpl);
      case 'morales':
        return buscarEnMorales(candidato, fetchImpl);
      default:
        return null;
    }
  };
}

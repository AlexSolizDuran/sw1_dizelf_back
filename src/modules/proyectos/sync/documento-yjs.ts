import * as Y from 'yjs';

/**
 * Contrato del documento colaborativo en Yjs.
 *
 * El cliente replica estas claves en `dizelf_front/src/lib/editor/y-bridge.ts`.
 * Si divergen, el cliente recibe un doc vacío y parece que el plano se perdió;
 * por eso el contrato está documentado en los dos lados.
 *
 * El backend no conoce el esquema de nodos: solo mueve las cinco estructuras
 * que el editor guarda.
 */
export const CLAVES = {
  nodes: 'scene:nodes',
  roots: 'scene:roots',
  collections: 'scene:collections',
  materials: 'scene:materials',
  plugins: 'scene:plugins',
} as const;

/** Forma plana del documento, tal como se guarda en JSONB. */
export interface EscenaPlana {
  nodes?: Record<string, unknown>;
  rootNodeIds?: string[];
  collections?: Record<string, unknown>;
  materials?: Record<string, unknown>;
  installedPlugins?: string[];
}

/**
 * Siembra un `Y.Doc` desde la escena guardada.
 *
 * Estructural: `Y.Map` por nodo, `Y.Array` para raíces y plugins, y `Y.Map`
 * para colecciones y materiales.
 *
 * Las cinco estructuras se siembran. Si se omiten colecciones, materiales o
 * plugins, el primer persist del gateway los borra de la base y el editor los
 * pierde al reabrir.
 */
export function sembrarDocumento(escena: EscenaPlana | null): Y.Doc {
  const doc = new Y.Doc();
  if (!escena || Object.keys(escena).length === 0) return doc;

  doc.transact(() => {
    const nodos = doc.getMap<Y.Map<unknown>>(CLAVES.nodes);
    for (const [id, nodo] of Object.entries(escena.nodes ?? {})) {
      const mapa = new Y.Map<unknown>();
      for (const [clave, valor] of Object.entries(
        nodo as Record<string, unknown>,
      )) {
        if (valor !== undefined) mapa.set(clave, valor);
      }
      nodos.set(id, mapa);
    }

    const colecciones = doc.getMap<unknown>(CLAVES.collections);
    for (const [clave, valor] of Object.entries(escena.collections ?? {})) {
      if (valor !== undefined) colecciones.set(clave, valor);
    }

    const materiales = doc.getMap<unknown>(CLAVES.materials);
    for (const [clave, valor] of Object.entries(escena.materials ?? {})) {
      if (valor !== undefined) materiales.set(clave, valor);
    }

    // `Set`: una raíz repetida en la base multiplica el render (React clavea
    // por id y monta un `site` por copia) y termina tirando WebGPU. Sembrar
    // limpio corta la recursión.
    doc
      .getArray<string>(CLAVES.roots)
      .push([...new Set(escena.rootNodeIds ?? [])]);

    doc
      .getArray<string>(CLAVES.plugins)
      .push([...new Set(escena.installedPlugins ?? [])]);
  }, 'semilla');

  return doc;
}

/** Materializa el `Y.Doc` a la forma plana que se guarda en JSONB. */
export function materializarDocumento(doc: Y.Doc): EscenaPlana {
  return {
    nodes: doc.getMap(CLAVES.nodes).toJSON() as Record<string, unknown>,
    // Se deduplica al persistir: una raíz repetida ya rompió el editor una vez
    // (cientos de `site_default`, clave de React repetida y flood de WebGPU).
    rootNodeIds: [...new Set(doc.getArray<string>(CLAVES.roots).toJSON())],
    collections: doc.getMap(CLAVES.collections).toJSON() as Record<
      string,
      unknown
    >,
    materials: doc.getMap(CLAVES.materials).toJSON() as Record<string, unknown>,
    installedPlugins: [...new Set(doc.getArray<string>(CLAVES.plugins).toJSON())],
  };
}

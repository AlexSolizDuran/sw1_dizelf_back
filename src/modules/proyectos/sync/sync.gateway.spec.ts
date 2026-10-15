import * as Y from 'yjs';

/**
 * El CRDT con la granularidad que usa el gateway: un `Y.Map` por nodo.
 *
 * Reproduce el escenario que rompe el "último PATCH gana": dos clientes que
 * editan sin verse y después sincronizan. Lo que se verifica acá es que el doc
 * que cada uno termina teniendo es el mismo, y que no se pierde ninguno de los
 * dos cambios.
 *
 * Si algún día cambia la estructura del doc, estas pruebas son las que avisan:
 * el síntoma en producción sería "el plano de mi compañero desapareció".
 */

const CLAVES = { nodes: 'scene:nodes', roots: 'scene:roots' } as const;

type Nodo = Record<string, unknown>;

const nodosDe = (doc: Y.Doc): Record<string, Nodo> =>
  doc.getMap(CLAVES.nodes).toJSON();

const nodoDe = (doc: Y.Doc, id: string): Y.Map<unknown> | undefined =>
  doc.getMap<Y.Map<unknown>>(CLAVES.nodes).get(id);

function sembrar(
  doc: Y.Doc,
  nodes: Record<string, Nodo>,
  roots: string[],
): void {
  doc.transact(() => {
    const mapa = doc.getMap<Y.Map<unknown>>(CLAVES.nodes);
    for (const [id, nodo] of Object.entries(nodes)) {
      const y = new Y.Map<unknown>();
      for (const [k, v] of Object.entries(nodo))
        if (v !== undefined) y.set(k, v);
      mapa.set(id, y);
    }
    doc.getArray<string>(CLAVES.roots).push(roots);
  }, 'semilla');
}

/** Estado inicial que el gateway manda al cliente que entra. */
function desdeEstado(doc: Y.Doc): Y.Doc {
  const nuevo = new Y.Doc();
  Y.applyUpdate(nuevo, Y.encodeStateAsUpdate(doc));
  return nuevo;
}

const sincronizar = (a: Y.Doc, b: Y.Doc): void => {
  const uA = Y.encodeStateAsUpdate(a);
  const uB = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, uB);
  Y.applyUpdate(b, uA);
};

const base = {
  site_default: { type: 'site' },
  wall_1: { type: 'wall', start: [0, 0], end: [1, 0] },
};

describe('SyncGateway — Y.Doc del plano', () => {
  it('mezcla cambios de dos clientes que editaron sin verse', () => {
    const a = new Y.Doc();
    sembrar(a, base, ['site_default']);
    const c = desdeEstado(a);

    nodoDe(a, 'wall_1')?.set('end', [9, 0]);
    nodoDe(c, 'wall_1')?.set('thickness', 0.3);

    sincronizar(a, c);

    expect(nodosDe(a).wall_1.end).toEqual([9, 0]);
    expect(nodosDe(a).wall_1.thickness).toBe(0.3);
    expect(JSON.stringify(nodosDe(c))).toBe(JSON.stringify(nodosDe(a)));
  });

  it('conserva los cambios de tres clientes sobre el mismo nodo', () => {
    const a = new Y.Doc();
    sembrar(a, base, ['site_default']);
    const d = desdeEstado(a);
    const e = desdeEstado(a);

    nodoDe(a, 'wall_1')?.set('name', 'Muro A');
    nodoDe(d, 'wall_1')?.set('height', 2.6);

    sincronizar(d, e);
    sincronizar(d, a);

    expect(nodosDe(d).wall_1.name).toBe('Muro A');
    expect(nodosDe(d).wall_1.height).toBe(2.6);
  });

  it('propaga altas y bajas de nodos', () => {
    const e = new Y.Doc();
    sembrar(e, base, ['site_default']);
    const f = desdeEstado(e);

    const nuevo = new Y.Map<unknown>();
    nuevo.set('type', 'wall');
    e.getMap(CLAVES.nodes).set('wall_2', nuevo);
    sincronizar(e, f);
    expect(nodosDe(f).wall_2).toBeDefined();

    e.getMap(CLAVES.nodes).delete('wall_2');
    sincronizar(e, f);
    expect(nodosDe(f).wall_2).toBeUndefined();
  });

  it('entrega el estado completo a quien entra tarde', () => {
    const e = new Y.Doc();
    sembrar(e, base, ['site_default']);
    nodoDe(e, 'wall_1')?.set('height', 2.6);

    const tarde = desdeEstado(e);

    expect(Object.keys(nodosDe(tarde)).sort()).toEqual(
      Object.keys(nodosDe(e)).sort(),
    );
    expect(tarde.getArray<string>(CLAVES.roots).toJSON()).toEqual([
      'site_default',
    ]);
  });

  it('es idempotente ante updates repetidos', () => {
    const a = new Y.Doc();
    sembrar(a, base, ['site_default']);
    const b = desdeEstado(a);

    nodoDe(a, 'wall_1')?.set('height', 3);
    const update = Y.encodeStateAsUpdate(a);

    Y.applyUpdate(b, update);
    Y.applyUpdate(b, update);

    expect(nodosDe(b).wall_1.height).toBe(3);
  });
});

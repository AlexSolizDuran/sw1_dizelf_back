/* eslint-disable @typescript-eslint/unbound-method */
import * as Y from 'yjs';
import type { Socket } from 'socket.io';
import { sembrarDocumento, type EscenaPlana } from './documento-yjs';
import { SyncGateway } from './sync.gateway';

// `@nestjs/config` publica ESM y Jest corre CJS: el gateway lo importa de forma
// transitiva vía `TokenVerificadorService`. El gateway de este test recibe un
// verificador falso, así que basta con que el módulo exista.
jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {},
}));

jest.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    signAsync(): Promise<string> {
      return Promise.resolve('token');
    }
    verifyAsync<T>(): Promise<T> {
      throw new Error('no usado en este test');
    }
  },
}));

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

/**
 * El sembrado es el punto donde un doc vacío puede borrar partes del documento:
 * si el gateway solo carga nodos y raíces, el primer persist deja
 * `collections`, `materials` e `installedPlugins` en `{}` y el editor las pierde
 * al reabrir.
 */
describe('Sembrado del documento', () => {
  it('siembra las cinco estructuras y deduplica raíces y plugins', () => {
    const escena: EscenaPlana = {
      nodes: { site_default: { type: 'site' } },
      rootNodeIds: ['site_default', 'site_default'],
      collections: { col_1: { id: 'col_1', name: 'Planta baja' } },
      materials: { mat_1: { id: 'mat_1', name: 'Hormigón' } },
      installedPlugins: ['pascal:trees', 'pascal:trees'],
    };

    const doc = sembrarDocumento(escena);

    expect(doc.getMap('scene:nodes').toJSON()).toEqual({
      site_default: { type: 'site' },
    });
    expect(doc.getArray('scene:roots').toJSON()).toEqual(['site_default']);
    expect(doc.getArray('scene:plugins').toJSON()).toEqual(['pascal:trees']);
    expect(doc.getMap('scene:collections').toJSON()).toEqual({
      col_1: { id: 'col_1', name: 'Planta baja' },
    });
    expect(doc.getMap('scene:materials').toJSON()).toEqual({
      mat_1: { id: 'mat_1', name: 'Hormigón' },
    });
  });
});

/**
 * Apagado del proceso.
 *
 * En Render cada deploy manda SIGTERM. Antes el gateway lanzaba los guardados
 * con `void` y el proceso podía morir antes de que el último autosave llegara a
 * la base; el usuario perdía los últimos cambios del plano.
 */
describe('SyncGateway — apagado', () => {
  interface SesionPrueba {
    doc: Y.Doc;
    refCount: number;
    timer: ReturnType<typeof setTimeout> | null;
    sucio: boolean;
    epoch: number;
  }

  const crearGateway = (guardar: jest.Mock) => {
    const gateway = new SyncGateway(
      {} as never,
      {} as never,
      { guardarMaterializado: guardar } as never,
    );

    return gateway as unknown as {
      sesiones: Map<string, SesionPrueba>;
      onModuleDestroy: () => Promise<void>;
    };
  };

  it('espera a que se persista cada documento antes de terminar', async () => {
    let terminar!: () => void;
    const guardado = new Promise<void>((resolver) => {
      terminar = resolver;
    });
    const guardar = jest.fn(() => guardado);
    const gateway = crearGateway(guardar);
    const doc = new Y.Doc();

    gateway.sesiones.set('p1', {
      doc,
      refCount: 0,
      timer: null,
      sucio: true,
      epoch: 0,
    });

    let apagado = false;
    const promesa = gateway.onModuleDestroy().then(() => {
      apagado = true;
    });

    await Promise.resolve();
    expect(apagado).toBe(false);
    expect(guardar).toHaveBeenCalledWith('p1', doc);

    terminar();
    await promesa;
    expect(apagado).toBe(true);
  });

  it('guarda el resto aunque uno de los documentos falle', async () => {
    const guardar = jest.fn((proyectoId: string) =>
      proyectoId === 'roto'
        ? Promise.reject(new Error('base caída'))
        : Promise.resolve(),
    );
    const gateway = crearGateway(guardar);

    for (const proyectoId of ['ok-1', 'roto', 'ok-2']) {
      gateway.sesiones.set(proyectoId, {
        doc: new Y.Doc(),
        refCount: 0,
        timer: null,
        sucio: true,
        epoch: 0,
      });
    }

    await expect(gateway.onModuleDestroy()).resolves.toBeUndefined();
    expect(guardar).toHaveBeenCalledTimes(3);
  });
});

/**
 * Autenticación del handshake.
 *
 * En producción la cookie de sesión ya no llega al backend (el login pasa por
 * el proxy same-origin del front), así que el navegador presenta un ticket en
 * `handshake.auth`. Si el gateway dejara de mirarlo, todo proyecto mostraría
 * "Sesión no válida" con el usuario logueado.
 */
describe('SyncGateway — autenticación del handshake', () => {
  const crearGateway = (ticketValido: boolean) => {
    const tokenVerificador = {
      leerTicket: (auth: unknown) =>
        typeof auth === 'object' && auth !== null
          ? (auth as { ticket?: string }).ticket
          : undefined,
      verificarTicket: jest.fn(() =>
        Promise.resolve(ticketValido ? { sub: 7 } : null),
      ),
      verificar: jest.fn(() => Promise.resolve(null)),
    };
    const membresia = {
      resolver: jest.fn(() =>
        Promise.resolve({
          estado: 'MIEMBRO',
          rol: 'CREADOR',
          puedeEditar: true,
        }),
      ),
    };
    const documento = {
      leer: jest.fn(() => Promise.resolve(null)),
      guardarMaterializado: jest.fn(() => Promise.resolve()),
    };

    const gateway = new SyncGateway(
      tokenVerificador as never,
      membresia as never,
      documento as never,
    );

    return { gateway, tokenVerificador, membresia, documento };
  };

  const crearSocket = () =>
    ({
      handshake: {
        query: { proyectoId: 'p1' },
        auth: { ticket: 'ticket-de-prueba' },
        headers: {},
      },
      data: {},
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(() => Promise.resolve()),
    }) as unknown as Socket & { emit: jest.Mock; disconnect: jest.Mock };

  it('entra con ticket válido sin mirar la cookie', async () => {
    const { gateway, tokenVerificador, membresia } = crearGateway(true);
    const socket = crearSocket();

    await gateway.handleConnection(socket);

    expect(tokenVerificador.verificarTicket).toHaveBeenCalledWith(
      'ticket-de-prueba',
      'p1',
    );
    // La cookie es el camino de respaldo, no el principal.
    expect(tokenVerificador.verificar).not.toHaveBeenCalled();
    expect(membresia.resolver).toHaveBeenCalledWith('p1', 7);
    expect(socket.emit).toHaveBeenCalledWith(
      'sync:inicial',
      expect.anything(),
      { reemplazar: false },
    );
  });

  it('rechaza el socket cuando el ticket no vale', async () => {
    const { gateway, membresia } = crearGateway(false);
    const socket = crearSocket();

    await gateway.handleConnection(socket);

    expect(membresia.resolver).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('sync:error', {
      codigo: 'SIN_SESION',
      mensaje: 'Sesión no válida.',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});

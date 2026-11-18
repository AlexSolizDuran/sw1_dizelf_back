// `@nestjs/config` publica ESM y Jest corre CJS: el servicio lo importa en
// runtime por la metadata del constructor, así que se reemplaza por un stub.
jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {},
}));

import { ConfigService } from '@nestjs/config';
import { PushService, type MensajePush } from './push.service';

const mensaje = (to: string): MensajePush => ({
  to,
  title: 'Modelo 3D listo',
  body: 'Casa ya se puede ver en 3D y AR.',
  data: { tipo: 'modelo-ar', proyectoId: 'p1' },
});

const configCon = (valores: Record<string, unknown>) =>
  ({
    get: jest.fn((clave: string, defecto?: unknown) =>
      clave in valores ? valores[clave] : defecto,
    ),
  }) as unknown as ConfigService;

describe('PushService', () => {
  const fetchOriginal = global.fetch;

  afterEach(() => {
    global.fetch = fetchOriginal;
    jest.useRealTimers();
  });

  it('no hace nada sin mensajes', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const servicio = new PushService(configCon({ 'app.pushEnabled': true }));

    await expect(servicio.enviar([])).resolves.toEqual({
      enviados: 0,
      invalidos: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no llama a Expo si el push está deshabilitado', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const servicio = new PushService(configCon({ 'app.pushEnabled': false }));

    await expect(servicio.enviar([mensaje('a')])).resolves.toEqual({
      enviados: 0,
      invalidos: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parte en lotes de 100 y cuenta los tickets ok', async () => {
    const fetchMock = jest.fn((_url: string, init: RequestInit) => {
      const lote = JSON.parse(init.body as string) as MensajePush[];
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: lote.map(() => ({ status: 'ok', id: 'ticket' })),
          }),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const servicio = new PushService(
      configCon({ 'app.pushEnabled': true, 'app.pushTimeoutMs': 4000 }),
    );

    const mensajes = Array.from({ length: 250 }, (_, indice) =>
      mensaje(`token-${indice}`),
    );

    const resultado = await servicio.enviar(mensajes);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(resultado).toEqual({ enviados: 250, invalidos: [] });
  });

  it('marca como inválidos los DeviceNotRegistered', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { status: 'ok', id: 'uno' },
              { status: 'error', details: { error: 'DeviceNotRegistered' } },
            ],
          }),
      }),
    ) as unknown as typeof fetch;
    const servicio = new PushService(configCon({ 'app.pushEnabled': true }));

    const resultado = await servicio.enviar([
      mensaje('token-bueno'),
      mensaje('token-muerto'),
    ]);

    expect(resultado).toEqual({
      enviados: 1,
      invalidos: ['token-muerto'],
    });
  });

  it('no propaga un error HTTP de Expo', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 503 }),
    ) as unknown as typeof fetch;
    const servicio = new PushService(configCon({ 'app.pushEnabled': true }));

    await expect(servicio.enviar([mensaje('a')])).resolves.toEqual({
      enviados: 0,
      invalidos: [],
    });
  });

  it('no propaga el timeout de la petición', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolver, rechazar) => {
          init.signal?.addEventListener('abort', () =>
            rechazar(new Error('abortado')),
          );
        }),
    ) as unknown as typeof fetch;

    const servicio = new PushService(
      configCon({ 'app.pushEnabled': true, 'app.pushTimeoutMs': 4000 }),
    );

    const promesa = servicio.enviar([mensaje('a')]);
    await jest.advanceTimersByTimeAsync(4000);

    await expect(promesa).resolves.toEqual({ enviados: 0, invalidos: [] });
  });

  it('manda el Authorization solo si hay EXPO_ACCESS_TOKEN', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const conToken = new PushService(
      configCon({
        'app.pushEnabled': true,
        'app.expoAccessToken': 'secreto',
      }),
    );
    await conToken.enviar([mensaje('a')]);

    const sinToken = new PushService(
      configCon({ 'app.pushEnabled': true, 'app.expoAccessToken': '' }),
    );
    await sinToken.enviar([mensaje('b')]);

    const llamadaCon = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const llamadaSin = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];

    expect(llamadaCon[1].headers).toMatchObject({
      Authorization: 'Bearer secreto',
    });
    expect(llamadaSin[1].headers).not.toHaveProperty('Authorization');
  });
});

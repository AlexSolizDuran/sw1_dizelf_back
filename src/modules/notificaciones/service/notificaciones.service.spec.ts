// `@nestjs/config` publica ESM y Jest corre CJS.
jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {},
}));

import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { DispositivosService } from './dispositivos.service';
import { NotificacionesService } from './notificaciones.service';
import { PushService } from './push.service';

const PROYECTO = '11111111-1111-4111-8111-111111111111';
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

const prismaMock = {
  proyecto: { findUnique: jest.fn() },
  dispositivoPush: { findMany: jest.fn() },
};

const pushMock = { enviar: jest.fn() };
const dispositivosMock = { borrarTokensInvalidos: jest.fn() };

const configMock = {
  get: jest.fn((clave: string, defecto?: unknown) =>
    clave === 'app.pushThrottleSegundos' ? 60 : defecto,
  ),
} as unknown as ConfigService;

describe('NotificacionesService', () => {
  let servicio: NotificacionesService;

  beforeEach(() => {
    jest.resetAllMocks();
    // `resetAllMocks` borra también la implementación de este mock.
    (configMock.get as unknown as jest.Mock).mockImplementation(
      (clave: string, defecto?: unknown) =>
        clave === 'app.pushThrottleSegundos' ? 60 : defecto,
    );
    prismaMock.proyecto.findUnique.mockResolvedValue({
      nombre: 'Casa',
      creadorId: 1,
      colaboradores: [{ usuarioId: 2 }, { usuarioId: 7 }],
    });
    prismaMock.dispositivoPush.findMany.mockResolvedValue([
      { token: TOKEN_A },
      { token: TOKEN_B },
    ]);
    pushMock.enviar.mockResolvedValue({ enviados: 2, invalidos: [] });

    servicio = new NotificacionesService(
      prismaMock as unknown as PrismaService,
      pushMock as unknown as PushService,
      dispositivosMock as unknown as DispositivosService,
      configMock,
    );
  });

  it('avisa al creador y a los colaboradores menos al actor', async () => {
    await servicio.avisarModeloPublicado({
      proyectoId: PROYECTO,
      actorId: 7,
      version: 2,
      tipo: 'actualizado',
    });

    expect(prismaMock.dispositivoPush.findMany).toHaveBeenCalledWith({
      where: { usuarioId: { in: [1, 2] } },
      select: { token: true },
    });
    expect(pushMock.enviar).toHaveBeenCalledTimes(1);
  });

  it('construye el mensaje con la ruta interna y el canal Android', async () => {
    await servicio.avisarModeloPublicado({
      proyectoId: PROYECTO,
      actorId: 7,
      version: 2,
      tipo: 'actualizado',
    });

    const llamadas = pushMock.enviar.mock.calls as unknown as [
      Array<{
        title: string;
        body: string;
        channelId: string;
        data: { url: string; tipo: string };
        collapseId: string;
      }>,
    ][];
    const mensajes = llamadas[0][0];

    expect(mensajes[0].title).toBe('Modelo 3D actualizado');
    expect(mensajes[0].body).toContain('v2');
    expect(mensajes[0].channelId).toBe('modelos-ar');
    expect(mensajes[0].collapseId).toBe(PROYECTO);
    expect(mensajes[0].data.tipo).toBe('modelo-ar');
    expect(mensajes[0].data.url).toBe(
      `/plano?proyectoId=${PROYECTO}&nombre=Casa`,
    );
  });

  it('no envía si el único destinatario es el actor', async () => {
    prismaMock.proyecto.findUnique.mockResolvedValue({
      nombre: 'Casa',
      creadorId: 7,
      colaboradores: [],
    });

    await servicio.avisarModeloPublicado({
      proyectoId: PROYECTO,
      actorId: 7,
      version: 1,
      tipo: 'creado',
    });

    expect(prismaMock.dispositivoPush.findMany).not.toHaveBeenCalled();
    expect(pushMock.enviar).not.toHaveBeenCalled();
  });

  it('no envía si nadie tiene un dispositivo registrado', async () => {
    prismaMock.dispositivoPush.findMany.mockResolvedValue([]);

    await servicio.avisarModeloPublicado({
      proyectoId: PROYECTO,
      actorId: 7,
      version: 1,
      tipo: 'creado',
    });

    expect(pushMock.enviar).not.toHaveBeenCalled();
  });

  it('borra los tokens que Expo marcó inválidos', async () => {
    pushMock.enviar.mockResolvedValue({
      enviados: 1,
      invalidos: [TOKEN_B],
    });

    await servicio.avisarModeloPublicado({
      proyectoId: PROYECTO,
      actorId: 7,
      version: 1,
      tipo: 'creado',
    });

    expect(dispositivosMock.borrarTokensInvalidos).toHaveBeenCalledWith([
      TOKEN_B,
    ]);
  });

  it('no repite el aviso dentro de la ventana de throttle', async () => {
    await servicio.avisarModeloPublicado({
      proyectoId: PROYECTO,
      actorId: 7,
      version: 1,
      tipo: 'creado',
    });
    await servicio.avisarModeloPublicado({
      proyectoId: PROYECTO,
      actorId: 7,
      version: 2,
      tipo: 'actualizado',
    });

    expect(pushMock.enviar).toHaveBeenCalledTimes(1);
  });

  it('no propaga un error de la base', async () => {
    prismaMock.proyecto.findUnique.mockRejectedValue(new Error('Neon caído'));

    await expect(
      servicio.avisarModeloPublicado({
        proyectoId: PROYECTO,
        actorId: 7,
        version: 1,
        tipo: 'creado',
      }),
    ).resolves.toBeUndefined();
  });

  it('no hace nada si el proyecto no existe', async () => {
    prismaMock.proyecto.findUnique.mockResolvedValue(null);

    await servicio.avisarModeloPublicado({
      proyectoId: PROYECTO,
      actorId: 7,
      version: 1,
      tipo: 'creado',
    });

    expect(prismaMock.dispositivoPush.findMany).not.toHaveBeenCalled();
  });
});

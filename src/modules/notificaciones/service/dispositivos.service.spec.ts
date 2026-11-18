import { PrismaService } from '../../../common/prisma/prisma.service';
import { DispositivosService } from './dispositivos.service';

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_VIEJO = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const DISPOSITIVO = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

const prismaMock = {
  $transaction: jest.fn(),
  dispositivoPush: {
    deleteMany: jest.fn(),
    upsert: jest.fn(),
  },
};

describe('DispositivosService', () => {
  let servicio: DispositivosService;

  beforeEach(() => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockResolvedValue([]);

    servicio = new DispositivosService(prismaMock as unknown as PrismaService);
  });

  it('registra el token en una transacción de tres pasos', async () => {
    await expect(
      servicio.registrar(7, {
        token: TOKEN,
        dispositivoId: DISPOSITIVO,
        plataforma: 'android',
      }),
    ).resolves.toEqual({ ok: true });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const pasos = prismaMock.$transaction.mock.calls as unknown as [
      unknown[],
    ][];
    expect(pasos[0][0]).toHaveLength(3);

    expect(prismaMock.dispositivoPush.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { token: TOKEN, usuarioId: { not: 7 } },
    });
    expect(prismaMock.dispositivoPush.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        usuarioId: 7,
        dispositivoId: DISPOSITIVO,
        token: { not: TOKEN },
      },
    });
    expect(prismaMock.dispositivoPush.upsert).toHaveBeenCalledWith({
      where: { token: TOKEN },
      create: {
        usuarioId: 7,
        dispositivoId: DISPOSITIVO,
        token: TOKEN,
        plataforma: 'android',
      },
      update: {
        usuarioId: 7,
        dispositivoId: DISPOSITIVO,
        plataforma: 'android',
      },
    });
  });

  it('da de baja solo un token propio', async () => {
    await expect(servicio.darDeBaja(7, TOKEN_VIEJO)).resolves.toEqual({
      ok: true,
    });

    expect(prismaMock.dispositivoPush.deleteMany).toHaveBeenCalledWith({
      where: { token: TOKEN_VIEJO, usuarioId: 7 },
    });
  });

  it('borra tokens inválidos sin duplicados', async () => {
    await servicio.borrarTokensInvalidos([TOKEN, TOKEN, TOKEN_VIEJO]);

    expect(prismaMock.dispositivoPush.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: [TOKEN, TOKEN_VIEJO] } },
    });
  });

  it('no consulta la base si no hay tokens inválidos', async () => {
    await servicio.borrarTokensInvalidos([]);

    expect(prismaMock.dispositivoPush.deleteMany).not.toHaveBeenCalled();
  });
});

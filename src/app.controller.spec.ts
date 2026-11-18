import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './common/prisma/prisma.service';

const prismaMock = {
  $queryRaw: jest.fn(),
};

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reporta vivo sin consultar la base', () => {
      const salud = appController.salud();

      expect(salud.estado).toBe('ok');
      expect(salud.uptimeSegundos).toEqual(expect.any(Number));
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('ready responde ok cuando la base contesta', async () => {
      await expect(appController.listo()).resolves.toEqual({
        estado: 'ok',
        baseDeDatos: 'ok',
      });
    });

    it('ready responde 503 cuando la base falla', async () => {
      prismaMock.$queryRaw.mockRejectedValue(new Error('Neon caído'));

      await expect(appController.listo()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});

// `@nestjs/config` publica ESM y Jest corre CJS; el servicio de notificaciones
// lo importa de forma transitiva.
jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {},
}));

import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ALMACEN_OBJETOS } from '../../../common/storage/almacen-objetos.token';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificacionesService } from '../../notificaciones/service/notificaciones.service';
import { ModeloArService, LIMITE_BYTES_MODELO } from './modelo-ar.service';

const PROYECTO = '11111111-1111-4111-8111-111111111111';
const OTRO_PROYECTO = '22222222-2222-4222-8222-222222222222';
const CLAVE = `modelos/${PROYECTO}/33333333-3333-4333-8333-333333333333.glb`;
const CLAVE_ANTERIOR = `modelos/${PROYECTO}/44444444-4444-4444-8444-444444444444.glb`;

const prismaMock = {
  modeloAr: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

const almacenMock = {
  urlSubida: jest.fn(),
  urlLectura: jest.fn(),
  cabeza: jest.fn(),
  primerosBytes: jest.fn(),
  borrar: jest.fn(),
};

const notificacionesMock = {
  avisarModeloPublicado: jest.fn(),
};

describe('ModeloArService', () => {
  let servicio: ModeloArService;

  beforeEach(async () => {
    jest.resetAllMocks();
    notificacionesMock.avisarModeloPublicado.mockResolvedValue(undefined);

    const modulo: TestingModule = await Test.createTestingModule({
      providers: [
        ModeloArService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ALMACEN_OBJETOS, useValue: almacenMock },
        { provide: NotificacionesService, useValue: notificacionesMock },
      ],
    }).compile();

    servicio = modulo.get(ModeloArService);
  });

  describe('crearUrlSubida', () => {
    it('firma una clave nueva dentro del proyecto', async () => {
      almacenMock.urlSubida.mockResolvedValue('https://bucket/firmada');

      const resultado = await servicio.crearUrlSubida(PROYECTO);

      expect(resultado.url).toBe('https://bucket/firmada');
      expect(resultado.clave).toMatch(
        new RegExp(`^modelos/${PROYECTO}/[0-9a-f-]{36}\\.glb$`),
      );
      expect(almacenMock.urlSubida).toHaveBeenCalledWith(
        resultado.clave,
        'model/gltf-binary',
        expect.any(Number),
      );
    });
  });

  describe('confirmar', () => {
    it('rechaza una clave de otro proyecto sin tocar el bucket', async () => {
      await expect(
        servicio.confirmar(PROYECTO, 7, {
          clave: CLAVE.replace(PROYECTO, OTRO_PROYECTO),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(almacenMock.cabeza).not.toHaveBeenCalled();
    });

    it('rechaza la confirmación si el objeto no existe', async () => {
      almacenMock.cabeza.mockResolvedValue(null);

      await expect(
        servicio.confirmar(PROYECTO, 7, { clave: CLAVE }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('borra el objeto y rechaza si no tiene la firma glTF', async () => {
      almacenMock.cabeza.mockResolvedValue({
        bytes: 1024,
        contentType: 'model/gltf-binary',
      });
      almacenMock.primerosBytes.mockResolvedValue(Buffer.from('<htm'));

      await expect(
        servicio.confirmar(PROYECTO, 7, { clave: CLAVE }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(almacenMock.borrar).toHaveBeenCalledWith(CLAVE);
      expect(prismaMock.modeloAr.upsert).not.toHaveBeenCalled();
    });

    it('borra el objeto y responde 413 si supera el límite', async () => {
      almacenMock.cabeza.mockResolvedValue({
        bytes: LIMITE_BYTES_MODELO + 1,
        contentType: 'model/gltf-binary',
      });

      await expect(
        servicio.confirmar(PROYECTO, 7, { clave: CLAVE }),
      ).rejects.toBeInstanceOf(PayloadTooLargeException);

      expect(almacenMock.borrar).toHaveBeenCalledWith(CLAVE);
      expect(prismaMock.modeloAr.upsert).not.toHaveBeenCalled();
    });

    it('publica, incrementa la versión y borra el GLB anterior', async () => {
      almacenMock.cabeza.mockResolvedValue({
        bytes: 5_000_000,
        contentType: 'model/gltf-binary',
      });
      almacenMock.primerosBytes.mockResolvedValue(Buffer.from('glTF'));
      prismaMock.modeloAr.findUnique.mockResolvedValue({
        clave: CLAVE_ANTERIOR,
      });
      prismaMock.modeloAr.upsert.mockResolvedValue({
        version: 3,
        bytes: 5_000_000,
        actualizado: new Date('2026-11-17T12:00:00.000Z'),
      });

      const meta = await servicio.confirmar(PROYECTO, 7, { clave: CLAVE });

      expect(meta).toEqual({
        hay: true,
        version: 3,
        bytes: 5_000_000,
        actualizado: '2026-11-17T12:00:00.000Z',
      });
      // Se leen los argumentos con tipo en vez de `expect.objectContaining`:
      // el espía es `any` y el lint del proyecto prohíbe asignarlo sin tipar.
      const llamadas = prismaMock.modeloAr.upsert.mock.calls as unknown as [
        [
          {
            where: { proyectoId: string };
            create: { version: number };
            update: { version: { increment: number } };
          },
        ],
      ];
      const [argumentos] = llamadas[0];
      expect(argumentos.where).toEqual({ proyectoId: PROYECTO });
      expect(argumentos.create.version).toBe(1);
      expect(argumentos.update.version).toEqual({ increment: 1 });
      expect(almacenMock.borrar).toHaveBeenCalledWith(CLAVE_ANTERIOR);
      expect(notificacionesMock.avisarModeloPublicado).toHaveBeenCalledWith({
        proyectoId: PROYECTO,
        actorId: 7,
        version: 3,
        tipo: 'actualizado',
      });
    });

    it('avisa como creado la primera publicación', async () => {
      almacenMock.cabeza.mockResolvedValue({
        bytes: 1024,
        contentType: 'model/gltf-binary',
      });
      almacenMock.primerosBytes.mockResolvedValue(Buffer.from('glTF'));
      prismaMock.modeloAr.findUnique.mockResolvedValue(null);
      prismaMock.modeloAr.upsert.mockResolvedValue({
        version: 1,
        bytes: 1024,
        actualizado: new Date('2026-11-17T12:00:00.000Z'),
      });

      await servicio.confirmar(PROYECTO, 7, { clave: CLAVE });

      expect(notificacionesMock.avisarModeloPublicado).toHaveBeenCalledWith({
        proyectoId: PROYECTO,
        actorId: 7,
        version: 1,
        tipo: 'creado',
      });
    });

    it('publica aunque el aviso de push falle', async () => {
      almacenMock.cabeza.mockResolvedValue({
        bytes: 1024,
        contentType: 'model/gltf-binary',
      });
      almacenMock.primerosBytes.mockResolvedValue(Buffer.from('glTF'));
      prismaMock.modeloAr.findUnique.mockResolvedValue(null);
      prismaMock.modeloAr.upsert.mockResolvedValue({
        version: 1,
        bytes: 1024,
        actualizado: new Date('2026-11-17T12:00:00.000Z'),
      });
      notificacionesMock.avisarModeloPublicado.mockRejectedValue(
        new Error('Expo caído'),
      );

      await expect(
        servicio.confirmar(PROYECTO, 7, { clave: CLAVE }),
      ).resolves.toMatchObject({ version: 1 });
    });

    it('no se cae si el borrado del anterior falla', async () => {
      almacenMock.cabeza.mockResolvedValue({
        bytes: 1024,
        contentType: 'model/gltf-binary',
      });
      almacenMock.primerosBytes.mockResolvedValue(Buffer.from('glTF'));
      prismaMock.modeloAr.findUnique.mockResolvedValue({
        clave: CLAVE_ANTERIOR,
      });
      prismaMock.modeloAr.upsert.mockResolvedValue({
        version: 2,
        bytes: 1024,
        actualizado: new Date('2026-11-17T12:00:00.000Z'),
      });
      almacenMock.borrar.mockRejectedValue(new Error('S3 caído'));

      await expect(
        servicio.confirmar(PROYECTO, 7, { clave: CLAVE }),
      ).resolves.toMatchObject({ version: 2 });
    });
  });

  describe('lectura', () => {
    it('responde 404 si el proyecto nunca se publicó', async () => {
      prismaMock.modeloAr.findUnique.mockResolvedValue(null);

      await expect(servicio.urlLectura(PROYECTO)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('firma la lectura del objeto vigente', async () => {
      prismaMock.modeloAr.findUnique.mockResolvedValue({ clave: CLAVE });
      almacenMock.urlLectura.mockResolvedValue('https://bucket/lectura');

      await expect(servicio.urlLectura(PROYECTO)).resolves.toBe(
        'https://bucket/lectura',
      );
      expect(almacenMock.urlLectura).toHaveBeenCalledWith(CLAVE);
    });

    it('meta devuelve hay:false cuando no hay modelo', async () => {
      prismaMock.modeloAr.findUnique.mockResolvedValue(null);

      await expect(servicio.meta(PROYECTO)).resolves.toEqual({
        hay: false,
        version: 0,
        bytes: 0,
        actualizado: null,
      });
    });
  });
});

/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsuariosService } from './usuarios.service';

describe('UsuariosService', () => {
  let service: UsuariosService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const prismaMock = {
      usuario: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      persona: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as jest.Mocked<PrismaService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsuariosService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<UsuariosService>(UsuariosService);
    prisma = module.get(PrismaService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('crearUsuarioConPersona', () => {
    const params = {
      nombre: 'Juan',
      apellido: 'Perez',
      gmail: 'juan.perez@example.com',
      username: 'juanperez',
      hashContrasena: 'hash_secreto_123',
    };

    it('debe crear exitosamente una persona y usuario en una transacción', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.persona.findUnique as jest.Mock).mockResolvedValue(null);

      const fakeUsuario = {
        id: 1,
        username: 'juanperez',
        persona: {
          id: 10,
          nombre: 'Juan',
          apellido: 'Perez',
          gmail: 'juan.perez@example.com',
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (tx: unknown) => Promise<unknown>) => {
          const txMock = {
            persona: { create: jest.fn().mockResolvedValue({ id: 10 }) },
            usuario: { create: jest.fn().mockResolvedValue(fakeUsuario) },
          };
          return (await cb(txMock)) as typeof fakeUsuario;
        },
      );

      const result = await service.crearUsuarioConPersona(params);

      expect(result).toEqual(fakeUsuario);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('debe lanzar ConflictException si el username ya está registrado', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({ id: 1 });

      await expect(service.crearUsuarioConPersona(params)).rejects.toThrow(
        ConflictException,
      );
    });

    it('debe lanzar ConflictException si el correo ya está registrado', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.persona.findUnique as jest.Mock).mockResolvedValue({ id: 10 });

      await expect(service.crearUsuarioConPersona(params)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('obtenerPerfilPorId', () => {
    it('debe retornar el perfil si el usuario existe', async () => {
      const mockProfile = {
        id: 1,
        username: 'juanperez',
        persona: {
          id: 10,
          nombre: 'Juan',
          apellido: 'Perez',
          gmail: 'juan.perez@example.com',
        },
      };

      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(mockProfile);

      const result = await service.obtenerPerfilPorId(1);
      expect(result).toEqual(mockProfile);
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.obtenerPerfilPorId(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

/* eslint-disable @typescript-eslint/unbound-method */
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { UsuariosService } from '../usuarios/usuarios.service';

jest.mock('@nestjs/jwt', () => {
  return {
    JwtService: class MockJwtService {
      signAsync = jest.fn();
      verifyAsync = jest.fn();
      decode = jest.fn();
    },
  };
});

jest.mock('@nestjs/config', () => {
  return {
    ConfigService: class MockConfigService {
      get = jest.fn();
    },
  };
});

jest.mock('bcrypt');

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let usuariosService: jest.Mocked<UsuariosService>;
  let jwtService: jest.Mocked<JwtService>;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    const usuariosServiceMock = {
      crearUsuarioConPersona: jest.fn(),
      buscarPorUsernameParaAutenticacion: jest.fn(),
      buscarPorGmailParaAutenticacion: jest.fn(),
    } as unknown as jest.Mocked<UsuariosService>;

    const jwtServiceMock = {
      signAsync: jest.fn(),
      decode: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<JwtService>;

    const configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'app.nodeEnv') return 'test';
        if (key === 'app.jwtSecret') return 'test_secret_1234567890';
        if (key === 'app.jwtExpiracionMovilSegundos') return 2592000;
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsuariosService, useValue: usuariosServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usuariosService = module.get(UsuariosService);
    jwtService = module.get(JwtService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('registrar', () => {
    it('debe registrar al usuario, hashear password, generar token y establecer cookie', async () => {
      const registerDto = {
        nombre: 'Carlos',
        apellido: 'Gomez',
        gmail: 'carlos@example.com',
        username: 'carlosg',
        password: 'Password123!',
      };

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      usuariosService.crearUsuarioConPersona.mockResolvedValue({
        id: 1,
        username: 'carlosg',
        persona: {
          id: 5,
          nombre: 'Carlos',
          apellido: 'Gomez',
          gmail: 'carlos@example.com',
        },
      });
      jwtService.signAsync.mockResolvedValue('jwt_token_sample');

      const result = await service.registrar(
        registerDto,
        mockResponse as Response,
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('Password123!', 10);
      expect(usuariosService.crearUsuarioConPersona).toHaveBeenCalled();
      expect(jwtService.signAsync).toHaveBeenCalled();
      expect(mockResponse.cookie).toHaveBeenCalledWith(
        'access_token',
        'jwt_token_sample',
        expect.any(Object),
      );
      expect(result.usuario.username).toBe('carlosg');
    });
  });

  describe('tokenMovil', () => {
    const fakeUser = {
      id: 7,
      username: 'ana',
      hashContrasena: 'hashed_password',
      personaId: 9,
      persona: {
        id: 9,
        nombre: 'Ana',
        apellido: 'Perez',
        gmail: 'ana@example.com',
      },
      proyectosCreados: [],
      colaboraciones: [],
    };

    it('devuelve el token en el cuerpo, sin cookie', async () => {
      usuariosService.buscarPorUsernameParaAutenticacion.mockResolvedValue(
        fakeUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('token_movil');

      const resultado = await service.tokenMovil({
        identificador: 'ana',
        password: 'Password123!',
      });

      expect(resultado.token).toBe('token_movil');
      expect(resultado.expiraEnSegundos).toBe(2592000);
      expect(resultado.usuario).toEqual({
        id: 7,
        username: 'ana',
        persona: fakeUser.persona,
      });
      // Lo importante: un cliente nativo no depende de la cookie.
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('firma con la vigencia móvil, no con la del web', async () => {
      usuariosService.buscarPorGmailParaAutenticacion.mockResolvedValue(
        fakeUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('token_movil');

      await service.tokenMovil({
        identificador: 'ana@example.com',
        password: 'Password123!',
      });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 7, username: 'ana' }),
        { expiresIn: 2592000 },
      );
    });

    it('rechaza credenciales inválidas sin emitir token', async () => {
      usuariosService.buscarPorUsernameParaAutenticacion.mockResolvedValue(
        fakeUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.tokenMovil({ identificador: 'ana', password: 'mala' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const fakeUser = {
      id: 1,
      username: 'carlosg',
      hashContrasena: 'hashed_password',
      personaId: 5,
      persona: {
        id: 5,
        nombre: 'Carlos',
        apellido: 'Gomez',
        gmail: 'carlos@example.com',
      },
      proyectosCreados: [],
      colaboraciones: [],
    };

    it('debe iniciar sesión exitosamente con username y contraseña válida', async () => {
      usuariosService.buscarPorUsernameParaAutenticacion.mockResolvedValue(
        fakeUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('token_123');

      const result = await service.login(
        { identificador: 'carlosg', password: 'Password123!' },
        mockResponse as Response,
      );

      expect(
        usuariosService.buscarPorUsernameParaAutenticacion,
      ).toHaveBeenCalledWith('carlosg');
      expect(bcrypt.compare).toHaveBeenCalledWith(
        'Password123!',
        'hashed_password',
      );
      expect(mockResponse.cookie).toHaveBeenCalled();
      expect(result.usuario.id).toBe(1);
    });

    it('ajusta el maxAge de la cookie a la vigencia real del token', async () => {
      usuariosService.buscarPorUsernameParaAutenticacion.mockResolvedValue(
        fakeUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('token_1h');
      jwtService.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      await service.login(
        { identificador: 'carlosg', password: 'Password123!' },
        mockResponse as Response,
      );

      const llamada = (mockResponse.cookie as jest.Mock).mock.calls[0] as [
        string,
        string,
        { maxAge: number },
      ];
      const opciones = llamada[2];

      expect(jwtService.decode).toHaveBeenCalledWith('token_1h');
      expect(opciones.maxAge).toBeGreaterThan(3_590_000);
      expect(opciones.maxAge).toBeLessThanOrEqual(3_600_000);
    });

    it('debe iniciar sesión exitosamente cuando se proporciona un email', async () => {
      usuariosService.buscarPorGmailParaAutenticacion.mockResolvedValue(
        fakeUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync.mockResolvedValue('token_123');

      const result = await service.login(
        { identificador: 'carlos@example.com', password: 'Password123!' },
        mockResponse as Response,
      );

      expect(
        usuariosService.buscarPorGmailParaAutenticacion,
      ).toHaveBeenCalledWith('carlos@example.com');
      expect(result.usuario.username).toBe('carlosg');
    });

    it('debe lanzar UnauthorizedException si el usuario no existe', async () => {
      usuariosService.buscarPorUsernameParaAutenticacion.mockResolvedValue(
        null,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login(
          { identificador: 'inexistente', password: 'Password123!' },
          mockResponse as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debe lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      usuariosService.buscarPorUsernameParaAutenticacion.mockResolvedValue(
        fakeUser,
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login(
          { identificador: 'carlosg', password: 'WrongPassword!' },
          mockResponse as Response,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('debe limpiar la cookie de sesión', () => {
      const result = service.logout(mockResponse as Response);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(Object),
      );
      expect(result.message).toContain('Sesión cerrada');
    });
  });
});

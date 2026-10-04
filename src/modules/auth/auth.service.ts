import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Servicio encargado de la orquestación de autenticación, emisión de tokens JWT,
 * verificación criptográfica y gestión de cookies de sesión segura httpOnly.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds = 10;
  private readonly cookieName = 'access_token';

  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Registra una nueva cuenta de usuario y persona, encripta su contraseña
   * y establece la cookie de sesión automáticamente.
   *
   * @param dto Datos validados de registro.
   * @param res Objeto Response de Express para adjuntar la cookie httpOnly.
   */
  async registrar(dto: RegisterDto, res: Response): Promise<AuthResponseDto> {
    this.logger.log(`Iniciando registro para usuario: ${dto.username}`);

    // Hashing de contraseña con factor de coste calibrado
    const hashContrasena = await bcrypt.hash(dto.password, this.saltRounds);

    const usuario = await this.usuariosService.crearUsuarioConPersona({
      nombre: dto.nombre.trim(),
      apellido: dto.apellido.trim(),
      gmail: dto.gmail.toLowerCase().trim(),
      username: dto.username.toLowerCase().trim(),
      hashContrasena,
    });

    // Emisión del token JWT de sesión
    const token = await this.generarToken(
      usuario.id,
      usuario.username,
      usuario.persona.gmail,
    );

    // Fijación de la cookie httpOnly
    this.establecerCookieAuth(res, token);

    return {
      message: 'Usuario registrado exitosamente.',
      usuario,
    };
  }

  /**
   * Autentica a un usuario mediante su username o correo y contraseña.
   * Implementa protección contra ataques de enumeración y temporización.
   *
   * @param dto Credenciales del usuario.
   * @param res Objeto Response para adjuntar la cookie de sesión.
   */
  async login(dto: LoginDto, res: Response): Promise<AuthResponseDto> {
    const identificador = dto.identificador.toLowerCase().trim();
    const esEmail = identificador.includes('@');

    // Búsqueda flexible por email o nombre de usuario
    const usuario = esEmail
      ? await this.usuariosService.buscarPorGmailParaAutenticacion(
          identificador,
        )
      : await this.usuariosService.buscarPorUsernameParaAutenticacion(
          identificador,
        );

    // Prevención de ataques de temporización si el usuario no existe
    if (!usuario) {
      await bcrypt.compare(
        dto.password,
        '$2b$10$dummyHashToPreventTimingAttacks1234567890123456789012',
      );
      this.logger.warn(
        `Intento de login fallido: Identificador no encontrado (${identificador})`,
      );
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // Verificación de la contraseña
    const passwordValida = await bcrypt.compare(
      dto.password,
      usuario.hashContrasena,
    );
    if (!passwordValida) {
      this.logger.warn(
        `Intento de login fallido: Contraseña incorrecta para ${usuario.username}`,
      );
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // Emisión y almacenamiento de la sesión
    const token = await this.generarToken(
      usuario.id,
      usuario.username,
      usuario.persona.gmail,
    );
    this.establecerCookieAuth(res, token);

    this.logger.log(
      `Inicio de sesión exitoso para usuario: ${usuario.username} (ID: ${usuario.id})`,
    );

    return {
      message: 'Inicio de sesión exitoso.',
      usuario: {
        id: usuario.id,
        username: usuario.username,
        persona: {
          id: usuario.persona.id,
          nombre: usuario.persona.nombre,
          apellido: usuario.persona.apellido,
          gmail: usuario.persona.gmail,
        },
      },
    };
  }

  /**
   * Cierra la sesión activa del usuario eliminando la cookie httpOnly.
   *
   * @param res Objeto Response para invalidar la cookie.
   */
  logout(res: Response): { message: string } {
    this.limpiarCookieAuth(res);
    return {
      message: 'Sesión cerrada exitosamente.',
    };
  }

  /**
   * Genera y firma criptográficamente el token JWT con los datos de identidad.
   */
  private async generarToken(
    userId: number,
    username: string,
    gmail: string,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: userId,
      username,
      gmail,
    };

    return this.jwtService.signAsync(payload);
  }

  /**
   * Configura la cookie httpOnly con banderas de seguridad según el entorno.
   */
  private establecerCookieAuth(res: Response, token: string): void {
    const isProd =
      this.configService.get<string>('app.nodeEnv') === 'production';

    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 horas de vigencia
      path: '/',
    });
  }

  /**
   * Invalida y elimina la cookie de sesión del navegador del cliente.
   */
  private limpiarCookieAuth(res: Response): void {
    const isProd =
      this.configService.get<string>('app.nodeEnv') === 'production';

    res.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
    });
  }
}

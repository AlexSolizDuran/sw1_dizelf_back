import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenMovilDto } from './dto/token-movil.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Servicio encargado de la orquestación de autenticación, emisión de tokens JWT,
 * verificación criptográfica y gestión de cookies de sesión segura httpOnly.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly saltRounds = 10;
  /** Nombre estándar de la cookie (ver skill nestjs-standards). */
  private readonly cookieName = 'tokenAcceso';
  /** Nombre anterior conservado solo para transición de sesiones existentes. */
  private readonly nombreCookieLegada = 'access_token';

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
    const usuario = await this.validarCredenciales(dto);

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
      usuario: this.perfilDe(usuario),
    };
  }

  /**
   * Emite un JWT en el CUERPO para la app móvil.
   *
   * POR QUÉ EXISTE
   * -------------
   * Un cliente nativo no puede leer la cookie httpOnly `tokenAcceso` con la que
   * viaja el token del web, así que no tiene forma de armar un `Bearer`. Este
   * endpoint valida las mismas credenciales y devuelve el token en el cuerpo,
   * sin setear cookie: el WebView y el navegador siguen usando `/auth/login`.
   *
   * La vigencia es aparte (`JWT_EXPIRACION_MOVIL_SEGUNDOS`, 30 días por
   * defecto) porque una app instalada no va a pedir la contraseña cada día.
   */
  async tokenMovil(dto: LoginDto): Promise<TokenMovilDto> {
    const usuario = await this.validarCredenciales(dto);
    const expiraEnSegundos = this.expiracionMovil();

    const token = await this.generarToken(
      usuario.id,
      usuario.username,
      usuario.persona.gmail,
      expiraEnSegundos,
    );

    this.logger.log(
      `Token móvil emitido para usuario: ${usuario.username} (ID: ${usuario.id}).`,
    );

    return {
      token,
      expiraEnSegundos,
      usuario: this.perfilDe(usuario),
    };
  }

  /**
   * Valida credenciales y devuelve el usuario con su persona.
   *
   * Compartido por `/auth/login` (cookie) y `/auth/token` (app): la lógica de
   * enumeración y temporización vive en un solo lugar.
   */
  private async validarCredenciales(dto: LoginDto) {
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

    return usuario;
  }

  /** Datos públicos del perfil, sin contraseña ni hash. */
  private perfilDe(usuario: {
    id: number;
    username: string;
    persona: {
      id: number;
      nombre: string;
      apellido: string;
      gmail: string;
    };
  }): AuthResponseDto['usuario'] {
    return {
      id: usuario.id,
      username: usuario.username,
      persona: {
        id: usuario.persona.id,
        nombre: usuario.persona.nombre,
        apellido: usuario.persona.apellido,
        gmail: usuario.persona.gmail,
      },
    };
  }

  /**
   * Segundos de vigencia del token móvil.
   *
   * Se expresa en segundos (no en `30d`) porque es lo que espera `signAsync` y
   * lo que la app necesita para programar su re-login sin parsear duraciones.
   */
  private expiracionMovil(): number {
    const configurado = Number(
      this.configService.get<number | string>('app.jwtExpiracionMovilSegundos'),
    );
    return Number.isFinite(configurado) && configurado > 0
      ? configurado
      : 30 * 24 * 60 * 60;
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
    expiraEnSegundos?: number,
  ): Promise<string> {
    const payload: JwtPayload = {
      sub: userId,
      username,
      gmail,
    };

    // Sin `expiraEnSegundos` se usa la vigencia del `JwtModule` (la del web).
    return expiraEnSegundos
      ? this.jwtService.signAsync(payload, { expiresIn: expiraEnSegundos })
      : this.jwtService.signAsync(payload);
  }

  /**
   * Configura la cookie httpOnly con banderas de seguridad según el entorno.
   * En desarrollo (http://localhost) usa Lax sin Secure para que el navegador
   * conserve y reenvíe la cookie entre puertos tras un F5.
   * En producción (https / dominios distintos) usa None + Secure, exigido
   * por los navegadores para cookies cross-site.
   */
  private establecerCookieAuth(res: Response, token: string): void {
    const opciones = this.obtenerOpcionesCookie();

    res.cookie(this.cookieName, token, opciones);
    // Transición: mantiene la cookie anterior para no invalidar sesiones activas.
    res.cookie(this.nombreCookieLegada, token, opciones);
  }

  /**
   * Invalida y elimina la cookie de sesión del navegador del cliente.
   */
  private limpiarCookieAuth(res: Response): void {
    const opciones = this.obtenerOpcionesCookie();

    res.clearCookie(this.cookieName, {
      httpOnly: opciones.httpOnly,
      secure: opciones.secure,
      sameSite: opciones.sameSite,
      path: opciones.path,
    });
    res.clearCookie(this.nombreCookieLegada, {
      httpOnly: opciones.httpOnly,
      secure: opciones.secure,
      sameSite: opciones.sameSite,
      path: opciones.path,
    });
  }

  /**
   * Centraliza las banderas de la cookie para que fijar y limpiar usen
   * exactamente el mismo sameSite/secure/path (si difieren, el navegador
   * no elimina ni reenvía la cookie y el F5 parece "sacar" al usuario).
   */
  private obtenerOpcionesCookie(): {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'none';
    maxAge: number;
    path: string;
  } {
    const esProduccion =
      this.configService.get<string>('app.nodeEnv') === 'production';
    const cookieSegura =
      this.configService.get<boolean>('app.cookieSecure') ?? esProduccion;

    return {
      httpOnly: true,
      // SameSite=None exige Secure; en http local debe ser Lax sin Secure.
      secure: cookieSegura,
      sameSite: cookieSegura ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 horas, alineado con JWT_EXPIRACION=1d
      path: '/',
    };
  }
}

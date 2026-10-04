import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UsuarioPerfilDto } from '../usuarios/dto/usuario-perfil.dto';
import { UsuariosService } from '../usuarios/usuarios.service';
import { AuthService } from './auth.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Controlador de Autenticación.
 * Gestiona los flujos de registro (HU 1), inicio de sesión (HU 2),
 * cierre de sesión (HU 3) y consulta de perfil autenticado.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usuariosService: UsuariosService,
  ) {}

  /**
   * Endpoint de Registro de Usuario (HU 1).
   * Crea una Persona y un Usuario vinculados, encripta la contraseña
   * y responde con el perfil creado y la cookie de sesión httpOnly.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.authService.registrar(dto, res);
  }

  /**
   * Endpoint de Inicio de Sesión (HU 2).
   * Valida credenciales, genera el token JWT y lo inyecta en una cookie httpOnly.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, res);
  }

  /**
   * Endpoint de Cierre de Sesión (HU 3).
   * Invalida y elimina la cookie de sesión en el navegador.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response): { message: string } {
    return this.authService.logout(res);
  }

  /**
   * Endpoint para consultar el perfil del usuario actualmente autenticado.
   * Requiere sesión activa mediante cookie httpOnly o Bearer token.
   */
  @Get('perfil')
  @HttpCode(HttpStatus.OK)
  async obtenerPerfil(
    @CurrentUser() usuario: JwtPayload,
  ): Promise<UsuarioPerfilDto> {
    return this.usuariosService.obtenerPerfilPorId(usuario.sub);
  }
}

import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { BajaDispositivoDto } from '../dto/baja-dispositivo.dto';
import { RegistrarDispositivoDto } from '../dto/registrar-dispositivo.dto';
import { DispositivosService } from '../service/dispositivos.service';

/**
 * Tokens de push de la app móvil.
 *
 * El usuario sale siempre del JWT (`@CurrentUser`), nunca del cuerpo: un
 * cliente no puede registrar ni borrar tokens de otra persona.
 *
 * Los endpoints están protegidos por el `JwtAuthGuard` global. El
 * `CsrfOriginGuard` deja pasar las peticiones sin `Origin`, que es el caso de
 * React Native; un navegador ajeno no puede usarlos.
 */
@Controller('notificaciones/dispositivos')
export class DispositivosController {
  constructor(private readonly dispositivos: DispositivosService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  registrar(
    @CurrentUser('sub') usuarioId: number,
    @Body() dto: RegistrarDispositivoDto,
  ): Promise<{ ok: true }> {
    return this.dispositivos.registrar(usuarioId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  darDeBaja(
    @CurrentUser('sub') usuarioId: number,
    @Body() dto: BajaDispositivoDto,
  ): Promise<{ ok: true }> {
    return this.dispositivos.darDeBaja(usuarioId, dto.token);
  }
}

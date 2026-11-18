import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  RegistroConsumoDto,
  ResumenConsumoDto,
} from '../dto/consumo-respuesta.dto';
import { RegistrarConsumoDto } from '../dto/registrar-consumo.dto';
import { ResumenConsumoQueryDto } from '../dto/resumen-consumo.dto';
import { ConsumoIaService } from '../service/consumo-ia.service';

/**
 * Registro y consulta del consumo de tokens de los chats de IA.
 *
 * El `POST` lo llama el servidor de Next después de responder al usuario; el
 * `GET` es para que cada usuario vea su propio acumulado. No hay endpoints de
 * administración: el `usuarioId` siempre sale del JWT.
 */
@Controller('ia/consumo')
export class ConsumoIaController {
  constructor(private readonly consumoIaService: ConsumoIaService) {}

  // El servidor de Next reporta una vez por llamada a la IA. 20 por minuto y
  // por usuario alcanza de sobra para un turno normal y frena un cliente que
  // intente inflar filas de consumo a mano.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  registrar(
    @CurrentUser('sub') usuarioId: number,
    @Body() dto: RegistrarConsumoDto,
  ): Promise<RegistroConsumoDto> {
    return this.consumoIaService.registrar(usuarioId, dto);
  }

  @Get('resumen')
  @HttpCode(HttpStatus.OK)
  resumen(
    @CurrentUser('sub') usuarioId: number,
    @Query() query: ResumenConsumoQueryDto,
  ): Promise<ResumenConsumoDto> {
    return this.consumoIaService.resumen(usuarioId, query);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
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

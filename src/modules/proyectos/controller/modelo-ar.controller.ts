import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequiereCapacidad } from '../../../common/decorators/capacidad-proyecto.decorator';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import { ConfirmarModeloDto } from '../dto/modelo-ar/confirmar-modelo.dto';
import { MetaModeloDto } from '../dto/modelo-ar/meta-modelo.dto';
import { UrlModeloDto } from '../dto/modelo-ar/url-modelo.dto';
import { ModeloArService } from '../service/modelo-ar.service';

/**
 * GLB del proyecto para la experiencia de AR.
 *
 * El binario nunca pasa por este servidor: se firma una URL y el cliente habla
 * directo con el bucket. Publicar exige `editar`; leer alcanza con `leer`, así
 * un colaborador de solo lectura puede abrir la AR.
 */
@Controller('proyectos/:id/modelo')
@UseGuards(ProyectoRolGuard)
export class ModeloArController {
  constructor(private readonly modeloAr: ModeloArService) {}

  /**
   * Firma la subida del GLB.
   *
   * Clave nueva por publicación (`uuid`) en vez de reescribir la misma: un
   * `PUT` interrumpido no deja el modelo vigente apuntando a un objeto
   * truncado.
   */
  @Post('url')
  @HttpCode(HttpStatus.OK)
  @RequiereCapacidad('editar')
  crearUrlSubida(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UrlModeloDto> {
    return this.modeloAr.crearUrlSubida(id);
  }

  /**
   * Confirma que el `PUT` terminó: mide el objeto, valida la firma `glTF`,
   * incrementa la versión y borra el GLB anterior.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RequiereCapacidad('editar')
  confirmar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmarModeloDto,
  ): Promise<MetaModeloDto> {
    return this.modeloAr.confirmar(id, dto);
  }

  /**
   * Descarga del GLB vigente.
   *
   * Responde 302 a una URL prefirmada de 5 min: los bytes van del bucket al
   * cliente sin gastar el egress ni el ancho de banda del backend. Se marca
   * `no-store` porque la URL caduca; el cliente usa `/meta` para cachear.
   */
  @Get()
  @RequiereCapacidad('leer')
  async descargar(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() respuesta: Response,
  ): Promise<void> {
    const url = await this.modeloAr.urlLectura(id);
    respuesta.setHeader('Cache-Control', 'no-store');
    respuesta.redirect(HttpStatus.FOUND, url);
  }

  /** Versión, peso y fecha del GLB vigente (o `hay: false`). */
  @Get('meta')
  @RequiereCapacidad('leer')
  meta(@Param('id', ParseUUIDPipe) id: string): Promise<MetaModeloDto> {
    return this.modeloAr.meta(id);
  }
}

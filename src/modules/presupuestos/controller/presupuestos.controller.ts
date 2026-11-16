import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RequiereCapacidad } from '../../../common/decorators/capacidad-proyecto.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import { ActualizarPresupuestoDto } from '../dto/actualizar-presupuesto.dto';
import { CrearPresupuestoDto } from '../dto/crear-presupuesto.dto';
import {
  PresupuestoListaDto,
  PresupuestoRespuestaDto,
} from '../dto/presupuesto-respuesta.dto';
import { PresupuestosService } from '../service/presupuestos.service';

/**
 * Presupuestos de un proyecto.
 *
 * Todo cuelga de `/proyectos/:id` para que `ProyectoRolGuard` resuelva la
 * membresía con el mismo `:id` que ya valida en el resto del proyecto.
 */
@Controller('proyectos/:id/presupuestos')
@UseGuards(ProyectoRolGuard)
export class PresupuestosController {
  constructor(private readonly presupuestosService: PresupuestosService) {}

  /**
   * Genera un presupuesto con los precios del momento.
   *
   * El cliente manda cantidades medidas; el backend resuelve y congela los
   * precios. Lo que no tenga precio queda como línea pendiente.
   */
  @Post()
  @RequiereCapacidad('editar')
  @HttpCode(HttpStatus.CREATED)
  crear(
    @Param('id', ParseUUIDPipe) proyectoId: string,
    @CurrentUser('sub') usuarioId: number,
    @Body() dto: CrearPresupuestoDto,
  ): Promise<PresupuestoRespuestaDto> {
    return this.presupuestosService.crear(proyectoId, usuarioId, dto);
  }

  @Get()
  @RequiereCapacidad('leer')
  @HttpCode(HttpStatus.OK)
  listar(
    @Param('id', ParseUUIDPipe) proyectoId: string,
  ): Promise<PresupuestoListaDto[]> {
    return this.presupuestosService.listar(proyectoId);
  }

  @Get(':presupuestoId')
  @RequiereCapacidad('leer')
  @HttpCode(HttpStatus.OK)
  obtener(
    @Param('id', ParseUUIDPipe) proyectoId: string,
    @Param('presupuestoId', ParseUUIDPipe) presupuestoId: string,
  ): Promise<PresupuestoRespuestaDto> {
    return this.presupuestosService.obtener(proyectoId, presupuestoId);
  }

  @Patch(':presupuestoId')
  @RequiereCapacidad('editar')
  @HttpCode(HttpStatus.OK)
  renombrar(
    @Param('id', ParseUUIDPipe) proyectoId: string,
    @Param('presupuestoId', ParseUUIDPipe) presupuestoId: string,
    @Body() dto: ActualizarPresupuestoDto,
  ): Promise<PresupuestoRespuestaDto> {
    return this.presupuestosService.renombrar(proyectoId, presupuestoId, dto);
  }

  /**
   * Borrar exige `administrar`, igual que borrar el proyecto: un presupuesto es
   * un documento comercial, no un apunte de trabajo.
   */
  @Delete(':presupuestoId')
  @RequiereCapacidad('administrar')
  @HttpCode(HttpStatus.OK)
  eliminar(
    @Param('id', ParseUUIDPipe) proyectoId: string,
    @Param('presupuestoId', ParseUUIDPipe) presupuestoId: string,
  ): Promise<{ message: string }> {
    return this.presupuestosService.eliminar(proyectoId, presupuestoId);
  }
}

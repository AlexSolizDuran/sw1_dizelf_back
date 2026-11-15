import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiereCapacidad } from '../../../common/decorators/capacidad-proyecto.decorator';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import { ActualizarColaboradorDto } from '../dto/colaborador/actualizar-colaborador.dto';
import { AgregarColaboradorDto } from '../dto/colaborador/agregar-colaborador.dto';
import { ColaboradorRespuestaDto } from '../dto/colaborador/colaborador-respuesta.dto';
import { ColaboradoresService } from '../service/colaboradores.service';

@Controller('proyectos/:id/colaboradores')
@UseGuards(ProyectoRolGuard)
export class ColaboradoresController {
  constructor(private readonly colaboradoresService: ColaboradoresService) {}

  @Post()
  @RequiereCapacidad('invitar')
  @HttpCode(HttpStatus.CREATED)
  agregar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') creadorId: number,
    @Body() dto: AgregarColaboradorDto,
  ): Promise<ColaboradorRespuestaDto> {
    return this.colaboradoresService.agregarComoCreador(id, creadorId, dto);
  }

  @Get()
  @RequiereCapacidad('leer')
  @HttpCode(HttpStatus.OK)
  listar(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ColaboradorRespuestaDto[]> {
    return this.colaboradoresService.listarParaMiembro(id);
  }

  @Delete(':usuarioId')
  @RequiereCapacidad('invitar')
  @HttpCode(HttpStatus.OK)
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @CurrentUser('sub') creadorId: number,
  ): Promise<{ message: string }> {
    return this.colaboradoresService.eliminarComoCreador(
      id,
      creadorId,
      usuarioId,
    );
  }

  /**
   * Cambia el permiso de un colaborador (EDITOR ↔ LECTOR). Solo el creador:
   * la capacidad `invitar` la tiene únicamente el dueño del proyecto.
   */
  @Patch(':usuarioId')
  @RequiereCapacidad('invitar')
  @HttpCode(HttpStatus.OK)
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('usuarioId', ParseIntPipe) usuarioId: number,
    @CurrentUser('sub') creadorId: number,
    @Body() dto: ActualizarColaboradorDto,
  ): Promise<ColaboradorRespuestaDto> {
    return this.colaboradoresService.actualizarPermisoComoCreador(
      id,
      creadorId,
      usuarioId,
      dto.rol,
    );
  }
}

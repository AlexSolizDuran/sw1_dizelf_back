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
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RolesProyecto } from '../../../common/decorators/roles-proyecto.decorator';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import { AgregarColaboradorDto } from '../dto/colaborador/agregar-colaborador.dto';
import { ColaboradorRespuestaDto } from '../dto/colaborador/colaborador-respuesta.dto';
import { RolProyecto } from '../enums/rol-proyecto.enum';
import { ColaboradoresService } from '../service/colaboradores.service';

@Controller('proyectos/:id/colaboradores')
@UseGuards(ProyectoRolGuard)
export class ColaboradoresController {
  constructor(private readonly colaboradoresService: ColaboradoresService) {}

  @Post()
  @RolesProyecto(RolProyecto.CREADOR)
  @HttpCode(HttpStatus.CREATED)
  agregar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') creadorId: number,
    @Body() dto: AgregarColaboradorDto,
  ): Promise<ColaboradorRespuestaDto> {
    return this.colaboradoresService.agregarComoCreador(id, creadorId, dto);
  }

  @Get()
  @RolesProyecto(RolProyecto.CREADOR, RolProyecto.INVITADO)
  @HttpCode(HttpStatus.OK)
  listar(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ColaboradorRespuestaDto[]> {
    return this.colaboradoresService.listarParaMiembro(id);
  }

  @Delete(':usuarioId')
  @RolesProyecto(RolProyecto.CREADOR)
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
}

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
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RolesProyecto } from '../../../common/decorators/roles-proyecto.decorator';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ActualizarProyectoDto } from '../dto/proyecto/actualizar-proyecto.dto';
import { ConsultarProyectosDto } from '../dto/proyecto/consultar-proyectos.dto';
import { CrearProyectoDto } from '../dto/proyecto/crear-proyecto.dto';
import { ProyectosPaginadosDto } from '../dto/proyecto/proyecto-lista.dto';
import { ProyectoRespuestaDto } from '../dto/proyecto/proyecto-respuesta.dto';
import { RolProyecto } from '../enums/rol-proyecto.enum';
import { ProyectosService } from '../service/proyectos.service';

@Controller('proyectos')
export class ProyectosController {
  constructor(private readonly proyectosService: ProyectosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crear(
    @CurrentUser() usuario: JwtPayload,
    @Body() dto: CrearProyectoDto,
  ): Promise<ProyectoRespuestaDto> {
    return this.proyectosService.crear(usuario.sub, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  listar(
    @CurrentUser('sub') usuarioId: number,
    @Query() consulta: ConsultarProyectosDto,
  ): Promise<ProyectosPaginadosDto> {
    return this.proyectosService.listarParaUsuario(usuarioId, consulta);
  }

  @Get(':id')
  @UseGuards(ProyectoRolGuard)
  @RolesProyecto(RolProyecto.CREADOR, RolProyecto.INVITADO)
  @HttpCode(HttpStatus.OK)
  obtener(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
  ): Promise<ProyectoRespuestaDto> {
    return this.proyectosService.obtenerParaMiembro(id, usuarioId);
  }

  @Patch(':id')
  @UseGuards(ProyectoRolGuard)
  @RolesProyecto(RolProyecto.CREADOR, RolProyecto.INVITADO)
  @HttpCode(HttpStatus.OK)
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
    @Body() dto: ActualizarProyectoDto,
  ): Promise<ProyectoRespuestaDto> {
    return this.proyectosService.actualizarParaMiembro(id, usuarioId, dto);
  }

  @Delete(':id')
  @UseGuards(ProyectoRolGuard)
  @RolesProyecto(RolProyecto.CREADOR)
  @HttpCode(HttpStatus.OK)
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
  ): Promise<{ message: string }> {
    return this.proyectosService.eliminarComoCreador(id, usuarioId);
  }
}

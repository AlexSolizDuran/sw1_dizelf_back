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
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiereCapacidad } from '../../../common/decorators/capacidad-proyecto.decorator';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ActualizarProyectoDto } from '../dto/proyecto/actualizar-proyecto.dto';
import { ConsultarProyectosDto } from '../dto/proyecto/consultar-proyectos.dto';
import { CrearProyectoDto } from '../dto/proyecto/crear-proyecto.dto';
import { GuardarVersionDto } from '../dto/proyecto/guardar-version.dto';
import { ProyectosPaginadosDto } from '../dto/proyecto/proyecto-lista.dto';
import { ProyectoRespuestaDto } from '../dto/proyecto/proyecto-respuesta.dto';
import { RenombrarVersionDto } from '../dto/proyecto/renombrar-version.dto';
import { VersionRespuestaDto } from '../dto/proyecto/version-respuesta.dto';
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
  @RequiereCapacidad('leer')
  @HttpCode(HttpStatus.OK)
  obtener(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
  ): Promise<ProyectoRespuestaDto> {
    return this.proyectosService.obtenerParaMiembro(id, usuarioId);
  }

  /**
   * Actualiza metadatos del proyecto (hoy, el nombre).
   *
   * El autosave del documento ya no pasa por HTTP: lo persiste el gateway de
   * sync. Exige `editar` porque sigue siendo una escritura del proyecto.
   */
  @Patch(':id')
  @UseGuards(ProyectoRolGuard)
  @RequiereCapacidad('editar')
  @HttpCode(HttpStatus.OK)
  actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
    @Body() dto: ActualizarProyectoDto,
  ): Promise<ProyectoRespuestaDto> {
    return this.proyectosService.actualizarParaMiembro(id, usuarioId, dto);
  }

  /**
   * Guardado manual: consolida. Crea la fila en `version` y actualiza
   * `proyecto.esquema_json`. Es el único camino que respalda el trabajo.
   */
  @Post(':id/versiones')
  @UseGuards(ProyectoRolGuard)
  @RequiereCapacidad('editar')
  @HttpCode(HttpStatus.CREATED)
  guardarVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
    @Body() dto: GuardarVersionDto,
  ): Promise<VersionRespuestaDto> {
    return this.proyectosService.guardarVersion(
      id,
      usuarioId,
      dto.nombre,
      dto.esquemaJson,
    );
  }

  @Get(':id/versiones')
  @UseGuards(ProyectoRolGuard)
  @RequiereCapacidad('leer')
  @HttpCode(HttpStatus.OK)
  listarVersiones(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
  ): Promise<VersionRespuestaDto[]> {
    return this.proyectosService.listarVersiones(id, usuarioId);
  }

  @Post(':id/versiones/:versionId/restaurar')
  @UseGuards(ProyectoRolGuard)
  @RequiereCapacidad('editar')
  @HttpCode(HttpStatus.OK)
  restaurarVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ): Promise<ProyectoRespuestaDto> {
    return this.proyectosService.restaurarVersion(id, usuarioId, versionId);
  }

  /**
   * Renombra una versión del historial. Solo cambia la etiqueta, no el
   * contenido ni el documento vivo.
   */
  @Patch(':id/versiones/:versionId')
  @UseGuards(ProyectoRolGuard)
  @RequiereCapacidad('editar')
  @HttpCode(HttpStatus.OK)
  renombrarVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @Body() dto: RenombrarVersionDto,
  ): Promise<VersionRespuestaDto> {
    return this.proyectosService.renombrarVersion(
      id,
      usuarioId,
      versionId,
      dto.nombre,
    );
  }

  /** Borra una versión del historial. No toca el documento vivo. */
  @Delete(':id/versiones/:versionId')
  @UseGuards(ProyectoRolGuard)
  @RequiereCapacidad('editar')
  @HttpCode(HttpStatus.OK)
  eliminarVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
    @Param('versionId', ParseIntPipe) versionId: number,
  ): Promise<{ message: string }> {
    return this.proyectosService.eliminarVersion(id, usuarioId, versionId);
  }

  @Delete(':id')
  @UseGuards(ProyectoRolGuard)
  @RequiereCapacidad('administrar')
  @HttpCode(HttpStatus.OK)
  eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('sub') usuarioId: number,
  ): Promise<{ message: string }> {
    return this.proyectosService.eliminarComoCreador(id, usuarioId);
  }
}

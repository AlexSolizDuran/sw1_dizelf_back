import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ConsultarUsuarioDto } from './dto/consultar-usuario.dto';
import { UsuarioPerfilDto } from './dto/usuario-perfil.dto';
import { UsuariosService } from './usuarios.service';

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get('buscar')
  @HttpCode(HttpStatus.OK)
  buscar(@Query() consulta: ConsultarUsuarioDto): Promise<UsuarioPerfilDto[]> {
    return this.usuariosService.buscarParaColaboracion(consulta.termino);
  }
}

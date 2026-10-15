import { Module } from '@nestjs/common';
import { TokenVerificadorService } from '../../../common/auth/token-verificador.service';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import { ColaboradoresController } from '../controller/colaboradores.controller';
import { ProyectosController } from '../controller/proyectos.controller';
import { PresenciaGateway } from '../presencia/presencia.gateway';
import { SyncGateway } from '../sync/sync.gateway';
import { ColaboradoresService } from '../service/colaboradores.service';
import { DocumentoService } from '../service/documento.service';
import { MembresiaService } from '../service/membresia.service';
import { ProyectosService } from '../service/proyectos.service';

@Module({
  controllers: [ProyectosController, ColaboradoresController],
  providers: [
    ProyectosService,
    ColaboradoresService,
    MembresiaService,
    DocumentoService,
    ProyectoRolGuard,
    // El gateway autentica el handshake con el mismo verificador que usa el
    // guard HTTP: una sola implementación de cómo se lee y valida el token.
    TokenVerificadorService,
    PresenciaGateway,
    SyncGateway,
  ],
  exports: [ProyectosService],
})
export class ProyectosModule {}

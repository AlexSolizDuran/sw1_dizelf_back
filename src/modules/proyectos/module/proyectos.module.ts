import { Module } from '@nestjs/common';
import { TokenVerificadorService } from '../../../common/auth/token-verificador.service';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import { AuthModule } from '../../auth/auth.module';
import { ColaboradoresController } from '../controller/colaboradores.controller';
import { ModeloArController } from '../controller/modelo-ar.controller';
import { ProyectosController } from '../controller/proyectos.controller';
import { PresenciaGateway } from '../presencia/presencia.gateway';
import { SyncGateway } from '../sync/sync.gateway';
import { ColaboradoresService } from '../service/colaboradores.service';
import { DocumentoService } from '../service/documento.service';
import { MembresiaService } from '../service/membresia.service';
import { ModeloArService } from '../service/modelo-ar.service';
import { ProyectosService } from '../service/proyectos.service';

@Module({
  /**
   * `AuthModule` se importa por `JwtModule`: los gateways de presencia y sync
   * autentican el handshake con `TokenVerificadorService`, que necesita
   * `JwtService`. Sin este import el build compila y el lint pasa, pero la app
   * no arranca con `UnknownDependenciesException` — un fallo que solo aparece
   * al levantar el proceso.
   *
   * No hay ciclo: `AuthModule` importa `UsuariosModule`, no este.
   */
  imports: [AuthModule],
  controllers: [
    ProyectosController,
    ColaboradoresController,
    ModeloArController,
  ],
  providers: [
    ProyectosService,
    ColaboradoresService,
    MembresiaService,
    ModeloArService,
    DocumentoService,
    ProyectoRolGuard,
    TokenVerificadorService,
    PresenciaGateway,
    SyncGateway,
  ],
  /**
   * `MembresiaService` se exporta porque el guard de proyecto lo inyecta en
   * otros módulos (`presupuestos`). Exportar solo `ProyectosService` deja al
   * guard sin resolver la membresía al construir el módulo.
   */
  exports: [ProyectosService, MembresiaService],
})
export class ProyectosModule {}

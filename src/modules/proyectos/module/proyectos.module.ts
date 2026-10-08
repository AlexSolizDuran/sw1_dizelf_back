import { Module } from '@nestjs/common';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import { ColaboradoresController } from '../controller/colaboradores.controller';
import { ProyectosController } from '../controller/proyectos.controller';
import { ColaboradoresService } from '../service/colaboradores.service';
import { ProyectosService } from '../service/proyectos.service';

@Module({
  controllers: [ProyectosController, ColaboradoresController],
  providers: [ProyectosService, ColaboradoresService, ProyectoRolGuard],
  exports: [ProyectosService],
})
export class ProyectosModule {}

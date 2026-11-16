import { Module } from '@nestjs/common';
import { ProyectoRolGuard } from '../../../common/guards/proyecto-rol.guard';
import { ProyectosModule } from '../../proyectos/module/proyectos.module';
import {
  PresupuestoCatalogoController,
} from '../controller/presupuesto-catalogo.controller';
import { PresupuestosController } from '../controller/presupuestos.controller';
import { crearBuscadorHttp } from '../precios/proveedores/http';
import {
  crearConsultorParalelo,
  FUENTE_TIPO_CAMBIO,
} from '../precios/tipo-cambio';
import { FUENTE_PRECIOS } from '../precios/tipos';
import { PreciosService } from '../service/precios.service';
import { PresupuestosService } from '../service/presupuestos.service';
import { TipoCambioService } from '../service/tipo-cambio.service';

@Module({
  /**
   * `ProyectosModule` exporta `MembresiaService`, que es lo que necesita
   * `ProyectoRolGuard`. Sin ese export el build pasa pero la app no arranca con
   * `UnknownDependenciesException` (el mismo tipo de fallo que documenta
   * `proyectos.module.ts` para `AuthModule`).
   */
  imports: [ProyectosModule],
  controllers: [PresupuestosController, PresupuestoCatalogoController],
  providers: [
    PresupuestosService,
    PreciosService,
    TipoCambioService,
    ProyectoRolGuard,
    // El acceso a las tiendas entra por token para poder sustituirlo en tests
    // sin tocar la red.
    {
      provide: FUENTE_PRECIOS,
      useFactory: () => crearBuscadorHttp(),
    },
    // Igual con la cotización del dólar: el servicio no sabe de HTTP.
    {
      provide: FUENTE_TIPO_CAMBIO,
      useFactory: () => crearConsultorParalelo(),
    },
  ],
})
export class PresupuestosModule {}

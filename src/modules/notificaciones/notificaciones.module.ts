import { Module } from '@nestjs/common';
import { DispositivosController } from './controller/dispositivos.controller';
import { DispositivosService } from './service/dispositivos.service';
import { NotificacionesService } from './service/notificaciones.service';
import { PushService } from './service/push.service';

/**
 * Push de la app móvil.
 *
 * Exporta `NotificacionesService` para que `ProyectosModule` pueda avisar
 * cuando se publica un GLB. No importa `ProyectosModule`: la dependencia va en
 * un solo sentido y así no hay ciclo.
 */
@Module({
  controllers: [DispositivosController],
  providers: [DispositivosService, PushService, NotificacionesService],
  exports: [NotificacionesService],
})
export class NotificacionesModule {}

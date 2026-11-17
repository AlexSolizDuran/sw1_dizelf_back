import { Global, Module } from '@nestjs/common';
import { AlmacenObjetosService } from './almacen-objetos.service';
import { ALMACEN_OBJETOS } from './almacen-objetos.token';

/**
 * Acceso compartido a Object Storage.
 *
 * Es global por la misma razón que `PrismaModule`: el cliente no tiene estado
 * por request y crear una instancia por módulo multiplicaría conexiones y
 * lecturas de configuración sin beneficio.
 */
@Global()
@Module({
  providers: [
    AlmacenObjetosService,
    // Alias por token: los consumidores dependen del contrato, no de la clase.
    { provide: ALMACEN_OBJETOS, useExisting: AlmacenObjetosService },
  ],
  exports: [AlmacenObjetosService, ALMACEN_OBJETOS],
})
export class StorageModule {}

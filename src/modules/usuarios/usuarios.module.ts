import { Module } from '@nestjs/common';
import { UsuariosService } from './usuarios.service';

/**
 * Módulo del dominio de Usuarios.
 * Provee y exporta UsuariosService para ser consumido por el módulo de autenticación u otros dominios.
 */
@Module({
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}

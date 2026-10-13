import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

type JwtExpiresIn = NonNullable<JwtModuleOptions['signOptions']>['expiresIn'];

/**
 * Módulo de Autenticación.
 * Configura JwtModule de forma asíncrona mediante ConfigService,
 * integra UsuariosModule y expone AuthController y AuthService.
 */
@Module({
  imports: [
    UsuariosModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const rawExpiresIn = config.get<string>('app.jwtExpiresIn') ?? '1d';
        const expiresIn = rawExpiresIn as unknown as JwtExpiresIn;

        return {
          secret: config.get<string>('app.jwtSecret'),
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

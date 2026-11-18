import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { rastrearSolicitud } from './common/http/throttle-tracker';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import appConfig from './config/env.config';
import { envValidationSchema } from './config/env.validation';
import storageConfig from './config/storage.config';
import { AuthModule } from './modules/auth/auth.module';
import { ConsumoIaModule } from './modules/consumo-ia/module/consumo-ia.module';
import { NotificacionesModule } from './modules/notificaciones/notificaciones.module';
import { ProyectosModule } from './modules/proyectos/module/proyectos.module';
import { PresupuestosModule } from './modules/presupuestos/module/presupuestos.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, storageConfig],
      validationSchema: envValidationSchema,
    }),
    // Límite general por usuario/email+IP y por endpoint. Los valores salen de
    // config para poder ajustarlos sin recompilar; los endpoints sensibles
    // (auth, consumo IA) pisan el límite con `@Throttle`.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('app.throttleTtlMs', 60_000),
            limit: config.get<number>('app.throttleLimit', 100),
          },
        ],
        getTracker: rastrearSolicitud,
        errorMessage:
          'Demasiadas solicitudes. Esperá un momento y volvé a intentar.',
      }),
    }),
    PrismaModule,
    StorageModule,
    UsuariosModule,
    AuthModule,
    ProyectosModule,
    NotificacionesModule,
    PresupuestosModule,
    ConsumoIaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Va después de JwtAuthGuard a propósito: primero se resuelve la sesión
    // (401 si no hay), y solo después se evalúa el origen de la escritura. Al
    // revés se le diría al atacante anónimo si su origen era válido.
    {
      provide: APP_GUARD,
      useClass: CsrfOriginGuard,
    },
    // Va al final a propósito: necesita que JwtAuthGuard ya haya dejado el
    // usuario en la petición para contar por usuario (detrás del proxy de
    // Vercel todos comparten IP), y que CsrfOriginGuard haya descartado las
    // escrituras de orígenes ajenos para que no consuman cuota.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

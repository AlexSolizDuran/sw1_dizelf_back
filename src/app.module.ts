import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfOriginGuard } from './common/guards/csrf-origin.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import appConfig from './config/env.config';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { ProyectosModule } from './modules/proyectos/module/proyectos.module';
import { UsuariosModule } from './modules/usuarios/usuarios.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    UsuariosModule,
    AuthModule,
    ProyectosModule,
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
  ],
})
export class AppModule {}

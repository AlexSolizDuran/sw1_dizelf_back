import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { origenPermitido } from './common/http/origenes';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Necesario para que Nest ejecute `onModuleDestroy` al recibir SIGTERM: en
  // Render cada deploy reinicia el proceso y el gateway de sync tiene que
  // alcanzar a persistir el documento antes de cerrar.
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const frontendUrls = configService.get<string[]>('app.frontendUrls') ?? [
    'http://localhost:3000',
  ];

  // En Render (y detrás del proxy de Vercel) la IP real del cliente no es la
  // del socket. Sin esto el rate limit vería la IP del proxy para todos.
  // `1` = confiar solo en el salto inmediato, así un X-Forwarded-For enviado a
  // mano por el cliente no puede falsear la clave.
  app.set('trust proxy', 1);

  // Middleware para lectura y gestión de cookies seguras (httpOnly para JWT)
  app.use(cookieParser());

  // Validación estricta y sanitización de todas las entradas (DTOs)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS con origen exacto (sin '*') + credenciales para que el navegador
  // acepte y reenvíe la cookie httpOnly en cada fetch y tras F5.
  // Soporta lista separada por comas en FRONTEND_URL (local + previews).
  app.enableCors({
    origin: (
      origen: string | undefined,
      callback: (error: Error | null, permitir?: boolean) => void,
    ) => {
      // Permite clientes sin Origin (curl, Postman, health checks y la app
      // nativa) y valida el resto contra la misma lista que usan los gateways.
      if (origenPermitido(origen, frontendUrls)) {
        callback(null, true);
      } else {
        logger.warn(
          `CORS bloqueó origen no permitido: ${origen} (permitidos: ${frontendUrls.join(', ')})`,
        );
        callback(new Error(`Origen no permitido por CORS: ${origen}`), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(port);
  logger.log(
    `Servidor dizelf_back escuchando exitosamente en el puerto ${port}`,
  );
  logger.log(`CORS habilitado para: ${frontendUrls.join(', ')}`);
}

// Inicializar aplicación dizelf_back
void bootstrap();

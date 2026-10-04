import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const frontendUrl = configService.get<string>(
    'app.frontendUrl',
    'http://localhost:5173',
  );

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

  // Configuración de CORS segura para interactuar con el cliente frontend
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  await app.listen(port);
  logger.log(
    `Servidor dizelf_back escuchando exitosamente en el puerto ${port}`,
  );
}

// Inicializar aplicación dizelf_back
void bootstrap();

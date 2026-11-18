import type { Server } from 'node:http';
import { Controller, Get, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  SkipThrottle,
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import request from 'supertest';
import { rastrearSolicitud } from '../http/throttle-tracker';

@Controller('prueba')
class ControladorPrueba {
  @Post('login')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  login(): { ok: boolean } {
    return { ok: true };
  }

  @Get('normal')
  normal(): { ok: boolean } {
    return { ok: true };
  }

  @SkipThrottle()
  @Get('health')
  health(): { ok: boolean } {
    return { ok: true };
  }
}

/**
 * Rate limit real montado sobre HTTP.
 *
 * No usa Prisma ni la base: un controlador de prueba y el mismo guard global
 * del `AppModule`. Lo que se verifica es el comportamiento que vería un
 * atacante (429, mensaje y `Retry-After`) y que la clave por email separe
 * cuentas, que es lo que evita bloquear a todos los usuarios detrás del proxy.
 */
describe('Rate limiting', () => {
  const crearApp = async () => {
    const modulo = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 1 }],
          getTracker: rastrearSolicitud,
          errorMessage:
            'Demasiadas solicitudes. Esperá un momento y volvé a intentar.',
        }),
      ],
      controllers: [ControladorPrueba],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    const app = modulo.createNestApplication();
    await app.init();
    return app;
  };

  it('bloquea por email con 429, mensaje en español y Retry-After', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer() as Server;

    await request(servidor)
      .post('/prueba/login')
      .send({ email: 'ana@ejemplo.com' })
      .expect(201);
    await request(servidor)
      .post('/prueba/login')
      .send({ email: 'ANA@ejemplo.com ' })
      .expect(201);

    const bloqueado = await request(servidor)
      .post('/prueba/login')
      .send({ email: 'ana@ejemplo.com' })
      .expect(429);

    const cuerpo = JSON.parse(bloqueado.text) as { message: string };
    expect(cuerpo.message).toBe(
      'Demasiadas solicitudes. Esperá un momento y volvé a intentar.',
    );
    expect(bloqueado.headers['retry-after']).toBeDefined();

    // Otra cuenta conserva su propio cupo: el bloqueo no es global.
    await request(servidor)
      .post('/prueba/login')
      .send({ email: 'luis@ejemplo.com' })
      .expect(201);

    await app.close();
  });

  it('aplica el límite general y saltea los health checks', async () => {
    const app = await crearApp();
    const servidor = app.getHttpServer() as Server;

    await request(servidor).get('/prueba/normal').expect(200);
    await request(servidor).get('/prueba/normal').expect(429);

    // Render consulta el health cada pocos segundos: si contara, reiniciaría
    // el servicio por un 429.
    await request(servidor).get('/prueba/health').expect(200);
    await request(servidor).get('/prueba/health').expect(200);

    await app.close();
  });
});

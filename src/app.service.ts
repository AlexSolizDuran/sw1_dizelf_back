import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';

/** Tope de espera del chequeo de base: Render corta el health check a los 5 s. */
const TIMEOUT_SALUD_MS = 2000;

export interface SaludDto {
  estado: 'ok';
  uptimeSegundos: number;
}

export interface ReadinessDto {
  estado: 'ok';
  baseDeDatos: 'ok';
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * Liveness: el proceso está vivo y puede responder. No toca la base para no
   * reiniciar el servicio cuando lo que falla es Neon y no la API.
   */
  salud(): SaludDto {
    return { estado: 'ok', uptimeSegundos: Math.round(process.uptime()) };
  }

  /**
   * Readiness: además de estar vivo, la base responde. Es lo que usa Render
   * para decidir si manda tráfico a esta instancia.
   */
  async baseDeDatosLista(): Promise<boolean> {
    try {
      await this.consultarBaseDeDatos();
      return true;
    } catch (error) {
      this.logger.warn(
        `Health check de base de datos falló: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private async consultarBaseDeDatos(): Promise<void> {
    let temporizador: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, rechazar) => {
          temporizador = setTimeout(
            () =>
              rechazar(
                new Error(`La base no respondió en ${TIMEOUT_SALUD_MS} ms.`),
              ),
            TIMEOUT_SALUD_MS,
          );
        }),
      ]);
    } finally {
      // Sin esto el temporizador mantiene vivo el event loop en tests y en
      // cada chequeo exitoso.
      if (temporizador) clearTimeout(temporizador);
    }
  }
}

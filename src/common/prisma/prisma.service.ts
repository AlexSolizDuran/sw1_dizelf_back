import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Servicio singleton de PrismaClient para gestionar la conexión y transacciones con PostgreSQL en Neon.
 * Implementa ganchos de ciclo de vida para asegurar que las conexiones se abran y cierren limpiamente.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'stdout', level: 'info' },
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ]
          : [
              { emit: 'stdout', level: 'warn' },
              { emit: 'stdout', level: 'error' },
            ],
    });
  }

  /**
   * Se ejecuta automáticamente al inicializar el módulo.
   * Establece la conexión con la base de datos Neon.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Conexión exitosa a la base de datos Neon PostgreSQL.');
    } catch (error) {
      this.logger.error('Error al conectar con la base de datos Neon:', error);
      throw error;
    }
  }

  /**
   * Se ejecuta automáticamente al apagar la aplicación.
   * Cierra las conexiones activas evitando conexiones huérfanas en Neon Postgres.
   */
  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log('Desconexión limpia de Neon PostgreSQL completada.');
    } catch (error) {
      this.logger.error('Error al desconectar de Neon PostgreSQL:', error);
    }
  }
}

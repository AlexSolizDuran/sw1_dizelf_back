import { Module } from '@nestjs/common';
import { ConsumoIaController } from '../controller/consumo-ia.controller';
import { ConsumoIaService } from '../service/consumo-ia.service';

/**
 * Consumo de IA. `PrismaModule` es global, así que no hace falta importarlo.
 */
@Module({
  controllers: [ConsumoIaController],
  providers: [ConsumoIaService],
})
export class ConsumoIaModule {}

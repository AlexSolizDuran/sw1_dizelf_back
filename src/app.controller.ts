import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService, type ReadinessDto, type SaludDto } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Liveness: usado por Render y por el `curl` de los E2E. */
  @Public()
  @Get('health')
  salud(): SaludDto {
    return this.appService.salud();
  }

  /** Readiness: 503 si la base no responde en 2 s. */
  @Public()
  @Get('health/ready')
  async listo(): Promise<ReadinessDto> {
    const lista = await this.appService.baseDeDatosLista();

    if (!lista) {
      throw new ServiceUnavailableException(
        'La API está viva, pero la base de datos no responde.',
      );
    }

    return { estado: 'ok', baseDeDatos: 'ok' };
  }
}

import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  MaterialCatalogoDto,
  TipoCambioDto,
} from '../dto/catalogo.dto';
import { catalogoPublico } from '../precios/catalogo';
import { TipoCambioService } from '../service/tipo-cambio.service';

/**
 * Datos de referencia del presupuesto: qué materiales existen y a cuánto está
 * el dólar hoy.
 *
 * Va en su propio controlador, sin `:id` de proyecto, porque no son datos de un
 * proyecto: son del catálogo y del mercado. La autenticación la pone el
 * `JwtAuthGuard` global de `AppModule`; acá no hay membresía que validar.
 *
 * La ruta no choca con `proyectos/:id/presupuestos` porque aquel cuelga de
 * `/proyectos`.
 */
@Controller('presupuestos')
export class PresupuestoCatalogoController {
  constructor(private readonly tipoCambioService: TipoCambioService) {}

  /**
   * Lista completa de materiales presupuestables.
   *
   * Incluye los que tienen precio de tienda y los que solo se pueden cotizar a
   * mano, con `precioAutomatico` para que el cliente los agrupe sin conocer la
   * lista de claves.
   */
  @Get('catalogo')
  @HttpCode(HttpStatus.OK)
  catalogo(): MaterialCatalogoDto[] {
    return catalogoPublico();
  }

  /**
   * Cotización sugerida del dólar paralelo.
   *
   * 503 si la fuente no responde: el panel deja el campo vacío para que el
   * usuario escriba la tasa, en vez de generar totales con un número rancio.
   */
  @Get('tipo-cambio')
  @HttpCode(HttpStatus.OK)
  tipoCambio(): Promise<TipoCambioDto> {
    return this.tipoCambioService.actual();
  }
}

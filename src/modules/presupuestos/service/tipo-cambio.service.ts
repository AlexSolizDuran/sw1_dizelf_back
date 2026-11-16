import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  FUENTE_TIPO_CAMBIO,
  type ConsultorTipoCambio,
  type DolarBolivia,
} from '../precios/tipo-cambio';

/**
 * Cotización de referencia para el campo de tipo de cambio del panel.
 *
 * Es una sugerencia editable, no un dato del presupuesto: el presupuesto guarda
 * siempre la tasa que escribió (o aceptó) el usuario.
 *
 * La fuente publica cada 60 s, así que se cachea 60 s y se comparte entre
 * usuarios: el panel no necesita un pedido por cada apertura.
 */

const TTL_MS = 60 * 1000;

@Injectable()
export class TipoCambioService {
  private readonly logger = new Logger(TipoCambioService.name);
  private cache: { valor: DolarBolivia; expira: number } | null = null;
  private enVuelo: Promise<DolarBolivia | null> | null = null;

  constructor(
    @Inject(FUENTE_TIPO_CAMBIO)
    private readonly consultar: ConsultorTipoCambio,
  ) {}

  /**
   * Cotización actual, o 503 con un mensaje que el panel muestra tal cual.
   *
   * No se devuelve un número de respaldo: un tipo de cambio viejo o inventado
   * corrompe todos los totales del presupuesto sin que se note.
   */
  async actual(): Promise<DolarBolivia> {
    if (this.cache && this.cache.expira > Date.now()) {
      return this.cache.valor;
    }

    this.enVuelo ??= this.consultar().finally(() => {
      this.enVuelo = null;
    });

    const valor = await this.enVuelo;
    if (!valor) {
      throw new ServiceUnavailableException(
        'No se pudo obtener la cotización del dólar. Escribí el tipo de cambio a mano.',
      );
    }

    this.cache = { valor, expira: Date.now() + TTL_MS };
    this.logger.log(`Cotización ${valor.tasa} Bs/USD de ${valor.fuente}`);
    return valor;
  }
}

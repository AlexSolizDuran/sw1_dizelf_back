import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CATALOGO_PRECIOS } from '../precios/catalogo';
import {
  FUENTE_PRECIOS,
  type BuscadorPrecios,
  type CandidatoCatalogo,
  type FichaCatalogo,
  type PrecioResuelto,
} from '../precios/tipos';

const Decimal = Prisma.Decimal;

/** 24 h: el precio de una ferretería no cambia entre dos clics. */
const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Resuelve el precio de un material contra las tiendas.
 *
 * QUÉ GARANTIZA
 * -------------
 * 1. Nunca devuelve un precio inventado: si ningún proveedor responde con un
 *    número creíble, devuelve `null` y la línea queda pendiente.
 * 2. Nunca devuelve un número de magnitud absurda: `rangoSanidad` de la ficha
 *    descarta precios en centavos, combos por millar y productos de muestra.
 * 3. No golpea las tiendas: caché de 24 h y *single-flight*, de modo que veinte
 *    líneas del mismo cemento hacen una sola petición.
 * 4. Un proveedor caído no rompe el presupuesto: se registra y se pasa al
 *    siguiente candidato.
 */
@Injectable()
export class PreciosService {
  private readonly logger = new Logger(PreciosService.name);
  private readonly cache = new Map<
    string,
    { valor: PrecioResuelto | null; expira: number }
  >();
  private readonly enVuelo = new Map<
    string,
    Promise<PrecioResuelto | null>
  >();

  constructor(
    @Inject(FUENTE_PRECIOS)
    private readonly buscarEnProveedor: BuscadorPrecios,
  ) {}

  /** Precio del material, o `null` si no hay ninguno confiable. */
  async resolver(claveMaterial: string): Promise<PrecioResuelto | null> {
    const ficha = CATALOGO_PRECIOS[claveMaterial];
    if (!ficha) {
      return null;
    }

    const cacheado = this.cache.get(claveMaterial);
    if (cacheado && cacheado.expira > Date.now()) {
      return cacheado.valor;
    }

    const pendiente = this.enVuelo.get(claveMaterial);
    if (pendiente) {
      return pendiente;
    }

    const promesa = this.resolverSinCache(claveMaterial, ficha)
      .catch((error: unknown) => {
        // Una excepción inesperada no debe tumbar el presupuesto completo.
        this.logger.error(
          `Error inesperado resolviendo el precio de "${claveMaterial}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      })
      .finally(() => this.enVuelo.delete(claveMaterial));

    this.enVuelo.set(claveMaterial, promesa);
    const valor = await promesa;
    this.cache.set(claveMaterial, { valor, expira: Date.now() + TTL_MS });
    return valor;
  }

  private async resolverSinCache(
    claveMaterial: string,
    ficha: FichaCatalogo,
  ): Promise<PrecioResuelto | null> {
    for (const candidato of ficha.candidatos) {
      const hallazgo = await this.consultar(candidato);
      if (!hallazgo) {
        continue;
      }

      const precio = new Decimal(hallazgo.precio)
        .mul(candidato.factor)
        .toDecimalPlaces(2);

      if (!dentroDelRango(precio, candidato)) {
        this.logger.warn(
          `Precio descartado para "${claveMaterial}": Bs ${precio.toFixed(2)} ` +
            `fuera del rango creíble [${candidato.rangoSanidad.join(', ')}] ` +
            `(${candidato.proveedor}).`,
        );
        continue;
      }

      return {
        precioUnitarioBs: precio.toFixed(2),
        proveedor: candidato.proveedor,
        url: hallazgo.url,
        sku: hallazgo.sku,
        unidadExterna: hallazgo.unidadExterna,
        disponible: hallazgo.disponible,
        capturadoEn: new Date().toISOString(),
        ...(hallazgo.disponible
          ? {}
          : { nota: 'El proveedor no tiene existencias de este ítem.' }),
      };
    }

    this.logger.warn(
      `Sin precio para "${claveMaterial}": la línea quedará pendiente.`,
    );
    return null;
  }

  private async consultar(
    candidato: CandidatoCatalogo,
  ): Promise<Awaited<ReturnType<BuscadorPrecios>> | null> {
    try {
      return await this.buscarEnProveedor(candidato);
    } catch (error: unknown) {
      this.logger.warn(
        `Proveedor ${candidato.proveedor} no respondió para ` +
          `"${candidato.buscar}": ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
      return null;
    }
  }
}

function dentroDelRango(
  precio: Prisma.Decimal,
  candidato: CandidatoCatalogo,
): boolean {
  const [minimo, maximo] = candidato.rangoSanidad;
  return (
    precio.greaterThanOrEqualTo(minimo) && precio.lessThanOrEqualTo(maximo)
  );
}

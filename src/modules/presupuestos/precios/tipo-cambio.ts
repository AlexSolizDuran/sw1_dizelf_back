/**
 * Cotización del dólar en Bolivia para precargar el tipo de cambio.
 *
 * DE DÓNDE SALE
 * -------------
 * `paralelo.bo` publica la mediana de las plataformas P2P con liquidez en BOB
 * (Binance, Bybit, Bitget) cada 60 s: REST sin API key, sin registro y con
 * licencia CC-BY 4.0. Es la referencia que se usa acá para pagar material
 * importado; la oficial del BCB se publica en HTML y no tiene endpoint estable,
 * así que no se raspa.
 *
 * QUÉ GARANTIZA
 * -------------
 * 1. La tasa es una SUGERENCIA: el usuario la edita en el panel y el presupuesto
 *    guarda la que él escribió. Nunca se genera un presupuesto con esta tasa a
 *    sus espaldas.
 * 2. Un número absurdo no se propaga: fuera de [1, 100] Bs/USD se descarta.
 * 3. Si el servicio no responde, se devuelve `null` y el front deja el campo
 *    vacío en vez de inventar una cotización.
 */

/** Lo que devuelve la fuente, ya validado. */
export interface DolarBolivia {
  /** Decimal como string: nunca `number`, para no arrastrar centavos. */
  tasa: string;
  compra: string | null;
  venta: string | null;
  fuente: string;
  fuenteUrl: string;
  /** ISO 8601 de la medición que publica la fuente. */
  capturadoEn: string;
}

export const FUENTE_TIPO_CAMBIO = Symbol('FUENTE_TIPO_CAMBIO');

/** Consulta la cotización. Devuelve `null` si no hay un número creíble. */
export type ConsultorTipoCambio = () => Promise<DolarBolivia | null>;

const URL_PARALELO = 'https://paralelo.bo/api/v1/rate';
const FUENTE = 'paralelo.bo (mediana P2P)';
const FUENTE_URL = 'https://paralelo.bo';

/** Red de sanidad: Bs por dólar. Fuera de acá el dato está roto. */
const MINIMO = 1;
const MAXIMO = 100;

function aDecimal(valor: unknown): string | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return null;
  }
  return valor.toFixed(4);
}

/**
 * Cliente HTTP de la cotización.
 *
 * El `fetch` entra por parámetro para que los tests no toquen la red, igual que
 * el buscador de precios de las tiendas.
 */
export function crearConsultorParalelo(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): ConsultorTipoCambio {
  return async () => {
    const respuesta = await fetchImpl(URL_PARALELO, {
      headers: { accept: 'application/json' },
      // Sin esto un servicio colgado retrasa la apertura del panel.
      signal: AbortSignal.timeout(5_000),
    });

    if (!respuesta.ok) {
      return null;
    }

    const cuerpo: unknown = await respuesta.json();
    if (typeof cuerpo !== 'object' || cuerpo === null) {
      return null;
    }

    const datos = cuerpo as Record<string, unknown>;
    const mediana = aDecimal(datos.median);
    if (mediana === null) {
      return null;
    }

    const numero = Number(mediana);
    if (numero < MINIMO || numero > MAXIMO) {
      return null;
    }

    const capturadoEn =
      typeof datos.timestamp === 'string' &&
      !Number.isNaN(Date.parse(datos.timestamp))
        ? new Date(datos.timestamp).toISOString()
        : new Date().toISOString();

    return {
      tasa: mediana,
      compra: aDecimal(datos.buy),
      venta: aDecimal(datos.sell),
      fuente: FUENTE,
      fuenteUrl: FUENTE_URL,
      capturadoEn,
    };
  };
}

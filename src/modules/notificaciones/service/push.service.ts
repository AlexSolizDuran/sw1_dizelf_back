import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Endpoint HTTP/2 de Expo Push Service. */
const URL_PUSH = 'https://exp.host/--/api/v2/push/send';

/** Expo acepta como máximo 100 mensajes por request. */
const MAX_POR_LOTE = 100;

export interface MensajePush {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default';
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  /** Si el celular está offline, solo se entrega el último con esta clave. */
  collapseId?: string;
  /** Reemplaza una notificación ya visible del mismo proyecto. */
  tag?: string;
}

export interface ResultadoPush {
  enviados: number;
  /** Tokens que hay que borrar porque Expo ya no los reconoce. */
  invalidos: string[];
}

interface TicketExpo {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface RespuestaExpo {
  data?: TicketExpo | TicketExpo[];
  errors?: { code?: string; message?: string }[];
}

/**
 * Cliente mínimo de Expo Push Service.
 *
 * No usa `expo-server-sdk`: el backend solo necesita un POST y así no suma una
 * dependencia ni un modelo de reintentos distinto al del resto del proyecto.
 * Los fallos se registran y nunca se propagan: publicar el GLB no puede fallar
 * porque el servicio de push esté caído.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly config: ConfigService) {}

  async enviar(mensajes: MensajePush[]): Promise<ResultadoPush> {
    if (mensajes.length === 0) return { enviados: 0, invalidos: [] };

    if (!this.config.get<boolean>('app.pushEnabled', false)) {
      this.logger.debug(
        `Push deshabilitado: ${mensajes.length} mensaje(s) no enviados.`,
      );
      return { enviados: 0, invalidos: [] };
    }

    const invalidos: string[] = [];
    let enviados = 0;

    for (let i = 0; i < mensajes.length; i += MAX_POR_LOTE) {
      const lote = mensajes.slice(i, i + MAX_POR_LOTE);

      try {
        const tickets = await this.enviarLote(lote);
        enviados += tickets.filter((ticket) => ticket.status === 'ok').length;

        tickets.forEach((ticket, indice) => {
          if (
            ticket.status === 'error' &&
            ticket.details?.error === 'DeviceNotRegistered'
          ) {
            const mensaje = lote[indice];
            if (mensaje) invalidos.push(mensaje.to);
          }
        });
      } catch (error) {
        this.logger.warn(
          `No se pudo enviar un lote de ${lote.length} push: ${(error as Error).message}`,
        );
      }
    }

    return { enviados, invalidos };
  }

  private async enviarLote(lote: MensajePush[]): Promise<TicketExpo[]> {
    const control = new AbortController();
    const timeoutMs = this.config.get<number>('app.pushTimeoutMs', 4000);
    const temporizador = setTimeout(() => control.abort(), timeoutMs);

    try {
      const accessToken = this.config.get<string>('app.expoAccessToken', '');

      const respuesta = await fetch(URL_PUSH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(lote),
        signal: control.signal,
      });

      if (!respuesta.ok) {
        throw new Error(`Expo respondió ${respuesta.status}.`);
      }

      const cuerpo = (await respuesta.json()) as RespuestaExpo;

      if (cuerpo.errors?.length) {
        throw new Error(
          cuerpo.errors
            .map((error) => error.message ?? error.code ?? 'Error desconocido')
            .join('. '),
        );
      }

      if (!cuerpo.data) return [];
      return Array.isArray(cuerpo.data) ? cuerpo.data : [cuerpo.data];
    } finally {
      clearTimeout(temporizador);
    }
  }
}

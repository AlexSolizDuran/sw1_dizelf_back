import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Resultado de `HeadObject`: lo único que se confía del objeto subido. */
export interface ObjetoRemoto {
  bytes: number;
  contentType: string | null;
}

/**
 * Acceso a Neon Object Storage (S3 compatible).
 *
 * POR QUÉ EXISTE ESTE SERVICIO
 * ----------------------------
 * El navegador sube el GLB **directo al bucket** con una URL prefirmada: el
 * proxy de Vercel corta los cuerpos grandes (~4,5 MB) y Render free no debe
 * cargar 15 MB en memoria por subida. Entonces acá no pasan bytes, solo firmas:
 * el backend presta su credencial por unos minutos y el objeto viaja
 * cliente ⇄ bucket.
 *
 * DOS DETALLES QUE ROMPEN TODO SI SE OMITEN
 * -----------------------------------------
 * 1. `forcePathStyle: true` — Neon usa direccionamiento por ruta, no por
 *    subdominio (`bucket.endpoint` no resuelve).
 * 2. `requestChecksumCalculation: 'WHEN_REQUIRED'` — el SDK reciente firma un
 *    checksum calculado sobre un cuerpo vacío al prefirmar, y después rechaza
 *    el `PUT` real con `403`. Con `WHEN_REQUIRED` la firma no incluye checksum.
 */
@Injectable()
export class AlmacenObjetosService {
  private readonly logger = new Logger(AlmacenObjetosService.name);
  private readonly cliente: S3Client | null;
  readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('storage.bucket', 'modelos-ar');

    const endpoint = this.config.get<string>('storage.endpoint', '');
    const accessKeyId = this.config.get<string>('storage.accessKeyId', '');
    const secretAccessKey = this.config.get<string>(
      'storage.secretAccessKey',
      '',
    );

    // Sin credenciales el backend arranca igual (el resto de la app no depende
    // del storage) y los endpoints de modelos responden 503 con un mensaje
    // accionable. Un crash al arrancar obligaría a tener el bucket configurado
    // hasta para levantar el proyecto en local.
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      this.cliente = null;
      this.logger.warn(
        'Object Storage sin configurar (AWS_ENDPOINT_URL_S3 / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY). Los endpoints de modelo AR responderán 503.',
      );
      return;
    }

    this.cliente = new S3Client({
      region: this.config.get<string>('storage.region', 'us-east-2'),
      endpoint,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  /** `true` cuando hay endpoint y credenciales. */
  get configurado(): boolean {
    return this.cliente !== null;
  }

  /**
   * URL prefirmada para que el navegador suba el objeto.
   *
   * El `ContentType` va firmado: si el cliente manda otro, S3 responde 403. Así
   * no se puede publicar un HTML disfrazado de GLB.
   */
  async urlSubida(
    clave: string,
    contentType: string,
    expiraEnSegundos = 300,
  ): Promise<string> {
    return getSignedUrl(
      this.obtenerCliente(),
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        ContentType: contentType,
      }),
      { expiresIn: expiraEnSegundos },
    );
  }

  /** URL prefirmada de lectura, para redirigir sin mover los bytes por Render. */
  async urlLectura(clave: string, expiraEnSegundos = 60): Promise<string> {
    return getSignedUrl(
      this.obtenerCliente(),
      new GetObjectCommand({ Bucket: this.bucket, Key: clave }),
      { expiresIn: expiraEnSegundos },
    );
  }

  /** Tamaño y tipo reales del objeto; `null` si no existe. */
  async cabeza(clave: string): Promise<ObjetoRemoto | null> {
    try {
      const respuesta = await this.obtenerCliente().send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: clave }),
      );
      return {
        bytes: respuesta.ContentLength ?? 0,
        contentType: respuesta.ContentType ?? null,
      };
    } catch (error) {
      if (esNoEncontrado(error)) {
        return null;
      }
      throw error;
    }
  }

  /** Primeros `cantidad` bytes del objeto, sin descargarlo entero. */
  async primerosBytes(clave: string, cantidad = 4): Promise<Buffer> {
    const respuesta = await this.obtenerCliente().send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: clave,
        Range: `bytes=0-${cantidad - 1}`,
      }),
    );

    const cuerpo = respuesta.Body as
      { transformToByteArray(): Promise<Uint8Array> } | undefined;

    if (!cuerpo) {
      return Buffer.alloc(0);
    }

    return Buffer.from(await cuerpo.transformToByteArray());
  }

  /** Borra un objeto. Un objeto que ya no existe se considera borrado. */
  async borrar(clave: string): Promise<void> {
    await this.obtenerCliente().send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: clave }),
    );
  }

  private obtenerCliente(): S3Client {
    if (!this.cliente) {
      throw new ServiceUnavailableException(
        'El almacenamiento de modelos AR no está configurado en este entorno.',
      );
    }
    return this.cliente;
  }
}

function esNoEncontrado(error: unknown): boolean {
  const nombre = (error as { name?: string } | null)?.name ?? '';
  const estado = (error as { $metadata?: { httpStatusCode?: number } } | null)
    ?.$metadata?.httpStatusCode;

  return nombre === 'NotFound' || nombre === 'NoSuchKey' || estado === 404;
}

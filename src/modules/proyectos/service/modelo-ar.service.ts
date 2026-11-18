import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ALMACEN_OBJETOS,
  type AlmacenDeObjetos,
} from '../../../common/storage/almacen-objetos.token';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificacionesService } from '../../notificaciones/service/notificaciones.service';
import { ConfirmarModeloDto } from '../dto/modelo-ar/confirmar-modelo.dto';
import { MetaModeloDto } from '../dto/modelo-ar/meta-modelo.dto';
import { UrlModeloDto } from '../dto/modelo-ar/url-modelo.dto';

/** Tipo MIME del binario glTF. Va firmado en la URL de subida. */
const MIME_GLB = 'model/gltf-binary';

/** Los 4 primeros bytes de todo GLB. */
const FIRMA_GLB = 'glTF';

/** Tope duro de subida. El presupuesto de móvil apunta a 8 MB (§5 del plan). */
export const LIMITE_BYTES_MODELO = 25 * 1024 * 1024;

/** Minutos de validez de la URL de subida: suficiente para 25 MB en 3G. */
const EXPIRACION_SUBIDA_SEGUNDOS = 300;

/**
 * Publica y sirve el GLB del proyecto.
 *
 * FLUJO
 * -----
 * 1. `urlSubida` firma un `PUT` a una clave nueva (uuid, así nadie pisa un
 *    objeto a medio subir).
 * 2. El navegador sube los bytes directo al bucket.
 * 3. `confirmar` mide el objeto con `HeadObject`, comprueba la firma `glTF`,
 *    incrementa la versión y borra el objeto anterior.
 * 4. `urlLectura` firma un `GET` corto para que el móvil descargue sin que los
 *    bytes pasen por Render.
 *
 * La versión la decide el backend (no el cliente) y se guarda una sola fila por
 * proyecto: "un solo GLB vigente por proyecto".
 */
@Injectable()
export class ModeloArService {
  private readonly logger = new Logger(ModeloArService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ALMACEN_OBJETOS) private readonly almacen: AlmacenDeObjetos,
    private readonly notificaciones: NotificacionesService,
  ) {}

  /** Firma la subida a una clave nueva del proyecto. */
  async crearUrlSubida(proyectoId: string): Promise<UrlModeloDto> {
    const clave = `modelos/${proyectoId}/${randomUUID()}.glb`;
    const url = await this.almacen.urlSubida(
      clave,
      MIME_GLB,
      EXPIRACION_SUBIDA_SEGUNDOS,
    );

    this.logger.log(`URL de subida firmada para proyecto ${proyectoId}.`);

    return { url, clave, expiraEnSegundos: EXPIRACION_SUBIDA_SEGUNDOS };
  }

  /**
   * Confirma la subida y deja el GLB como vigente.
   *
   * Verifica contra el bucket, no contra el cliente: existencia, tamaño y firma
   * binaria. Si algo falla, borra el objeto recién subido para no dejar basura
   * pagando espacio.
   */
  async confirmar(
    proyectoId: string,
    actorId: number,
    dto: ConfirmarModeloDto,
  ): Promise<MetaModeloDto> {
    if (!dto.clave.startsWith(`modelos/${proyectoId}/`)) {
      throw new BadRequestException(
        'La clave del objeto no pertenece a este proyecto.',
      );
    }

    const objeto = await this.almacen.cabeza(dto.clave);
    if (!objeto) {
      throw new BadRequestException(
        'No encontramos el archivo subido. Volvé a generar y publicar el modelo.',
      );
    }

    if (objeto.bytes <= 0) {
      await this.descartar(dto.clave);
      throw new BadRequestException('El archivo subido está vacío.');
    }

    if (objeto.bytes > LIMITE_BYTES_MODELO) {
      await this.descartar(dto.clave);
      throw new PayloadTooLargeException(
        `El modelo pesa ${aMegabytes(objeto.bytes)} MB y el máximo es ${aMegabytes(LIMITE_BYTES_MODELO)} MB.`,
      );
    }

    const firma = await this.almacen.primerosBytes(dto.clave, 4);
    if (firma.toString('ascii') !== FIRMA_GLB) {
      await this.descartar(dto.clave);
      throw new BadRequestException(
        'El archivo no es un GLB válido (falta la firma glTF).',
      );
    }

    const anterior = await this.prisma.modeloAr.findUnique({
      where: { proyectoId },
      select: { clave: true },
    });

    const modelo = await this.prisma.modeloAr.upsert({
      where: { proyectoId },
      create: {
        proyectoId,
        clave: dto.clave,
        version: 1,
        bytes: objeto.bytes,
        mime: objeto.contentType ?? MIME_GLB,
      },
      update: {
        clave: dto.clave,
        bytes: objeto.bytes,
        mime: objeto.contentType ?? MIME_GLB,
        version: { increment: 1 },
      },
      select: { version: true, bytes: true, actualizado: true },
    });

    // Best-effort: si el borrado falla, el GLB nuevo ya está vigente y el
    // anterior solo ocupa espacio hasta la próxima publicación.
    if (anterior && anterior.clave !== dto.clave) {
      try {
        await this.almacen.borrar(anterior.clave);
      } catch (error) {
        this.logger.warn(
          `No se pudo borrar el GLB anterior de ${proyectoId} (${anterior.clave}): ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `GLB publicado para proyecto ${proyectoId}: v${modelo.version}, ${aMegabytes(modelo.bytes)} MB.`,
    );

    // Best-effort y sin `await`: la publicación ya está guardada y el aviso no
    // debe sumarle a la respuesta la latencia de Expo ni una consulta más.
    // `avisarModeloPublicado` atrapa sus propios errores; el `catch` cubre una
    // falla inesperada para que nunca quede un rechazo sin manejar.
    void this.notificaciones
      .avisarModeloPublicado({
        proyectoId,
        actorId,
        version: modelo.version,
        tipo: anterior ? 'actualizado' : 'creado',
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `No se pudo avisar la publicación de ${proyectoId}: ${(error as Error).message}`,
        );
      });

    return {
      hay: true,
      version: modelo.version,
      bytes: modelo.bytes,
      actualizado: modelo.actualizado.toISOString(),
    };
  }

  /** URL prefirmada de lectura del GLB vigente. */
  async urlLectura(proyectoId: string): Promise<string> {
    const modelo = await this.prisma.modeloAr.findUnique({
      where: { proyectoId },
      select: { clave: true },
    });

    if (!modelo) {
      throw new NotFoundException(
        'Este proyecto todavía no tiene un modelo AR publicado.',
      );
    }

    return this.almacen.urlLectura(modelo.clave);
  }

  /** Metadatos para que el cliente decida si su copia sigue vigente. */
  async meta(proyectoId: string): Promise<MetaModeloDto> {
    const modelo = await this.prisma.modeloAr.findUnique({
      where: { proyectoId },
      select: { version: true, bytes: true, actualizado: true },
    });

    if (!modelo) {
      return { hay: false, version: 0, bytes: 0, actualizado: null };
    }

    return {
      hay: true,
      version: modelo.version,
      bytes: modelo.bytes,
      actualizado: modelo.actualizado.toISOString(),
    };
  }

  private async descartar(clave: string): Promise<void> {
    try {
      await this.almacen.borrar(clave);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar el objeto rechazado ${clave}: ${(error as Error).message}`,
      );
    }
  }
}

function aMegabytes(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

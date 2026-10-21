import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as Y from 'yjs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { materializarDocumento } from '../sync/documento-yjs';

/**
 * Lectura y escritura del documento vivo del plano.
 *
 * LA DIRECCIÓN DE LA CONVERSIÓN
 * -----------------------------
 * Del CRDT a la base es materializar (Y.Doc → JSON plano), en
 * `sync/documento-yjs.ts`. Al revés no: la base guarda JSON, y sembrar un doc
 * desde ahí lo hace el gateway. Aquí solo está el camino de salida, que es el
 * que corre con frecuencia.
 *
 * POR QUÉ JSON Y NO EL BINARIO DE YJS
 * ----------------------------------
 * La columna es JSONB y el resto del sistema —el `GET /proyectos/:id`, el
 * guardado manual— lee el documento como un objeto. Guardar el update binario
 * obligaría a que cada lector materialize, y a que un solo reader desactualizado
 * se vea como plano perdido.
 *
 * `materializarDocumento` es puramente estructural: los `toJSON()` de Y.Map y
 * Y.Array dan las cinco estructuras que importan. El backend no sabe qué es un
 * `wall`.
 */
@Injectable()
export class DocumentoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Escena vigente del proyecto para sembrar el gateway.
   *
   * Normalmente gana el documento vivo. La excepción es un guardado manual más
   * nuevo que la última persistencia del gateway (por ejemplo, si el socket
   * estaba caído): ahí `proyecto.esquema_json` es lo más reciente y sembrar el
   * doc viejo lo volvería a persistir, borrando la versión recién guardada.
   *
   * EL FALLBACK NO ES OPCIONAL. Sin él, el primer cliente que abre un proyecto
   * que nadie editó desde que se migró lee un `Y.Doc` vacío, y el primer
   * guardado lo persiste: como `documento_colaborativo` gana sobre
   * `proyecto.esquema_json`, el plano quedaría vacío para todos, para siempre.
   * El `@@unique` de la tabla no avisa porque el upsert es por proyecto.
   */
  async leer(proyectoId: string): Promise<Record<string, unknown> | null> {
    const proyecto = await this.prisma.proyecto.findUnique({
      where: { id: proyectoId },
      select: {
        esquemaJson: true,
        documentos: {
          select: { esquemaJson: true, updatedAt: true },
          take: 1,
        },
        versiones: {
          select: { fecha: true },
          orderBy: { fecha: 'desc' },
          take: 1,
        },
      },
    });

    if (!proyecto) return null;

    const documentoVivo = proyecto.documentos[0];
    const ultimaVersion = proyecto.versiones[0];
    const versionMasNueva =
      ultimaVersion !== undefined &&
      (!documentoVivo || ultimaVersion.fecha > documentoVivo.updatedAt);

    const bruto = versionMasNueva
      ? proyecto.esquemaJson
      : documentoVivo?.esquemaJson ?? proyecto.esquemaJson;

    return this.desenvolver(bruto);
  }

  /**
   * Saca la escena del sobre `{ version, scene, vista }`.
   *
   * El documento guardado va envuelto por el DTO (`esquemaJson` tiene que ser
   * un objeto). Al gateway le interesa `scene`, que es la que va al `Y.Doc`.
   *
   * Es público porque restaurar una versión necesita la escena para re-sembrar
   * el doc en memoria del gateway; el contenido histórico puede venir envuelto
   * o crudo y la normalización vive acá.
   */
  desenvolver(bruto: unknown): Record<string, unknown> | null {
    if (!bruto || typeof bruto !== 'object') return null;
    const registro = bruto as Record<string, unknown>;
    const escena = registro.scene;
    if (escena && typeof escena === 'object' && escena !== null) {
      return escena as Record<string, unknown>;
    }
    // Escena suelta, de una fila vieja o del propio proyecto.
    if (registro.nodes) return registro;
    return null;
  }

  /**
   * Escribe el estado actual del doc en `documento_colaborativo`.
   *
   * El `usuarioId` no se guarda: el documento es del proyecto, no de quien
   * Hace último en tocarlo. La atribución vive en el historial (`version`),
   * que sí es por guardado manual.
   */
  async guardarMaterializado(proyectoId: string, doc: Y.Doc): Promise<void> {
    const escena = materializarDocumento(doc);

    await this.prisma.documentoColaborativo.upsert({
      where: { proyectoId },
      create: {
        proyectoId,
        esquemaJson: escena as unknown as Prisma.InputJsonValue,
      },
      update: { esquemaJson: escena as unknown as Prisma.InputJsonValue },
    });
  }
}

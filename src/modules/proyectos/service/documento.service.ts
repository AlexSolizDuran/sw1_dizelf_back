import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as Y from 'yjs';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Lectura y escritura del documento vivo del plano.
 *
 * LA DIRECCIÓN DE LA CONVERSIÓN
 * -----------------------------
 * Del CRDT a la base es materializar (Y.Doc → JSON plano). Al revés no: la base
 * guarda JSON, y sembrar un doc desde ahí lo hace el gateway. Aquí solo está el
 * camino de salida, que es el que corre con frecuencia.
 *
 * POR QUÉ JSON Y NO EL BINARIO DE YJS
 * ----------------------------------
 * La columna es JSONB y el resto del sistema —el `GET /proyectos/:id`, el
 * guardado manual— lee el documento como un objeto. Guardar el update binario
 * obligaría a que cada lector materialize, y a que un solo reader desactualizado
 * se vea como plano perdido.
 *
 * `materializar` es puramente estructural: los `toJSON()` de Y.Map y Y.Array
 * dan las dos estructuras que importan. El backend no sabe qué es un `wall`.
 */
@Injectable()
export class DocumentoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Escena vigente del proyecto: el documento vivo si existe, y si no el último
   * guardado consolidado.
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
        documentos: { select: { esquemaJson: true }, take: 1 },
      },
    });

    if (!proyecto) return null;

    const bruto = proyecto.documentos[0]?.esquemaJson ?? proyecto.esquemaJson;
    return this.desenvolver(bruto);
  }

  /**
   * Saca la escena del sobre `{ version, scene, vista }`.
   *
   * El documento guardado va envuelto por el DTO (`esquemaJson` tiene que ser
   * un objeto). Al gateway le interesa `scene`, que es la que va al `Y.Doc`.
   */
  private desenvolver(bruto: unknown): Record<string, unknown> | null {
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
    const escena = this.materializar(doc);

    await this.prisma.documentoColaborativo.upsert({
      where: { proyectoId },
      create: {
        proyectoId,
        esquemaJson: escena as unknown as Prisma.InputJsonValue,
      },
      update: { esquemaJson: escena as unknown as Prisma.InputJsonValue },
    });
  }

  /** `Y.Doc` → la forma plana que el cliente y la base entienden. */
  private materializar(doc: Y.Doc): Record<string, unknown> {
    return {
      nodes: doc.getMap('scene:nodes').toJSON(),
      rootNodeIds: doc.getArray('scene:roots').toJSON(),
      collections: doc.getMap('scene:collections').toJSON(),
      materials: doc.getMap('scene:materials').toJSON(),
      installedPlugins: doc.getArray('scene:plugins').toJSON(),
    };
  }
}

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

  /** Documento vivo del proyecto, o `null` si todavía no existe. */
  async leer(proyectoId: string): Promise<Record<string, unknown> | null> {
    const documento = await this.prisma.documentoColaborativo.findUnique({
      where: { proyectoId },
      select: { esquemaJson: true },
    });

    if (!documento) return null;

    const escena = documento.esquemaJson as Record<string, unknown>;

    // El documento guardado viene envuelto en `{ version, scene, vista }`. Al
    // gateway le interesa la escena, que es la que va al Y.Doc.
    if (typeof escena.scene === 'object' && escena.scene !== null) {
      return escena.scene as Record<string, unknown>;
    }
    return escena;
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

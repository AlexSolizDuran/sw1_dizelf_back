-- Catálogo de permisos EDITOR / LECTOR + documento colaborativo 1:1
--
-- Qué cambia y por qué
-- --------------------
-- 1. `permiso` pasa a ser el catálogo real. El guard no leía esta tabla: deducía
--    el rol por la forma de la relación, así que sembrar un permiso nuevo no
--    concedía nada. Ahora el nombre sale de la base y las capacidades se derivan
--    de él, con lo que un permiso nuevo es un INSERT y no un deploy.
-- 2. CREADOR e INVITADO se renombran. CREADOR nunca se asignó —el creador es
--    el dueño, reconocido por `proyecto.creador_id`—, así que también se
--    colapsa a EDITOR para no dejar filas huérfanas.
-- 3. `documento_colaborativo` deja de ser scratch (`esquema_json_temp`) y pasa a
--    ser el documento vivo del plano, 1:1 con el proyecto.
--
-- EL ORDEN DE ESTOS PASOS IMPORTABA, Y POR MAL LA PRIMERA VEZ
-- -----------------------------------------------------------
-- El orden correcto es renombrar → re-apuntar → borrar duplicados → unique.
--
-- Deduplicar antes de renombrar NO alcanza: el rename convierte N filas
-- distintas en N filas con el mismo nombre, y el índice único revienta. Pasa
-- siempre que haya un INVITADO y un CREADOR, que es el estado de cualquier base
-- donde ya corrió el seed viejo.
--
-- Y borrar una fila de `permiso` NO es inocuo: `colaborador.permiso_id` está
-- declarado con `ON DELETE CASCADE`, así que eliminar un duplicado se lleva por
-- delante a todos los colaboradores asignados a esa fila. Por eso antes de
-- borrar hay que mover esas referencias al permiso que sobrevive.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Renombrar a EDITOR
--
-- Crea duplicados a propósito; se resuelven en los pasos siguientes.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "permiso" SET "nombre_permiso" = 'EDITOR'
WHERE "nombre_permiso" IN ('INVITADO', 'CREADOR');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Re-apuntar los colaboradores al permiso que sobrevive
--
-- Para cada nombre duplicado, gana el `permiso_id` más bajo. Sin este paso, el
-- DELETE de abajo dispararía el CASCADE y perdería las asignaciones.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "colaborador" AS c
SET "permiso_id" = (
  SELECT MIN(p2."permiso_id")
  FROM "permiso" AS p2
  WHERE p2."nombre_permiso" = p."nombre_permiso"
)
FROM "permiso" AS p
WHERE c."permiso_id" = p."permiso_id"
  AND c."permiso_id" <> (
    SELECT MIN(p3."permiso_id")
    FROM "permiso" AS p3
    WHERE p3."nombre_permiso" = p."nombre_permiso"
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Borrar los duplicados
--
-- Ya no tienen referencias: el paso anterior las movió todas.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM "permiso" AS a
USING "permiso" AS b
WHERE a."nombre_permiso" = b."nombre_permiso"
  AND a."permiso_id" > b."permiso_id";

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Unicidad del catálogo
--
-- Antes del INSERT, y no después: `ON CONFLICT DO NOTHING` sin un conflicto que
-- observar no deduplica nada. Con la restricción todavía sin existir, el INSERT de
-- EDITOR crea una fila nueva y el ADD CONSTRAINT posterior falla con "duplicate
-- key". El orden correcto es poner la restricción primero.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "permiso" ADD CONSTRAINT "permiso_nombre_permiso_key"
  UNIQUE ("nombre_permiso");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Catálogo
--
-- EDITOR ya existe desde el paso 1 (INVITADO y CREADOR renombrados); LECTOR se
-- agrega. El seed también siembra y es idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "permiso" ("nombre_permiso")
VALUES ('EDITOR'), ('LECTOR')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. documento_colaborativo: renombrar conservando los datos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "documento_colaborativo"
  RENAME COLUMN "esquema_json_temp" TO "esquema_json";

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Deduplicar por proyecto
--
-- Sin esto el índice único falla: la tabla nunca tuvo restricción y nada
-- impedía tener dos documentos vivos para el mismo proyecto. Se conserva el de
-- `doc_colab_id` más alto, que es el último escrito y por lo tanto el que el
-- editor estaría mostrando. Acá no hay riesgo de CASCADE: nada apunta a esta
-- tabla.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM "documento_colaborativo" AS a
USING "documento_colaborativo" AS b
WHERE a."proyecto_id" = b."proyecto_id"
  AND a."doc_colab_id" < b."doc_colab_id";

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Columnas nuevas
--
-- `actualizado_en` se agrega con DEFAULT now() para poder ponerlo NOT NULL
-- sobre filas existentes; el default se saca después porque Prisma lo gestiona
-- por su cuenta vía `@updatedAt`.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "documento_colaborativo"
  ADD COLUMN "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "usuario_id" INTEGER;

ALTER TABLE "documento_colaborativo"
  ALTER COLUMN "actualizado_en" DROP DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Unicidad e índices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "documento_colaborativo_proyecto_id_key"
  ON "documento_colaborativo"("proyecto_id");

CREATE INDEX "documento_colaborativo_usuario_id_idx"
  ON "documento_colaborativo"("usuario_id");

ALTER TABLE "documento_colaborativo"
  ADD CONSTRAINT "documento_colaborativo_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("usuario_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
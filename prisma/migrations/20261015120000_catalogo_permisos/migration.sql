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
-- Cada paso va antes de su restricción: la unicidad sobre `permiso.nombre` y
-- sobre `documento_colaborativo.proyecto_id` falla si quedan duplicados, y la
-- columna renombrada tiene que existir antes de poder fullestarse.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Deduplicar permiso antes del índice único
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM "permiso" a
USING "permiso" b
WHERE a."nombre_permiso" = b."nombre_permiso"
  AND a."permiso_id" > b."permiso_id";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rutas de datos: INVITADO y CREADOR pasan a EDITOR
--
-- Se hace ANTES de crear EDITOR para no chocar con el índice único: si
-- existiera ya una fila EDITOR, el UPDATE no podría dejar dos filas iguales.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "permiso" SET "nombre_permiso" = 'EDITOR'
WHERE "nombre_permiso" IN ('INVITADO', 'CREADOR');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Sembrar el catálogo
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "permiso" ("nombre_permiso")
VALUES ('EDITOR'), ('LECTOR')
ON CONFLICT DO NOTHING;

ALTER TABLE "permiso" ADD CONSTRAINT "permiso_nombre_permiso_key"
  UNIQUE ("nombre_permiso");

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. documento_colaborativo: renombrar la columna, conservando los datos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "documento_colaborativo"
  RENAME COLUMN "esquema_json_temp" TO "esquema_json";

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Deduplicar por proyecto antes del índice único
--
-- Sin esto el índice falla: la tabla nunca tuvo restricción y nada impedía
-- tener dos documentos vivos para el mismo proyecto. Se conserva el más
-- reciente, que es el que el editor estaría mostrando.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM "documento_colaborativo" a
USING "documento_colaborativo" b
WHERE a."proyecto_id" = b."proyecto_id"
  AND a."doc_colab_id" < b."doc_colab_id";

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Columnas nuevas
--
-- `actualizado_en` se agrega con DEFAULT now() para poder_NOT NULL sobre filas
-- existentes; Prisma lo administra por su cuenta vía `@updatedAt`.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "documento_colaborativo"
  ADD COLUMN "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "usuario_id" INTEGER;

ALTER TABLE "documento_colaborativo"
  ALTER COLUMN "actualizado_en" DROP DEFAULT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Unicidad e índices
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "documento_colaborativo_proyecto_id_key"
  ON "documento_colaborativo"("proyecto_id");

CREATE INDEX "documento_colaborativo_usuario_id_idx"
  ON "documento_colaborativo"("usuario_id");

ALTER TABLE "documento_colaborativo"
  ADD CONSTRAINT "documento_colaborativo_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("usuario_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
-- Índices para los listados que hoy hacen scan completo.
--
-- `version` filtra por proyecto y ordena por fecha: el índice suelto de
-- `fecha_version` no servía para ese patrón, así que se reemplaza por el
-- compuesto. Los nombres siguen la convención de Prisma (tabla + columnas
-- mapeadas) para que `migrate dev` no detecte drift.

-- DropIndex
DROP INDEX "version_fecha_version_idx";

-- CreateIndex
CREATE INDEX "colaborador_usuario_id_idx" ON "colaborador"("usuario_id");

-- CreateIndex
CREATE INDEX "version_proyecto_id_fecha_version_idx" ON "version"("proyecto_id", "fecha_version");

-- CreateIndex
CREATE INDEX "proyecto_usuario_id_idx" ON "proyecto"("usuario_id");

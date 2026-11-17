-- Metadatos del GLB que consume la app de AR. Un solo modelo vigente por
-- proyecto; los bytes viven en Object Storage, no en Postgres.
CREATE TABLE "modelo_ar" (
    "proyecto_id" UUID NOT NULL,
    "clave" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "bytes" INTEGER NOT NULL,
    "mime" VARCHAR(50) NOT NULL DEFAULT 'model/gltf-binary',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelo_ar_pkey" PRIMARY KEY ("proyecto_id")
);

ALTER TABLE "modelo_ar" ADD CONSTRAINT "modelo_ar_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("proyecto_id") ON DELETE CASCADE ON UPDATE CASCADE;

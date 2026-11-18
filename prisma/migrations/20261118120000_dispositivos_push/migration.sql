-- Tokens de push de la app móvil. Un token es globalmente único y se reasigna
-- al usuario que inicia sesión en ese dispositivo; `dispositivo_id` identifica
-- la instalación para reemplazar tokens rotados sin dejar filas viejas.
CREATE TABLE "dispositivo_push" (
    "id" UUID NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "dispositivo_id" VARCHAR(64) NOT NULL,
    "token" VARCHAR(200) NOT NULL,
    "plataforma" VARCHAR(10) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispositivo_push_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dispositivo_push_token_key" ON "dispositivo_push"("token");
CREATE UNIQUE INDEX "dispositivo_push_usuario_id_dispositivo_id_key" ON "dispositivo_push"("usuario_id", "dispositivo_id");
CREATE INDEX "dispositivo_push_usuario_id_idx" ON "dispositivo_push"("usuario_id");

ALTER TABLE "dispositivo_push" ADD CONSTRAINT "dispositivo_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("usuario_id") ON DELETE CASCADE ON UPDATE CASCADE;

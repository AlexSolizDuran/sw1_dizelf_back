-- CreateTable
CREATE TABLE "consumo_ia" (
    "consumo_id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "dia" DATE NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "proveedor" VARCHAR(20) NOT NULL,
    "modelo" VARCHAR(120) NOT NULL,
    "llamadas" INTEGER NOT NULL DEFAULT 0,
    "tokens_entrada" INTEGER NOT NULL,
    "tokens_salida" INTEGER NOT NULL,
    "actualizado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consumo_ia_pkey" PRIMARY KEY ("consumo_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consumo_ia_usuario_id_dia_origen_proveedor_modelo_key" ON "consumo_ia"("usuario_id", "dia", "origen", "proveedor", "modelo");

-- CreateIndex
CREATE INDEX "consumo_ia_dia_idx" ON "consumo_ia"("dia");

-- AddForeignKey
ALTER TABLE "consumo_ia" ADD CONSTRAINT "consumo_ia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("usuario_id") ON DELETE CASCADE ON UPDATE CASCADE;

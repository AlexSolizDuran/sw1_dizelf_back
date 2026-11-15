CREATE TABLE "presupuesto" (
    "presupuesto_id" UUID NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nombre_presupuesto" VARCHAR(120) NOT NULL,
    "moneda_base" CHAR(3) NOT NULL DEFAULT 'BOB',
    "tipo_cambio_usd" DECIMAL(12,4) NOT NULL,
    "tipo_cambio_fuente" VARCHAR(20) NOT NULL,
    "receta_version" VARCHAR(20) NOT NULL,
    "documento_hash" VARCHAR(64) NOT NULL,
    "total_materiales_bs" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "lineas_pendientes" INTEGER NOT NULL DEFAULT 0,
    "fecha_presupuesto" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presupuesto_pkey" PRIMARY KEY ("presupuesto_id")
);

-- CreateTable
CREATE TABLE "presupuesto_linea" (
    "linea_id" SERIAL NOT NULL,
    "presupuesto_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "categoria" VARCHAR(30) NOT NULL,
    "clave_material" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(200) NOT NULL,
    "unidad" VARCHAR(10) NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "precio_unitario_bs" DECIMAL(14,4),
    "subtotal_bs" DECIMAL(16,2),
    "pendiente" BOOLEAN NOT NULL DEFAULT false,
    "origen" VARCHAR(20) NOT NULL,
    "fuente" JSONB,
    "nota" VARCHAR(255),

    CONSTRAINT "presupuesto_linea_pkey" PRIMARY KEY ("linea_id")
);

-- CreateIndex
CREATE INDEX "presupuesto_proyecto_id_fecha_presupuesto_idx" ON "presupuesto"("proyecto_id", "fecha_presupuesto");

-- CreateIndex
CREATE INDEX "presupuesto_linea_presupuesto_id_orden_idx" ON "presupuesto_linea"("presupuesto_id", "orden");

-- AddForeignKey
ALTER TABLE "presupuesto" ADD CONSTRAINT "presupuesto_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("proyecto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto" ADD CONSTRAINT "presupuesto_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("usuario_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presupuesto_linea" ADD CONSTRAINT "presupuesto_linea_presupuesto_id_fkey" FOREIGN KEY ("presupuesto_id") REFERENCES "presupuesto"("presupuesto_id") ON DELETE CASCADE ON UPDATE CASCADE;

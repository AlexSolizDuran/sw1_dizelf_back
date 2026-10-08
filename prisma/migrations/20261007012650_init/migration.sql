-- CreateTable
CREATE TABLE "colaborador" (
    "colaborador_id" SERIAL NOT NULL,
    "proyecto_id" UUID NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "permiso_id" INTEGER NOT NULL,

    CONSTRAINT "colaborador_pkey" PRIMARY KEY ("colaborador_id")
);

-- CreateTable
CREATE TABLE "documento_colaborativo" (
    "doc_colab_id" SERIAL NOT NULL,
    "esquema_json_temp" JSONB NOT NULL,
    "proyecto_id" UUID NOT NULL,

    CONSTRAINT "documento_colaborativo_pkey" PRIMARY KEY ("doc_colab_id")
);

-- CreateTable
CREATE TABLE "permiso" (
    "permiso_id" SERIAL NOT NULL,
    "nombre_permiso" VARCHAR(100) NOT NULL,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("permiso_id")
);

-- CreateTable
CREATE TABLE "persona" (
    "persona_id" SERIAL NOT NULL,
    "nombre_persona" VARCHAR(80) NOT NULL,
    "apellido_persona" VARCHAR(80) NOT NULL,
    "gmail" VARCHAR(80) NOT NULL,

    CONSTRAINT "persona_pkey" PRIMARY KEY ("persona_id")
);

-- CreateTable
CREATE TABLE "proyecto" (
    "proyecto_id" UUID NOT NULL,
    "nombre_proyecto" VARCHAR(100) NOT NULL,
    "esquema_json" JSONB NOT NULL,
    "usuario_id" INTEGER NOT NULL,

    CONSTRAINT "proyecto_pkey" PRIMARY KEY ("proyecto_id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "usuario_id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "hash_contrasena" VARCHAR(100) NOT NULL,
    "persona_id" INTEGER NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "version" (
    "version_id" SERIAL NOT NULL,
    "esquema_json_version" JSONB NOT NULL,
    "fecha_version" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proyecto_id" UUID NOT NULL,

    CONSTRAINT "version_pkey" PRIMARY KEY ("version_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_proyecto_id_usuario_id_key" ON "colaborador"("proyecto_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "persona_gmail_key" ON "persona"("gmail");

-- CreateIndex
CREATE INDEX "proyecto_nombre_proyecto_idx" ON "proyecto"("nombre_proyecto");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_username_key" ON "usuario"("username");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_persona_id_key" ON "usuario"("persona_id");

-- CreateIndex
CREATE INDEX "version_fecha_version_idx" ON "version"("fecha_version");

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("proyecto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("usuario_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permiso"("permiso_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_colaborativo" ADD CONSTRAINT "documento_colaborativo_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("proyecto_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("usuario_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("persona_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version" ADD CONSTRAINT "version_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyecto"("proyecto_id") ON DELETE CASCADE ON UPDATE CASCADE;

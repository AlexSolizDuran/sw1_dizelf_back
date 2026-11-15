-- Nombre de las versiones guardadas manualmente
--
-- Se agrega nullable: las versiones ya existentes (y las que cree el autosave
-- del editor, que no versiona) no tienen etiqueta. La columna es solo texto de
-- interfaz; no participa de la restauración.
ALTER TABLE "version" ADD COLUMN "nombre_version" VARCHAR(100);

/**
 * Seed idempotente de la tabla catálogo `permiso`.
 *
 * El catálogo son DOS permisos: EDITOR y LECTOR. El creador del proyecto no
 * aparece acá porque no es un permiso sino el dueño: se reconoce por
 * `proyecto.creador_id`, que es una relación y no una fila.
 *
 * Por qué EDITOR y LECTOR: son el rango de la sesión colaborativa. EDITOR
 * escribe en el documento; LECTOR entra, ve las ediciones en vivo y no puede
 * escribir. Lo que puede hacer cada uno lo traduce `capacidades-proyecto.ts`,
 * así que cambiar el catálogo es un INSERT y no un deploy.
 *
 * CREADOR e INVITADO se reconocían pero no se usaban: `ProyectoRolGuard` no
 * leía esta tabla y deducía el rol por la forma de la relación, con lo que
 * sembrar un permiso nuevo no concedía nada. La migración `catalogo_permisos`
 * los renombra.
 *
 * Es idempotente: si el nombre ya existe no inserta duplicados.
 *
 * Uso: `npx prisma db seed` (requiere .env con NEON_DB_URL).
 */
import { PrismaClient } from '@prisma/client';

const PERMISOS_SEMILLA = ['EDITOR', 'LECTOR'];

const prisma = new PrismaClient();

for (const nombre of PERMISOS_SEMILLA) {
  const existente = await prisma.permiso.findFirst({
    where: { nombre },
    select: { id: true },
  });

  if (existente) {
    console.log(`Permiso ya existe: ${nombre} (id=${existente.id})`);
  } else {
    const creado = await prisma.permiso.create({
      data: { nombre },
      select: { id: true },
    });
    console.log(`Permiso creado: ${nombre} (id=${creado.id})`);
  }
}

await prisma.$disconnect();
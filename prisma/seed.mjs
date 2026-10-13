/**
 * Seed idempotente de la tabla catálogo `permiso`.
 *
 * Por qué existe: `Colaborador.permisoId` es FK obligatoria y
 * `ColaboradoresService` resuelve el id por nombre (`INVITADO`).
 * Sin estas filas, `POST /proyectos/:id/colaboradores` responde
 * 404 "Rol INVITADO no configurado".
 *
 * Es idempotente: si el nombre ya existe no inserta duplicados
 * (la tabla no tiene @unique en nombre, por eso se busca antes).
 *
 * Uso: `npx prisma db seed` (requiere .env con NEON_DB_URL).
 */
import { PrismaClient } from '@prisma/client';

const ROLES_SEMILLA = ['CREADOR', 'INVITADO'];

const prisma = new PrismaClient();

for (const nombre of ROLES_SEMILLA) {
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

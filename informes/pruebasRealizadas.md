# Pruebas realizadas

Registro de verificaciones ejecutadas sobre el backend.
Fecha de última ejecución: 2026-10-08.

## 1. Tests unitarios (Jest)

Comando: `npx jest --verbose` → **4 suites, 17 tests, todo en verde.**

| Suite | Caso | Resultado |
|---|---|---|
| `app.controller.spec.ts` | `AppController` → `root` should return "Hello World!" | ✅ pasa |
| `prisma.service.spec.ts` | `PrismaService` → debe estar definido | ✅ pasa |
| `prisma.service.spec.ts` | `PrismaService` → debe conectar en `onModuleInit` | ✅ pasa |
| `prisma.service.spec.ts` | `PrismaService` → debe desconectar limpiamente en `onModuleDestroy` | ✅ pasa |
| `usuarios.service.spec.ts` | `UsuariosService` → debe estar definido | ✅ pasa |
| `usuarios.service.spec.ts` | `crearUsuarioConPersona` → debe crear exitosamente una persona y usuario en una transacción | ✅ pasa |
| `usuarios.service.spec.ts` | `crearUsuarioConPersona` → debe lanzar `ConflictException` si el username ya está registrado | ✅ pasa |
| `usuarios.service.spec.ts` | `crearUsuarioConPersona` → debe lanzar `ConflictException` si el correo ya está registrado | ✅ pasa |
| `usuarios.service.spec.ts` | `obtenerPerfilPorId` → debe retornar el perfil si el usuario existe | ✅ pasa |
| `usuarios.service.spec.ts` | `obtenerPerfilPorId` → debe lanzar `NotFoundException` si el usuario no existe | ✅ pasa |
| `auth.service.spec.ts` | `AuthService` → debe estar definido | ✅ pasa |
| `auth.service.spec.ts` | `registrar` → debe registrar al usuario, hashear password, generar token y establecer cookie | ✅ pasa |
| `auth.service.spec.ts` | `login` → debe iniciar sesión exitosamente con username y contraseña válida | ✅ pasa |
| `auth.service.spec.ts` | `login` → debe iniciar sesión exitosamente cuando se proporciona un email | ✅ pasa |
| `auth.service.spec.ts` | `login` → debe lanzar `UnauthorizedException` si el usuario no existe | ✅ pasa |
| `auth.service.spec.ts` | `login` → debe lanzar `UnauthorizedException` si la contraseña es incorrecta | ✅ pasa |
| `auth.service.spec.ts` | `logout` → debe limpiar la cookie de sesión | ✅ pasa |

## 2. Verificaciones estáticas y de compilación

| Verificación | Comando | Resultado |
|---|---|---|
| Tipos | `npx tsc --noEmit` | ✅ sin errores |
| Lint | `npm run lint` | ✅ sin errores ni warnings |
| Build | `npm run build` (`nest build`) | ✅ compila (incluye `ProyectosModule` + `ColaboradoresController`) |

## 3. Seed de base de datos (Neon)

Comando: `npx prisma db seed` (`node prisma/seed.mjs`, idempotente).

| Fila `permiso` | Resultado |
|---|---|
| `CREADOR` | ✅ creada (id=1); 2ª corrida: "ya existe", sin duplicados |
| `INVITADO` | ✅ creada (id=2); 2ª corrida: "ya existe", sin duplicados |

> Nota: la 1ª corrida inserta; la 2ª confirma idempotencia
> (la tabla no tiene `@unique` en `nombre`, el seed busca antes de insertar).

## 4. Cobertura por criterio de aceptación (unitario)

| Criterio | Cubierto por test unitario |
|---|---|
| CA-A-01, CA-A-04, CA-A-05, CA-A-06 | ✅ `auth.service.spec.ts` |
| CA-A-02 (duplicados) | ✅ `usuarios.service.spec.ts` (conflictos username/gmail) |
| CA-A-03 (hash) | ✅ parcial (registrar verifica hashing) |
| CA-A-07, CA-P-01…CA-P-10 | ❌ sin spec todavía (requiere mocks de Prisma + guard) |
| CA-U-01…CA-U-03, CA-C-01…CA-C-07 (nuevo: buscar + colaboradores) | ❌ sin spec todavía (código nuevo de esta sesión) |

## 5. Pendientes (no ejecutados)

| Prueba | Motivo / requisito |
|---|---|
| Specs de `buscarParaColaboracion` y `ColaboradoresService` (casos 403/404/409) | No escritos en esta sesión; recomendados como siguiente paso |
| E2E HTTP contra BD (`POST /proyectos/:id/colaboradores`, `DELETE` como invitado → `403`, `GET /usuarios/buscar`, etc.) | Requiere servidor levantado; no se corrió en esta sesión (`test/e2e-auth-test.mjs` existe pero no se ejecutó) |
| Flujo register → login → crear → buscar → agregar → listar → eliminar con cookie real | Manual con Postman/curl, pendiente |
| `esquemaJson` default `{}` sin enviarlo | Validado a nivel DTO/compilación; falta prueba HTTP real |

# Criterios de aceptación

Criterios que el backend cumple actualmente, redactados de forma verificable.
Referencia de endpoints: `informes/endpoints.md`.

## Globales

- **CA-G-01 — Autenticación por defecto:** todo endpoint sin `@Public()`
  responde `401` si no hay cookie `tokenAcceso`/`access_token` ni Bearer válido.
- **CA-G-02 — Validación estricta:** todo body/query/param fuera del DTO
  o con formato inválido responde `400` con el campo y motivo en `message`.
- **CA-G-03 — Sin datos sensibles:** ninguna respuesta incluye `hashContrasena`
  ni el token JWT en el cuerpo (el token viaja solo en cookie httpOnly).
- **CA-G-04 — Forma de error:** todo error responde
  `{ statusCode, message, error }` con el código HTTP correcto
  (`401` no autenticado, `403` sin permiso, `404` no existe, `409` duplicado).

## Auth

- **CA-A-01 — Registro:** con datos válidos responde `201`, crea Persona+Usuario
  atómicamente, fija la cookie de sesión y devuelve el perfil sin hash.
- **CA-A-02 — Registro duplicado:** username o gmail existente responde `409`
  con mensaje específico, sin crear nada.
- **CA-A-03 — Password segura:** contraseñas débiles se rechazan con `400`;
  la almacenada es hash bcrypt, nunca texto plano.
- **CA-A-04 — Login flexible:** acepta username o email en `identificador`;
  credenciales correctas responden `200` y fijan la cookie.
- **CA-A-05 — Login inválido:** usuario inexistente o password incorrecta
  responden `401` con el mismo mensaje (no revela qué falló).
- **CA-A-06 — Logout:** con sesión responde `200` y elimina las cookies.
- **CA-A-07 — Perfil:** con sesión responde `200` con
  `{ id, username, persona: { id, nombre, apellido, gmail } }`.

## Usuarios

- **CA-U-01 — Buscar para colaborar:** `GET /usuarios/buscar?termino=mar`
  con sesión responde `200` con hasta 10 `UsuarioPerfilDto`
  (username o gmail parcial, insensible a mayúsculas), sin hash.
- **CA-U-02 — Término corto:** `termino` de 1 carácter responde `400`;
  término de solo espacios retorna `[]` (no expone el padrón).
- **CA-U-03 — Sin sesión:** `GET /usuarios/buscar` sin cookie responde `401`.

## Proyectos

- **CA-P-01 — Crear:** autenticado + `nombre` válido responde `201`;
  el `creadorId` es el `sub` del JWT (ignora/impide suplantación desde el body).
- **CA-P-02 — Crear sin esquema:** omitir `esquemaJson` crea el proyecto
  con `{}` (flujo "lienzo vacío").
- **CA-P-03 — Crear con esquema:** enviar `esquemaJson` objeto lo persiste tal cual
  (flujo "prompt IA"); si no es objeto responde `400`.
- **CA-P-04 — Listar alcance:** `GET /proyectos` solo devuelve proyectos donde
  soy creador o invitado, paginados `{ datos, total, pagina, limite }`
  con `limite` acotado a 1–50.
- **CA-P-05 — Listar liviano:** los ítems del listado **no** incluyen `esquemaJson`.
- **CA-P-06 — Detalle con JSON:** `GET /proyectos/:id` siendo miembro responde
  `200` con el `esquemaJson` completo y `miRol` correcto
  (`CREADOR` si lo creé, `INVITADO` si colaboro).
- **CA-P-07 — Detalle ajeno:** pedir un proyecto donde no soy miembro
  responde `403`; pedir un UUID inexistente responde `404`;
  UUID malformado responde `400`.
- **CA-P-08 — Editar:** creador o invitado pueden actualizar nombre/esquema
  (parcial) y reciben `200` con el proyecto actualizado.
- **CA-P-09 — Eliminar solo creador:** `DELETE /proyectos/:id` con rol
  `INVITADO` responde `403` ("Solo el usuario con rol CREADOR...");
  con rol `CREADOR` responde `200` y el proyecto deja de existir
  (verificable con `GET /:id` → `404`).
- **CA-P-10 — Consistencia de roles:** el rol se deriva siempre igual
  (`creadorId === sub` → `CREADOR`, fila en `colaborador` → `INVITADO`),
  tanto en el guard como en el servicio.

## Colaboradores

- **CA-C-01 — Agregar solo creador:** `POST /proyectos/:id/colaboradores`
  con `identificador` exacto existente y rol `CREADOR` responde `201`
  con `{ id, proyectoId, usuarioId, username, gmail, rol: "INVITADO" }`.
- **CA-C-02 — Agregar como invitado:** el mismo `POST` con rol `INVITADO`
  responde `403` ("Solo el usuario con rol CREADOR puede agregar...").
- **CA-C-03 — Invitado inexistente:** `identificador` sin usuario responde `404`.
- **CA-C-04 — Auto-invite y duplicado:** invitarse a sí mismo (creador) o a un
  colaborador existente responde `409`.
- **CA-C-05 — Listar miembros:** `GET /proyectos/:id/colaboradores` siendo
  `CREADOR` o `INVITADO` responde `200` con el arreglo; no-miembro → `403`.
- **CA-C-06 — Eliminar solo creador:** `DELETE .../colaboradores/:usuarioId`
  con rol `CREADOR` responde `200`; con `INVITADO` → `403`;
  si no era colaborador → `404`.
- **CA-C-07 — Seed requerido:** sin la fila `INVITADO` en `permiso`
  (`npx prisma db seed`), el `POST` responde `404`
  ("Rol INVITADO no configurado").

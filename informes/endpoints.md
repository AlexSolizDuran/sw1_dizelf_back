# Endpoints disponibles

Base URL local: `http://localhost:3000` (puerto según `PORT` / config `app.port`).
Sin prefijo global: las rutas se usan tal cual.

## Autenticación y reglas globales

- Sesión JWT en cookie httpOnly **`tokenAcceso`** (más `access_token` legada en transición).
  Alternativa: header `Authorization: Bearer <token>`.
- **Todo endpoint exige sesión**, salvo los marcados `(Público)`.
- Respuestas de error con forma estándar NestJS: `{ statusCode, message, error }`
  (`message` es arreglo de strings en errores de validación).
  - `401` = sin sesión / token inválido.
  - `403` = con sesión pero sin permiso.
  - `404` = recurso no existente.
  - `409` = conflicto / duplicado.
- Validación global: `whitelist`, `forbidNonWhitelisted`, `transform`
  (los campos no declarados en el DTO se rechazan con `400`).
- CORS con `credentials: true`; el front debe enviar credenciales (cookies).

## Roles de proyecto

- `CREADOR`: `proyecto.creadorId === usuario.sub`.
- `INVITADO`: existe fila en `colaborador` para ese proyecto y usuario.
- El `creadorId` **nunca** se recibe del cliente: sale del JWT.
- Catálogo en tabla `permiso` (`CREADOR` id=1, `INVITADO` id=2 vía `npx prisma db seed`).
  Sin la fila `INVITADO`, agregar colaboradores responde `404`.

---

## Auth

### POST /auth/register (Público)

Registra Persona + Usuario y abre sesión.

**Body** `RegisterDto` (JSON, todos requeridos):

| Campo | Reglas |
|---|---|
| `nombre` | string, 1–80 caracteres |
| `apellido` | string, 1–80 caracteres |
| `gmail` | email válido, máx 80 |
| `username` | 3–50, solo letras, números, `.` `_` `-` |
| `password` | mín 8, con mayúscula, minúscula, número y símbolo |

**Retorna `201`:**

```json
{
  "message": "Usuario registrado exitosamente.",
  "usuario": {
    "id": 1,
    "username": "juan",
    "persona": { "id": 1, "nombre": "Juan", "apellido": "Perez", "gmail": "juan@mail.com" }
  }
}
```

Además fija las cookies `tokenAcceso` y `access_token` (httpOnly).
**Errores:** `400` validación, `409` username o correo ya registrado.

### POST /auth/login (Público)

**Body** `LoginDto`:

| Campo | Reglas |
|---|---|
| `identificador` | username o correo (requerido) |
| `password` | requerido |

**Retorna `200`:** misma forma que register (`"Inicio de sesión exitoso."`)
+ cookies de sesión.
**Errores:** `400` validación, `401` credenciales inválidas
(mismo mensaje exista o no el usuario, anti-enumeración).

### POST /auth/logout (Autenticado)

Sin body. Limpia las cookies de sesión.

**Retorna `200`:** `{ "message": "Sesión cerrada exitosamente." }`
**Errores:** `401` sin sesión.

### GET /auth/perfil (Autenticado)

Sin parámetros. Perfil del usuario de la sesión.

**Retorna `200` `UsuarioPerfilDto`:**

```json
{
  "id": 1,
  "username": "juan",
  "persona": { "id": 1, "nombre": "Juan", "apellido": "Perez", "gmail": "juan@mail.com" }
}
```

**Errores:** `401` sin sesión.

---

## Usuarios

### GET /usuarios/buscar (Autenticado)

Busca hasta 10 usuarios por username o gmail (coincidencia parcial,
insensible a mayúsculas) para el flujo de confirmación previo a agregar
un colaborador. Nunca expone `hashContrasena`.

**Query:**

| Parámetro | Reglas |
|---|---|
| `termino` | requerido, string mín 2 caracteres |

Términos de menos de 2 caracteres (tras `trim`) retornan `[]`.

**Retorna `200` `UsuarioPerfilDto[]`:**

```json
[
  {
    "id": 2,
    "username": "maria",
    "persona": { "id": 2, "nombre": "María", "apellido": "López", "gmail": "maria@mail.com" }
  }
]
```

**Errores:** `400` término ausente o de 1 carácter, `401` sin sesión.

---

## Proyectos

### POST /proyectos (Autenticado)

Crea un proyecto. El creador es el usuario de la sesión.

**Body** `CrearProyectoDto` (JSON):

| Campo | Reglas |
|---|---|
| `nombre` | requerido, string 3–100 |
| `esquemaJson` | opcional, objeto JSON; por defecto `{}` |

**Retorna `201` `ProyectoRespuestaDto`:**

```json
{
  "id": "uuid",
  "nombre": "Mi proyecto",
  "esquemaJson": {},
  "creadorId": 1,
  "miRol": "CREADOR",
  "totalColaboradores": 0
}
```

**Errores:** `400` validación, `401` sin sesión.

### GET /proyectos (Autenticado)

Lista paginada de **mis** proyectos (donde soy creador o invitado).
El `esquemaJson` **no** se incluye (listado liviano).

**Query** (todos opcionales):

| Parámetro | Reglas |
|---|---|
| `pagina` | entero ≥ 1, por defecto `1` |
| `limite` | entero 1–50, por defecto `10` |

**Retorna `200`:**

```json
{
  "datos": [
    {
      "id": "uuid",
      "nombre": "Mi proyecto",
      "creadorId": 1,
      "miRol": "CREADOR",
      "totalColaboradores": 2
    }
  ],
  "total": 1,
  "pagina": 1,
  "limite": 10
}
```

**Errores:** `400` query inválida, `401` sin sesión.

### GET /proyectos/:id (Autenticado + miembro)

Detalle completo **con** `esquemaJson`. Permite rol `CREADOR` o `INVITADO`.

**Params:** `id` UUID del proyecto.

**Retorna `200` `ProyectoRespuestaDto`** (misma forma que el POST,
`miRol` refleja el rol del solicitante).
**Errores:** `400` UUID inválido, `401` sin sesión,
`403` no es miembro, `404` no existe.

### PATCH /proyectos/:id (Autenticado + miembro)

Actualización parcial. Permite rol `CREADOR` o `INVITADO`.

**Params:** `id` UUID.
**Body** `ActualizarProyectoDto` (JSON, todo opcional):

| Campo | Reglas |
|---|---|
| `nombre` | string 3–100 |
| `esquemaJson` | objeto JSON |

**Retorna `200` `ProyectoRespuestaDto`** actualizado.
**Errores:** `400` validación/UUID, `401`, `403` no miembro, `404` no existe.

### DELETE /proyectos/:id (Autenticado + solo CREADOR)

Elimina el proyecto (borrado en cascada de versiones, colaboradores
y documentos por FK `onDelete: Cascade`).

**Params:** `id` UUID. Sin body.

**Retorna `200`:** `{ "message": "Proyecto eliminado exitosamente." }`
**Errores:** `400` UUID inválido, `401` sin sesión,
`403` no es miembro **o** es invitado (solo el creador elimina),
`404` no existe.

---

## Colaboradores (`/proyectos/:id/colaboradores`)

Subdominio dentro de `ProyectosModule` (`ColaboradoresService` +
`ColaboradoresController`). El `permisoId` se resuelve por nombre
(`INVITADO`); agregar roles futuros es solo un `INSERT` en `permiso`.

### POST /proyectos/:id/colaboradores (Autenticado + solo CREADOR)

Agrega un colaborador por username o gmail **exactos**
(el flujo previo de confirmación es `GET /usuarios/buscar`).

**Params:** `id` UUID del proyecto.
**Body** `AgregarColaboradorDto` (JSON):

| Campo | Reglas |
|---|---|
| `identificador` | requerido, string 1–100 (username o gmail exacto) |

**Retorna `201` `ColaboradorRespuestaDto`:**

```json
{
  "id": 1,
  "proyectoId": "uuid",
  "usuarioId": 2,
  "username": "maria",
  "gmail": "maria@mail.com",
  "rol": "INVITADO"
}
```

**Errores:** `400` validación/UUID, `401` sin sesión,
`403` no es creador, `404` proyecto o usuario inexistente
(o falta la fila `INVITADO` en `permiso`),
`409` auto-invite del creador o usuario ya colaborador.

### GET /proyectos/:id/colaboradores (Autenticado + miembro)

Lista los colaboradores. Permite rol `CREADOR` o `INVITADO`.

**Params:** `id` UUID.

**Retorna `200` `ColaboradorRespuestaDto[]`** (orden por `id` asc).
**Errores:** `400` UUID inválido, `401` sin sesión,
`403` no es miembro.

### DELETE /proyectos/:id/colaboradores/:usuarioId (Autenticado + solo CREADOR)

Elimina un colaborador. No puede eliminar al creador
(no está en la tabla `colaborador`, responde `404`).

**Params:** `id` UUID, `usuarioId` entero.
Sin body.

**Retorna `200`:** `{ "message": "Colaborador eliminado exitosamente." }`
**Errores:** `400` UUID/`usuarioId` inválidos, `401` sin sesión,
`403` no es creador, `404` proyecto inexistente o el usuario
no es colaborador del proyecto.

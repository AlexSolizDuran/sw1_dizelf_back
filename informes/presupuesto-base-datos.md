# Presupuesto de materiales — cambios en la base de datos

Esquema de la función de presupuesto de materiales (F2 del plan).

**Estado: la Opción B está implementada.** Migración
`20261112120000_presupuesto_materiales_minimo`, modelos en
`prisma/models/presupuesto.prisma` y módulo `src/modules/presupuestos`. La
Opción A queda documentada como camino de ampliación (§5) y no está aplicada.

Se plantearon dos alternativas:

| | Opción A — completa | Opción B — mínima |
|---|---|---|
| Tablas nuevas | 6 | 2 |
| Enums nuevos | 2 | 0 |
| Catálogo de materiales | Tabla propia | No existe |
| Historial de precios | Sí | No |
| Comparación entre proveedores | Sí | No |
| Trazabilidad del precio usado | FK a la observación exacta | JSON con la fuente |
| Esfuerzo backend | Mayor (sync + mapeos) | Menor (solo snapshot) |
| Cambia tablas existentes | **No** | **No** |

---

## 1. Punto de partida

Esquema actual (`prisma/models/`), 7 modelos:

| Modelo | Tabla | Rol |
|---|---|---|
| `Proyecto` | `proyecto` | `esquemaJson` (JsonB) con la escena del editor |
| `Version` | `version` | Guardados manuales, `esquemaJsonVersion` |
| `DocumentoColaborativo` | `documento_colaborativo` | Documento vivo 1:1 del proyecto |
| `Usuario` / `Persona` | `usuario` / `persona` | Cuentas |
| `Permiso` / `Colaborador` | `permiso` / `colaborador` | Roles `CREADOR`/`INVITADO` por proyecto |

**Ambas opciones son puramente aditivas.** No se altera ninguna columna de
`proyecto`, `version`, `usuario`, `permiso` ni `colaborador`.

### 1.1 Cambios obligatorios en modelos existentes

Son **campos virtuales inversos**: no generan columna ni `ALTER TABLE`, pero sin
ellos `prisma validate` falla con *"is missing an opposite relation field"*.
Hay que agregarlos a mano en los archivos ya existentes:

```prisma
// prisma/models/proyecto.prisma  -> junto a `versiones`, `colaboradores`, `documentos`
presupuestos Presupuesto[]

// prisma/models/usuario.prisma   -> junto a `proyectosCreados`, `colaboraciones`
presupuestosCreados Presupuesto[]

// prisma/models/version.prisma   -> solo en la Opción A (B no referencia Version)
presupuestos Presupuesto[]
```

### Por qué se guarda un snapshot y no se calcula al vuelo

Un presupuesto es un documento con valor comercial: si el proveedor sube el
cemento en marzo, el presupuesto de febrero debe seguir diciendo lo mismo. Por
eso cada presupuesto congela cantidad, precio unitario y fuente, y guarda
`documentoHash` de la escena para poder avisar "el plano cambió desde que se
generó este presupuesto".

### Por qué la moneda base es BOB

Los proveedores publican en bolivianos. Se guarda **BOB** y el tipo de cambio se
congela en el presupuesto (`tipoCambioUsd`); el monto en USD se deriva al leer.
Así el selector Bs/USD no duplica datos ni descuadra presupuestos viejos cuando
se mueva la tasa.

---

## 2. Opción A — 6 tablas (recomendada)

### 2.1 Diagrama

```
proyecto ──1:N──> presupuesto ──1:N──> presupuesto_linea
                     │                    ├── material_id? ─────────> catalogo_material
                     ├── version_id? ──> version
                     │                      ├── proveedor_id? ────────> proveedor_precio
                     └── usuario_id ──> usuario
                                            └── precio_observacion_id? ─> precio_observacion

catalogo_material ──1:N──> precio_observacion        <──1:N── proveedor_precio
catalogo_material ──1:N──> mapeo_proveedor_material  <──1:N── proveedor_precio
```

### 2.2 Enums

```prisma
enum TipoProveedor {
  API
  SCRAPING
  MANUAL

  @@map("tipo_proveedor")
}

enum OrigenLinea {
  CALCULADO
  MANUAL

  @@map("origen_linea")
}
```

`OrigenLinea.MANUAL` es la línea que se cargó a mano porque no existe fuente
online (puertas, ventanas, pintura): queda marcada para que el usuario sepa qué
parte del presupuesto no está respaldada por un precio publicado.

Las categorías de material **no** son enum a propósito: `categoria` es
`VarChar(30)` con valores documentados (`MAMPOSTERIA`, `LOSA`, `PISO`,
`ABERTURA`, `REVOQUE`, `PINTURA`). Agregar una categoría no debe requerir
migración.

### 2.3 Modelos

```prisma
/// Catálogo canónico propio: lo que el motor de medición sabe pedir.
/// No contiene precios — los precios viven en `precio_observacion`, con fuente
/// y fecha, para que ningún número del sistema sea inventado.
model CatalogoMaterial {
  id             Int      @id @default(autoincrement()) @map("material_id")
  clave          String   @unique @map("clave_material") @db.VarChar(60)
  nombre         String   @map("nombre_material") @db.VarChar(120)
  categoria      String   @map("categoria") @db.VarChar(30)
  unidadBase     String   @map("unidad_base") @db.VarChar(10)
  espesorCm      Decimal? @map("espesor_cm") @db.Decimal(6, 2)
  rendimientoRef Decimal? @map("rendimiento_ref") @db.Decimal(10, 4)
  activo         Boolean  @default(true)
  creadoEn       DateTime @default(now()) @map("creado_en") @db.Timestamp(3)

  // Campos virtuales inversos: no generan columna.
  mapeos MapeoProveedorMaterial[]
  precios PrecioObservacion[]
  lineas  PresupuestoLinea[]

  @@index([categoria])
  @@map("catalogo_material")
}

/// Fuente de precios. `manual` es un proveedor más: así los precios cargados a
/// mano recorren exactamente el mismo camino que los scrapeados.
model ProveedorPrecio {
  id         Int           @id @default(autoincrement()) @map("proveedor_id")
  slug       String        @unique @map("slug_proveedor") @db.VarChar(40)
  nombre     String        @map("nombre_proveedor") @db.VarChar(120)
  tipo       TipoProveedor @map("tipo")
  urlBase    String?       @map("url_base") @db.VarChar(255)
  activo     Boolean       @default(true)
  ultimaSync DateTime?     @map("ultima_sincronizacion") @db.Timestamp(3)

  mapeos  MapeoProveedorMaterial[]
  precios PrecioObservacion[]
  lineas  PresupuestoLinea[]

  @@map("proveedor_precio")
}

/// Traductor SKU externo -> material canónico, con el factor que convierte la
/// presentación del proveedor a la unidad base. Sin esto, un precio de
/// Bs. 1.790 por millar se leería como Bs. 1.790 por pieza.
model MapeoProveedorMaterial {
  id               Int      @id @default(autoincrement()) @map("mapeo_id")
  proveedorId      Int      @map("proveedor_id")
  skuExterno       String   @map("sku_externo") @db.VarChar(80)
  materialId       Int      @map("material_id")
  unidadExterna    String   @map("unidad_externa") @db.VarChar(40)
  factorConversion Decimal  @default(1) @map("factor_conversion") @db.Decimal(12, 4)
  confianza        String?  @map("confianza") @db.VarChar(20)
  activo           Boolean  @default(true)
  actualizadoEn    DateTime @updatedAt @map("actualizado_en") @db.Timestamp(3)

  proveedor ProveedorPrecio  @relation(fields: [proveedorId], references: [id], onDelete: Cascade)
  material  CatalogoMaterial @relation(fields: [materialId], references: [id], onDelete: Cascade)

  // Un SKU del proveedor apunta a un solo material.
  @@unique([proveedorId, skuExterno])
  @@index([materialId])
  @@map("mapeo_proveedor_material")
}

/// Un precio visto en un momento dado. Sin `@@unique`: el historial es el punto.
/// Se deduplica en código por (SKU, día) para no llenar la tabla con la misma
/// lectura repetida de la sync diaria.
model PrecioObservacion {
  id            Int      @id @default(autoincrement()) @map("precio_observacion_id")
  materialId    Int      @map("material_id")
  proveedorId   Int      @map("proveedor_id")
  precio        Decimal  @map("precio") @db.Decimal(14, 4)
  moneda        String   @default("BOB") @db.Char(3)
  unidadExterna String   @map("unidad_externa") @db.VarChar(40)
  urlFuente     String?  @map("url_fuente") @db.VarChar(500)
  disponible    Boolean  @default(true)
  nota          String?  @db.VarChar(255)
  capturadoEn   DateTime @default(now()) @map("capturado_en") @db.Timestamp(3)

  material  CatalogoMaterial @relation(fields: [materialId], references: [id], onDelete: Cascade)
  proveedor ProveedorPrecio  @relation(fields: [proveedorId], references: [id], onDelete: Cascade)
  lineas    PresupuestoLinea[]

  @@index([materialId, capturadoEn])
  @@index([proveedorId, capturadoEn])
  @@map("precio_observacion")
}

/// Presupuesto congelado. `documentoHash` es el SHA-256 del `esquemaJson` que se
/// midió: si el plano cambia, el hash deja de coincidir y la UI puede marcar el
/// presupuesto como desactualizado sin recalcular nada.
model Presupuesto {
  id                String   @id @default(uuid()) @map("presupuesto_id") @db.Uuid
  proyectoId        String   @map("proyecto_id") @db.Uuid
  creadorId         Int      @map("usuario_id")
  nombre            String   @map("nombre_presupuesto") @db.VarChar(120)
  monedaBase        String   @default("BOB") @map("moneda_base") @db.Char(3)
  tipoCambioUsd     Decimal  @map("tipo_cambio_usd") @db.Decimal(12, 4)
  tipoCambioFuente  String   @default("manual") @map("tipo_cambio_fuente") @db.VarChar(20)
  recetaVersion     String   @map("receta_version") @db.VarChar(20)
  documentoHash     String   @map("documento_hash") @db.VarChar(64)
  totalMaterialesBs Decimal  @map("total_materiales_bs") @db.Decimal(16, 2)
  fecha             DateTime @default(now()) @map("fecha_presupuesto") @db.Timestamp(3)

  versionId Int? @map("version_id")

  proyecto Proyecto          @relation(fields: [proyectoId], references: [id], onDelete: Cascade)
  creador  Usuario           @relation(fields: [creadorId], references: [id], onDelete: Cascade)
  version  Version?          @relation(fields: [versionId], references: [id], onDelete: SetNull)
  lineas   PresupuestoLinea[]

  @@index([proyectoId, fecha])
  @@map("presupuesto")
}

/// Renglón del presupuesto. `precioObservacionId` es la trazabilidad: apunta al
/// precio exacto que se usó, no a "el último precio del material". Si el
/// proveedor cambia su lista, este renglón sigue siendo reproducible.
model PresupuestoLinea {
  id                  Int         @id @default(autoincrement()) @map("linea_id")
  presupuestoId       String      @map("presupuesto_id") @db.Uuid
  orden               Int         @default(0)
  categoria           String      @map("categoria") @db.VarChar(30)
  descripcion         String      @map("descripcion") @db.VarChar(200)
  unidad              String      @map("unidad") @db.VarChar(10)
  cantidad            Decimal     @map("cantidad") @db.Decimal(14, 3)
  precioUnitarioBs    Decimal     @map("precio_unitario_bs") @db.Decimal(14, 4)
  subtotalBs          Decimal     @map("subtotal_bs") @db.Decimal(16, 2)
  origen              OrigenLinea @default(CALCULADO)
  urlFuente           String?     @map("url_fuente") @db.VarChar(500)
  capturadoEn         DateTime?   @map("capturado_en") @db.Timestamp(3)
  nota                String?     @map("nota") @db.VarChar(255)

  presupuesto       Presupuesto        @relation(fields: [presupuestoId], references: [id], onDelete: Cascade)
  material          CatalogoMaterial?  @relation(fields: [materialId], references: [id], onDelete: SetNull)
  proveedor         ProveedorPrecio?   @relation(fields: [proveedorId], references: [id], onDelete: SetNull)
  precioObservacion PrecioObservacion? @relation(fields: [precioObservacionId], references: [id], onDelete: SetNull)

  materialId          Int? @map("material_id")
  proveedorId         Int? @map("proveedor_id")
  precioObservacionId Int? @map("precio_observacion_id")

  @@index([presupuestoId, orden])
  @@index([materialId])
  @@map("presupuesto_linea")
}
```

### 2.4 Reglas que sostienen el diseño

- **Precio unitario en la línea, no solo en `precio_observacion`.** Se guardan
  ambos: el renglón queda autocontenido (aunque se borre la observación, el
  presupuesto no cambia) y la FK permite auditar de dónde salió.
- **`onDelete` de la línea hacia material/proveedor/observación es `SetNull`.**
  Borrar un material del catálogo no debe borrar historia comercial; solo se
  pierde el vínculo. Hacia `presupuesto` sí es `Cascade` (borrar un presupuesto
  borra sus líneas).
- **Nada de `Float`.** Todos los montos son `Decimal`; en los DTO se serializan a
  **string** (Prisma los entrega como `Decimal.js`; convertirlos a `number`
  reintroduce el error de centavos).
- **Sin unique en `precio_observacion`**, para permitir historial. La dedupe es
  por SKU + día en el servicio de sync.
- **Catálogo sin precios.** Un material sin observación aparece como "sin
  precio" en la UI; nunca se rellena con un promedio inventado.

### 2.5 Migración

```bash
# 1. Crear los 6 archivos de modelo en prisma/models/ y registrar los enums.
# 2. Generar la migración (usa NEON_DIRECT_URL).
npx prisma migrate dev --name presupuesto_materiales
# 3. Regenerar el cliente.
npx prisma generate
```

El SQL resultante es únicamente `CREATE TYPE` (×2) + `CREATE TABLE` (×6) +
índices y FKs. Cero `ALTER TABLE` sobre tablas existentes, cero riesgo de
bloqueo sobre `proyecto`.

Los modelos de este documento y los de la Opción B se validaron con
`npx prisma validate` contra el esquema real del proyecto (Prisma 6.19.3):
ambos pasan. Lo único que hubo que agregar fueron los campos inversos de §1.1.

### 2.6 Seeds

Extender `prisma/seed.mjs` (que ya siembra la fila `INVITADO` en `permiso`) con:

- ~40–60 filas de `catalogo_material` (mampostería, losa, piso, revoque,
  aberturas, pintura).
- 3 filas de `proveedor_precio`: `constructorbolivia` (`API`), `morales`
  (`API`) y `manual` (`MANUAL`).
- Sin precios: los primeros entran por la sync o los carga el usuario.

No hace falta sembrar permisos nuevos: el presupuesto reutiliza `leer`/`editar`
con el `ProyectoRolGuard` existente.

### 2.7 Ventajas, costos y riesgos

**Ventajas**
- Comparación de precios entre proveedores para un mismo material (objetivo
  original de la función).
- Historial: "el cemento subió 18 % desde enero" sale de una consulta.
- El mapeo SKU↔material es dato, no código: se corrige un precio mal asociado
  sin desplegar.
- Los presupuestos viejos son auditables y reproducibles.

**Costos**
- Hay que mantener los mapeos cuando un proveedor cambia SKU (búsqueda
  `search=` del API de Constructor Bolivia ayuda a detectarlos).
- Volumen: ~150 observaciones por sync diaria ≈ 55k filas/año. Irrelevante para
  Postgres, pero implica una tarea de retención (ver §6).
- Más superficie de escritura: sync, mapeos y presupuestos.

**Riesgos**
- Un factor de conversión mal cargado produce presupuestos 1000× más caros. Se
  mitiga con `confianza` y con un test que valide rangos de precio de mercado
  (cemento Bs 50–65, ladrillo 6H Bs 1,80–2,20, fierro Bs 7,80–12,20/kg).

---

## 3. Opción B — 2 tablas (elegida e implementada)

Mismo snapshot, sin catálogo ni historial: la fuente del precio se guarda como
JSON dentro de la línea. Necesita los campos inversos de §1.1 en `proyecto` y
`usuario` (no en `version`).

El catálogo de precios no desaparece: pasa a **código**
(`src/modules/presupuestos/precios/catalogo.ts`). Corregir un mapeo exige
deploy, y ninguna clave fuera de ese mapa puede tener precio automático.

### 3.1 Modelos

```prisma
model Presupuesto {
  id                String   @id @default(uuid()) @map("presupuesto_id") @db.Uuid
  proyectoId        String   @map("proyecto_id") @db.Uuid
  creadorId         Int      @map("usuario_id")
  nombre            String   @map("nombre_presupuesto") @db.VarChar(120)
  monedaBase        String   @default("BOB") @map("moneda_base") @db.Char(3)
  tipoCambioUsd     Decimal  @map("tipo_cambio_usd") @db.Decimal(12, 4)
  tipoCambioFuente  String   @default("manual") @map("tipo_cambio_fuente") @db.VarChar(20)
  recetaVersion     String   @map("receta_version") @db.VarChar(20)
  documentoHash     String   @map("documento_hash") @db.VarChar(64)
  totalMaterialesBs Decimal  @default(0) @map("total_materiales_bs") @db.Decimal(16, 2)
  /// Líneas sin precio. Materializado para que el listado no cargue las líneas.
  lineasPendientes Int      @default(0) @map("lineas_pendientes")
  fecha             DateTime @default(now()) @map("fecha_presupuesto") @db.Timestamp(3)

  proyecto Proyecto @relation(fields: [proyectoId], references: [id], onDelete: Cascade)
  creador  Usuario  @relation(fields: [creadorId], references: [id], onDelete: Cascade)
  lineas   PresupuestoLinea[]

  @@index([proyectoId, fecha])
  @@map("presupuesto")
}

model PresupuestoLinea {
  id               Int      @id @default(autoincrement()) @map("linea_id")
  presupuestoId    String   @map("presupuesto_id") @db.Uuid
  orden            Int      @default(0)
  categoria        String   @map("categoria") @db.VarChar(30)
  descripcion      String   @map("descripcion") @db.VarChar(200)
  unidad           String   @map("unidad") @db.VarChar(10)
  cantidad         Decimal  @map("cantidad") @db.Decimal(14, 3)
  /// NULL si la línea está pendiente: nunca se rellena con 0.
  precioUnitarioBs Decimal? @map("precio_unitario_bs") @db.Decimal(14, 4)
  subtotalBs       Decimal? @map("subtotal_bs") @db.Decimal(16, 2)
  pendiente        Boolean  @default(false)
  /// `CALCULADO` (precio de tienda) o `MANUAL` (lo escribió el usuario).
  origen           String   @map("origen") @db.VarChar(20)
  claveMaterial    String   @map("clave_material") @db.VarChar(60)
  /// { tipo, proveedor, url, sku, unidadExterna, disponible, capturadoEn, motivo? }
  fuente           Json?    @map("fuente") @db.JsonB
  nota             String?  @map("nota") @db.VarChar(255)

  presupuesto Presupuesto @relation(fields: [presupuestoId], references: [id], onDelete: Cascade)

  @@index([presupuestoId, orden])
  @@map("presupuesto_linea")
}
```

`claveMaterial` es obligatoria y el DTO la exige con
`/^[a-z0-9_]{3,60}$/`: es la unión con el catálogo de precios. Se permite
cualquier clave nueva (un material que solo existe en la obra), pero entonces
no tiene precio automático y necesita `precioManualBs` o queda pendiente.

**Línea pendiente.** Si no hay precio de proveedor y el usuario no escribió uno,
la línea se guarda con `pendiente = true`, `precioUnitarioBs = null` y
`subtotalBs = null`. No suma al total y `lineasPendientes` lo informa en la
cabecera. Es la decisión que evita que un total incompleto parezca definitivo.

### 3.2 Qué conserva

- Snapshot completo con precios congelados y total en Bs, más la tasa para USD.
- `documentoHash` y `recetaVersion`: el presupuesto sigue siendo reproducible.
- Fuente y fecha del precio por renglón (URL, proveedor, SKU).
- Líneas pendientes explícitas en vez de ceros silenciosos.
- Migración de una sola pasada: 2 `CREATE TABLE`, 0 enums.

### 3.3 Qué se pierde

- **Comparación entre proveedores**: no hay forma de decir "este mismo cemento
  está Bs 79 en Constructor Bolivia y no aparece en Morales" sin leer JSON.
- **Historial de precios**: cada presupuesto es una isla; no se puede graficar
  la evolución ni avisar de variaciones.
- **Integridad del mapeo**: `claveMaterial` y el SKU viven en texto; un typo
  parte el agrupado en dos totales.
- **Sin dedupe ni retención**: no aplica, porque no hay tabla de observaciones.
- **Reutilizar precios exige recalcular** cada presupuesto nuevo desde las
  tiendas. Hay caché en memoria de 24 h por proceso, pero no queda registro: el
  histórico no existe y dos presupuestos pueden tener precios distintos sin que
  se pueda reconstruir el porqué.

### 3.4 Costos y riesgos

- Costo bajo: 2 modelos, 1 migración, sin tarea de sync obligatoria (el scraping
  puede alimentar directamente las líneas).
- Riesgo principal: si más adelante se quiere historial o comparación, hay que
  migrar datos desde JSON. Es factible (§5) pero el `fuente` de los presupuestos
  viejos no tiene SKU normalizado ni factor de conversión: se recupera lo que se
  haya escrito bien.

---

## 4. Comparativa

| Criterio | A (6 tablas) | B (2 tablas) |
|---|---|---|
| Entrega inicial | ~2–3 días (modelos + sync + mapeos) | ~1 día (modelos + cálculo) |
| Comparar proveedores | Nativo | No |
| "Precio de hace 3 meses" | Consulta indexada | Imposible |
| Corregir un mapeo | UPDATE de una fila | Reescribir líneas |
| Agrupar por material | FK | Texto libre |
| Sync programada | Necesaria | Opcional |
| Cambios destructivos al migrar a A | — | Ninguno (aditivo) |
| Sirve para F3+ (licitaciones, compras) | Sí | No |

---

## 5. Camino de B a A

B es un subconjunto de A, así que la ampliación es aditiva y sin downtime:

1. Crear las 4 tablas faltantes (`catalogo_material`, `proveedor_precio`,
   `mapeo_proveedor_material`, `precio_observacion`) y los 2 enums.
2. Agregar a `presupuesto_linea` las columnas `material_id`, `proveedor_id`,
   `precio_observacion_id`, `origen`, `url_fuente`, `capturado_en`, todas
   **nullable** (los datos viejos siguen válidos).
3. Backfill con un script: por cada línea con `fuente`, crear/emparejar el
   material por `claveMaterial`, el proveedor por `fuente.proveedor`, y una
   observación con `fuente.precio`/`capturadoEn`.
4. Recién entonces marcar `presupuesto_linea.fuente` como legacy (dejarla, no
   borrarla) y empezar a escribir solo en las columnas nuevas.

Los presupuestos anteriores quedan legibles en ambos formatos.

---

## 6. Decisión tomada

**Se eligió la Opción B** (§3). Tres definiciones que quedaron cerradas con esa
elección:

1. **Líneas sin precio:** no se rechaza el presupuesto. La línea se guarda
   `pendiente`, con precio `null`, fuera del total, y `lineasPendientes` lo
   advierte. Permite armar el presupuesto completo aunque falten puertas y
   ventanas, sin que un 0 se lea como "gratis".
2. **Tipo de cambio USD:** lo escribe el usuario en cada presupuesto
   (`tipoCambioUsd` obligatorio). No hay tasa por defecto: la oficial (~6,96) y
   la paralela (~9–11) difieren demasiado como para elegirla por él.
3. **Quién resuelve el precio:** el backend. El front manda cantidades y claves;
   el backend consulta las tiendas, valida el número y lo congela con su fuente.

Lo que la Opción A habría resuelto y acá queda pendiente: comparación entre
proveedores, historial de precios y precio por ciudad (Constructor Bolivia
publica lista nacional).

---

## 7. Rollback

Ambas opciones se revierten solo con las tablas nuevas; ningún dato existente se
toca. En orden inverso por las FKs:

```sql
DROP TABLE IF EXISTS "presupuesto_linea";
DROP TABLE IF EXISTS "presupuesto";
DROP TABLE IF EXISTS "precio_observacion";
DROP TABLE IF EXISTS "mapeo_proveedor_material";
DROP TABLE IF EXISTS "proveedor_precio";
DROP TABLE IF EXISTS "catalogo_material";
DROP TYPE IF EXISTS "origen_linea";
DROP TYPE IF EXISTS "tipo_proveedor";
```

Con Prisma: `npx prisma migrate resolve --rolled-back <nombre_migracion>` y
volver a generar el cliente. Los presupuestos guardados se pierden, pero el
plano (`proyecto.esquema_json`) y las versiones quedan intactos: se puede
regenerar el presupuesto en cualquier momento.

Hoy solo existen las dos primeras tablas; el resto del `DROP` corresponde a la
Opción A, que no se migró.

---

## 8. Implementación de la Opción B

Migración: `prisma/migrations/20261112120000_presupuesto_materiales_minimo`
(`CREATE TABLE` ×2, sin enums).

### 8.1 Endpoints (`src/modules/presupuestos`)

| Método | Ruta | Capacidad | Resultado |
|---|---|---|---|
| POST | `/proyectos/:id/presupuestos` | `editar` | `201` snapshot con líneas |
| GET | `/proyectos/:id/presupuestos` | `leer` | `200` lista con `desactualizado` |
| GET | `/proyectos/:id/presupuestos/:presupuestoId` | `leer` | `200` detalle con líneas |
| PATCH | `/proyectos/:id/presupuestos/:presupuestoId` | `editar` | `200` solo renombra |
| DELETE | `/proyectos/:id/presupuestos/:presupuestoId` | `administrar` | `200` |

Toda consulta filtra por `proyectoId` además del id: sin eso, un id ajeno
sería accesible para cualquiera con `leer` en su propio proyecto.

### 8.2 Cuerpo de creación

```json
{
  "nombre": "Casa 2 dormitorios — materiales",
  "recetaVersion": "1.0.0",
  "tipoCambioUsd": 6.96,
  "tipoCambioFuente": "manual",
  "lineas": [
    { "claveMaterial": "ladrillo_6h", "categoria": "MAMPOSTERIA",
      "descripcion": "Ladrillo 6 huecos", "unidad": "pza",
      "cantidad": 1800 },
    { "claveMaterial": "puerta_interior_080", "categoria": "ABERTURA",
      "descripcion": "Puerta interior 0,80 m", "unidad": "pza",
      "cantidad": 3, "precioManualBs": 850 }
  ]
}
```

Los montos y cantidades de la respuesta viajan como **string** (`"2808.00"`),
no como number: son `Decimal` en la base y el camino por coma flotante haría
que el total no coincida con la suma de los renglones.

### 8.3 Catálogo con precio automático (verificado en vivo)

| Clave | Proveedor | Cómo se identifica | Presentación |
|---|---|---|---|
| `cemento_ip30_50kg` | constructorbolivia | nombre contiene `IP30` | bolsa 50 kg |
| `ladrillo_6h` | constructorbolivia | SKU `6HER` | pieza |
| `ladrillo_18h` | constructorbolivia | SKU `18 H` | pieza |
| `fierro_corrugado_6mm` | constructorbolivia | nombre contiene `DN=6mm` | barra 9 m |
| `cerradura_externa` | morales | nombre contiene `Cerradura Externa Niquelada Icsa 110/40` | pieza |

El resto de materiales (puertas, ventanas, pintura, cerámica, porcelanato)
queda **manual**: o no tienen tienda con precio en Santa Cruz, o la
presentación publicada es ambigua (por pieza, por caja o por m²).

Dos defensas del adaptador de Constructor Bolivia: los precios llegan en
**centavos** (`7900` = Bs 79,00) y en productos con variantes `price` es el
mínimo y `price_range.max_amount` el combo por millar (Bs 1.790). El rango de
sanidad de cada ficha descarta el número si cae fuera de magnitud, y la línea
queda pendiente en vez de con un precio absurdo.

### 8.4 Verificación realizada

- `npx prisma validate` y `npx prisma migrate status` (migración aplicada y
  registrada; la base ya tenía la migración de OAuth que no está en el repo, así
  que el SQL se generó con `migrate diff` y se aplicó de forma aditiva).
- `npm run build` sin errores y `npx jest`: 37 pruebas en 7 suites.
- Prueba de humo contra la API real: 5 líneas (3 de tienda, 1 manual, 1 sin
  precio) → total Bs 9.404,96 / USD 1.351,29, `lineasPendientes: 1`, y
  `400`/`401`/`404` donde correspondía.

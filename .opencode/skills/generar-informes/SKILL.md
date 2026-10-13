---
name: generar-informes
description: Genera los informes del backend en /informes (endpoints.md, criteriosAceptacion.md, pruebasRealizadas.md). Use ONLY when the user explicitly asks to generate or update the informes.
---

# Generar Informes

Genera (o regenera) los tres documentos de documentación del backend en la
carpeta `informes/` de la raíz del proyecto. Esta tarea es **bajo demanda**:
ejecútala SOLO cuando el usuario lo pida explícitamente. Nunca la ejecutes
de forma automática tras cambios de código.

## Archivos a producir

1. `informes/endpoints.md` — todos los endpoints disponibles:
   método + ruta, qué datos pide (body/query/params con reglas de validación),
   qué retorna (forma + status) y errores posibles.
2. `informes/criteriosAceptacion.md` — criterios de aceptación verificables
   que el backend cumple, numerados (`CA-G-*` globales, `CA-A-*` auth,
   `CA-P-*` proyectos u otros por dominio).
3. `informes/pruebasRealizadas.md` — tablas con las pruebas ejecutadas
   en la sesión (unitarias, estáticas, build) y pendientes honestamente
   marcados como no ejecutados. El nombre canónico es
   `pruebasRealizadas.md` (normalizar mayúsculas si el usuario escribe otra
   variante).

## Procedimiento

1. **Inspeccionar antes de escribir.** Lee los controllers (`src/modules/*/*.controller.ts`
   o `controller/`), sus DTOs, guards y decoradores aplicados, y `src/main.ts`
   (pipes globales, CORS). No documentes ningún endpoint sin haberlo visto
   en el código.
2. **Ejecutar verificaciones reales** y registrar sus resultados tal cual salen:
   - `npx jest --verbose` (nombres reales de suites y casos)
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm run build`
3. **Reglas de contenido:**
   - `endpoints.md`: incluir mecanismo de auth (cookie `tokenAcceso` httpOnly /
     Bearer, qué rutas son `@Public()`), forma de error estándar
     `{ statusCode, message, error }` y contrato de paginación
     `{ datos, total, pagina, limite }` si aplica.
   - `criteriosAceptacion.md`: cada criterio debe ser comprobable
     (entrada → resultado esperado + status). Mapear a endpoints.
   - `pruebasRealizadas.md`: tabla suite → caso → resultado con datos reales;
     tabla de verificaciones estáticas; sección de pendientes (E2E/manual)
     marcados como no ejecutados. Prohibido inventar resultados.
4. **No tocar código fuente.** Solo se crean/sobrescriben los tres `.md`.
   Si `informes/` no existe, créala.

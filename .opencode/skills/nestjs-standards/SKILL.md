---
name: nestjs-standards
description: "Use when creating, modifying, refactoring, or reviewing NestJS and TypeScript code. Enforces mandatory coding standards - naming conventions (kebab-case files, PascalCase classes, camelCase members), strict TypeScript (no `any`), DTOs with class-validator validation, NestJS exception-based error handling, security rules, modular architecture by feature, database/pagination/transactions, testing, and software quality factors (correctness, efficiency, reliability, usability, maintainability/scalability, security/integrity, portability). Identifiers are written in the language of the conversation (Spanish). Front-load keywords like `usuario.repository.ts`, `CrearUsuarioDto`, `ValidationPipe`, `NotFoundException`, `nestjs`."
---

# NestJS Coding Standards

Mandatory standards for NestJS/TypeScript projects. The agent MUST follow these when creating, modifying, refactoring, or reviewing code.

Goals: clarity, consistency, type safety, maintainability, testability, security, scalability.

---

## 1. General Rules

- Inspect the existing project before modifying it; follow its conventions when safe.
- Keep changes focused on the task; avoid unrelated refactoring and new dependencies without a clear reason.
- Prefer simple solutions and reuse existing components; don't duplicate functionality.
- Never disable linting or type checking to make code pass.

## 2. Language

All code identifiers MUST be written in the language used in the conversation/session (currently Spanish). Comments MAY use the project's documentation language.

Good: `usuarioId`, `fechaCreacion`, `buscarUsuarioPorId`, `CrearUsuarioDto`, `usuario.repository.ts`
Avoid: mixing languages or partial translations (`userId` combined with `fechaCreacion`), translating library/API names (`NotFoundException`, `ValidationPipe` stay as-is).

## 3. Naming

| Item | Convention | Examples |
|------|-----------|----------|
| Files | `kebab-case` | `crear-usuario.dto.ts`, `auth.guard.ts` |
| Suffixes | `.controller.ts .service.ts .module.ts .repository.ts .entity.ts .dto.ts .guard.ts .interceptor.ts .pipe.ts .filter.ts .decorator.ts .strategy.ts .spec.ts` | |
| Classes/DTOs/Entities/Enums/Types | `PascalCase` | `UsuarioService`, `CrearUsuarioDto` |
| Enums members | `UPPER_SNAKE_CASE` | `ACTIVO`, `INACTIVO` |
| Methods/Functions | `camelCase`, descriptive verbs | `buscarUsuarioPorId()` |
| Variables | `camelCase`, descriptive | `usuario`, `tokenAcceso` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_TAMANIO_PAGINA` |
| Booleans | prefix `es/tiene/puede/debe` | `esActivo()`, `tienePermiso` |
| Collections | plural | `usuarios`, `itemsPedido` |
| Interfaces | `PascalCase`, no `I` prefix | `UsuarioRepository` |
| Acronyms | normal words | `usuarioId`, `apiCliente`, `url` |
| IDs | descriptive | `usuarioId`, `pedidoId` |
| Private members | plain `camelCase`, no `_` prefix | `private readonly repo` |

Avoid vague method names (`process`, `handle`, `data`, `result`) unless unambiguous in context.

## 4. TypeScript

- Strict mode only.
- No `any` unless unavoidable and justified; prefer `unknown`.
- No unsafe type assertions; meaningful types over suppressed errors.
- Public methods SHOULD have explicit return types.

## 5. Architecture

Organize by business feature/domain, not only by technical type:

```
src/
├── modules/          # users/, products/, orders/, auth/...
├── common/
├── config/
├── database/
└── main.ts
```

Each feature encapsulates its controllers, services, DTOs, repositories, guards, strategies, mappers, and tests. Keep modules cohesive, export only what's needed, avoid circular dependencies (`forwardRef()` is a last resort).

## 6. Layers

- **Controllers** are thin: routing, params, DTOs, call services, return responses. No business logic, complex queries, or password hashing.
- **Services** hold application/business logic. Keep responsibilities focused (no "God Services"); extract concerns when too large.
- **DTOs** for all external structured input (body, query, params). Never use DB entities as request DTOs.
- **DB access** isolated behind repositories/persistence services; controllers must never touch the DB directly.

## 7. Validation

Validate all external input via `ValidationPipe` + `class-validator`:

```typescript
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

Never trust client-provided data.

## 8. Error Handling

Use NestJS exceptions; never return HTTP error objects:

```typescript
throw new NotFoundException('User not found');
```

Don't add unnecessary `try/catch`; never silently swallow errors.

## 9. Security

- Never hard-code secrets or commit credentials; use secure config/environment (`@nestjs/config`, `getOrThrow`).
- Never log passwords or tokens; never expose password hashes — return response DTOs, not entities, when they contain sensitive/internal fields.
- Backend must enforce authorization (guards, strategies, roles, policies); never rely on frontend authorization.
- Validate uploaded files, configure CORS intentionally, apply rate limiting and payload limits where appropriate.
- Separate authentication and authorization concerns; don't duplicate authorization logic across controllers.

## 10. Database / Pagination / Transactions

- Filter in the DB; avoid N+1; select only needed data; use indexes.
- Require pagination for large collections with bounded limits (never unrestricted client limits).
- Use transactions only when atomicity is required; avoid long-running operations inside them.
- Don't create repositories automatically if the project architecture doesn't need them.

## 11. Configuration / Logging / Async

- Use `@nestjs/config`; validate env vars at startup; never hard-code environment values.
- Use NestJS `Logger`, not `console.log`. Logs must not contain passwords, tokens, API keys, or secrets.
- Prefer `async/await`; use `Promise.all()` for independent concurrent operations.

## 12. External Services

Isolate behind dedicated adapters. Handle timeouts, auth, retries, rate limits, errors, and response validation. Never assume availability.

## 13. Testing

- Jest; focus on behavior (business rules, auth, validation, error handling, edge cases).
- Use unit, integration, and critical E2E tests appropriately. Behavioral changes include tests.

## 14. API Standards

Predictable resource-oriented routes (`GET/POST/PATCH/DELETE /users...`), correct HTTP semantics, versioning when needed, update docs on public API changes.

## 15. Quality Factors

Every change MUST be evaluated against these 7 factors. They are applied as concrete rules; sections already covering a factor are referenced, not repeated.

| Factor | What it means for the agent | Mandatory rules |
|--------|-----------------------------|-----------------|
| **1. Correctness** | Code does exactly what the requirements say, with no logic errors. | Implement only the stated requirement; if it is ambiguous, ask or state the assumption. Cover business rules and edge cases (empty, null, boundary, duplicate values) with tests. Never mark a task done without running the checks from the workflow. |
| **2. Efficiency** | Minimal use of CPU, memory, bandwidth and response time. | No N+1 queries; select only needed columns; paginate (see §10). Use `Promise.all()` for independent I/O. Don't load whole collections into memory (use streams/batches for large data). No blocking synchronous operations in request handlers. |
| **3. Reliability** | The system keeps working under normal, abnormal and unexpected input. | Validate all input (§7). Set timeouts and handle failures of external services (§12). Fail with explicit exceptions (§8), never silently. Make critical operations idempotent or transactional. Don't assume a resource exists or a call succeeds. Expose a health check when the project has infrastructure to use it. |
| **4. Usability** | Only API-level usability (UI/UX belongs to the frontend skill): the API is predictable and easy to consume. | Follow the Frontend Contract below. Clear, actionable error messages (no stack traces or internals). Correct HTTP status codes. Document public endpoints (Swagger/OpenAPI) with examples. Predictable routes (§14). Validation errors must say which field failed and why. |
| **5. Maintainability & Scalability** | Easy to read/change, and able to grow in users and data without degrading. | Follow §3, §5, §6: small, single-purpose functions and classes; no duplication; no dead code or magic numbers (use named constants). Stateless services (no in-memory state that breaks with multiple instances). Heavy or slow work goes to queues/background jobs. Design for horizontal scaling; cache only with a clear invalidation strategy. |
| **6. Security & Integrity** | Data is protected from unauthorized access and stays accurate and consistent. | Follow §9. Integrity: use DB constraints (unique, FK, not null) in addition to DTO validation; use transactions for multi-step writes (§10); never trust client-calculated values (prices, totals, roles); prefer soft-delete/audit fields where data history matters. |
| **7. Portability** | Runs on different OS, environments and infrastructure with minimal adaptation. | All environment-specific values come from config (§11). Use `path.join`/`path.resolve`, never hard-coded OS paths or separators. No dependency on a specific OS, shell or local machine state. Keep dependencies and Node version declared (`engines`, lockfile). Provide/maintain `Dockerfile` or equivalent only if the project already uses containers. |

**Trade-offs:** when factors conflict (e.g., efficiency vs. maintainability), prefer correctness, security and reliability first; optimize only with evidence (measurement), and keep the code readable.

### Frontend Contract

The frontend (skill `nextjs-frontend-standards`) relies on this contract. Do not change it without updating both skills:

- **Errors:** always the standard NestJS shape `{ statusCode, message, error }`; for validation errors `message` is an array of strings. Use exceptions (§8) and a global exception filter if the default shape is altered. Use `401` for unauthenticated and `403` for forbidden.
- **Pagination:** query params `pagina` and `limite` (bounded, §10); collection responses return `{ datos, total, pagina, limite }`.
- **Authentication:** JWT in an httpOnly cookie named `tokenAcceso`; never return the token in the response body.
- **CORS:** `origin` set to the exact frontend URL (never `*`) with `credentials: true`; cookie `SameSite=None; Secure` when frontend and backend are on different domains (`COOKIE_SECURE=true`).
- **Responses:** return response DTOs, never entities (§9), so the frontend types stay stable.

## 16. Final Review Checklist

- Correct module/layer; no circular deps; business logic outside controllers.
- Naming: kebab-case files, PascalCase classes, camelCase members, identifiers in the project language (Spanish), descriptive names.
- TS strict, no `any`, no unsafe assertions, public APIs typed.
- DTOs used, external input validated.
- No secrets, no sensitive logging, authorization enforced, sensitive fields not exposed.
- Queries efficient, pagination where needed, no obvious N+1, transactions where required.
- New behavior has tests; relevant tests/lint pass; no dead code or unrelated changes.
- Quality factors (§15): meets the requirement (correctness), efficient, fails safely (reliability), clear API and errors (usability), maintainable and stateless (scalability), data integrity guaranteed, no environment-specific hard-coding (portability).

## 17. Core Principle

Prefer **simple + explicit + type-safe + secure + testable + consistent** over **clever + abstract + duplicated + tightly coupled**. The goal is code that another developer can understand, test, maintain, and safely extend.

---

## AI Agent Workflow

- **Before:** inspect structure, find owning module, check related files, reuse existing components, identify affected layers.
- **During:** smallest safe change, follow conventions, don't touch unrelated files or add unneeded abstractions/dependencies.
- **After:** run available checks (`npm run lint`, `npm test`, E2E for API changes, verify migrations if schema changed).

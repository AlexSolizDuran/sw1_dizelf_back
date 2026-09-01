# AGENTS.md - dizelf_back

## Arquitectura
- Modular: un módulo por dominio de negocio
- Escalable: estructura preparada para crecer
- Seguro: validación en todos los puntos de entrada

## Estructura de Directorios
src/
├── modules/       # Un directorio por feature/domain
├── common/        # Compartido: guards, pipes, decorators
├── config/        # Configuración centralizada
└── main.ts        # Punto de entrada
prisma/
├── schema.prisma  # Definición de modelos
└── migrations/    # Migraciones generadas

## Convenciones de Código
- Cada módulo tiene su propio controller, service, DTOs
- Los DTOs validan toda entrada (request)
- Núnca exponer entidades de Prisma directamente
- Usar dependency injection de NestJS
- Separar lógica de negocio de presentación

## Prisma
- Un servicio de Prisma compartido (PrismaService)
- Validar conexiones y transacciones
- Usar transactions para operaciones múltiples
- No hacer queries N+1 (usar include/select)

## Seguridad
- Todo endpoint requiere autenticación (excepto login/register)
- Validar y sanitizar todas las entradas
- No exponer información sensible en errores
- Usar HTTPS en producción
- Rotar secrets periódicamente

## Comentarios
- Documentar funciones públicas con JSDoc
- Explicar "por qué", no "qué" en lógica compleja
- Mantener comentarios actualizados

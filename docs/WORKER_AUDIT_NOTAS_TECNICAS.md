# Auditoría técnica inicial de `worker.js`

## Estado actual
El archivo `worker.js` sí contiene el backend real productivo y concentra demasiadas responsabilidades en un solo archivo.

## Hallazgos concretos detectados

### 1. Router con duplicaciones
Dentro de `fetch()` hay rutas de provincia que aparecen duplicadas o repetidas bajo distintas formas, por ejemplo:
- `/api/provincia/backfill-kick`
- `/api/provincia/backfill-status`

Esto no necesariamente rompe producción hoy, pero aumenta el riesgo de errores futuros cuando se edite el router.

### 2. Mezcla de estilos de autenticación
Hay endpoints que resuelven usuario con:
- bearer token en `Authorization`
- `user_id` por query string o body

Eso funciona, pero vuelve más difícil endurecer seguridad o unificar validaciones.

### 3. Archivo demasiado acoplado
`worker.js` mezcla al menos estas áreas:
- helpers generales
- acceso a Supabase
- auth
- planes y suscripciones
- preferencias
- matching / alertas
- histórico de usuario
- backfill provincial
- Mercado Pago
- WhatsApp
- email / digest
- admin

## Estrategia recomendada de refactor
### Fase 1
- No cambiar rutas públicas.
- No mover todavía a múltiples archivos.
- Identificar secciones internas y agruparlas mentalmente por responsabilidad.
- Eliminar duplicaciones obvias del router solo cuando la equivalencia esté 100% confirmada.

### Fase 2
- Extraer helpers de Supabase.
- Extraer helpers de auth.
- Extraer helpers de planes y límites.
- Extraer helpers de provincia / histórico.

### Fase 3
- Recién después modularizar físicamente en más de un archivo.

## Regla de seguridad
Mientras el frontend productivo dependa de estas rutas, cualquier cambio del router debe ser:
- mínimo
- reversible
- fácil de comparar contra el comportamiento anterior

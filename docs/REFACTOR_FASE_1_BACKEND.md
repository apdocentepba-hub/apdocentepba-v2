# Refactor fase 1 del backend

## Objetivo
Ordenar `worker.js` sin romper producción ni cambiar endpoints usados por el frontend.

## Endpoints que NO se deben romper
- `/api/login`
- `/api/register`
- `/api/google-auth`
- `/api/mi-plan`
- `/api/guardar-preferencias`
- `/api/mis-alertas`
- `/api/postulantes-resumen`
- `/api/capturar-historico-apd`
- `/api/historico-resumen`
- `/api/provincia/*`
- `/api/admin/*`

## Qué se va a separar primero
### 1. Helpers base
- `jsonResponse`
- `corsHeaders`
- normalización
- parseo de fechas
- sleep / retry helpers

### 2. Supabase helpers
- select
- insert
- upsert
- patch
- retry logic

### 3. Auth
- login
- register
- google auth
- password helpers
- sesión por bearer

### 4. Planes
- resolver plan
- normalizar catálogo
- límites por plan
- sanitización de preferencias por plan

### 5. Preferencias y alertas
- obtener preferencias
- canonización
- matching
- construcción de alertas

## Regla de implementación
Primero ordenar internamente.
Después, recién si todo queda estable, dividir en más de un archivo.

## Motivo
El Worker ya es grande y toca demasiadas áreas. Antes de moverlo físicamente a varios módulos conviene estabilizar la lógica por bloques bien identificados.

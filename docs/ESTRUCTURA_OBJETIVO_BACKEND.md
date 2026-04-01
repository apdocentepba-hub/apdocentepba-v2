# Estructura objetivo del backend

## Estado actual
Hoy el backend real vive en un solo archivo:
- `worker.js`

Eso funciona, pero mezcla demasiadas responsabilidades.

## Objetivo de mediano plazo
Sin cambiar stack ni endpoints, llevar el backend a una estructura como esta:

```txt
/worker
  /handlers
    auth.js
    plans.js
    preferences.js
    alerts.js
    provincia.js
    admin.js
    payments.js
    whatsapp.js
  /services
    supabase.js
    auth.js
    plans.js
    matching.js
    historico.js
    provincia.js
    email.js
    whatsapp.js
    mercadopago.js
  /utils
    http.js
    dates.js
    normalize.js
    logging.js
    parse.js
  index.js
```

## Regla de migración
### Fase 1
- No mover todavía a múltiples archivos.
- Ordenar internamente `worker.js` por secciones.
- Detectar duplicaciones y helpers repetidos.

### Fase 2
- Extraer primero helpers puros y acceso a Supabase.
- Después auth, planes y preferencias.
- Después provincia, admin y pagos.

### Fase 3
- Recién cuando todo sea estable, pasar al layout final por archivos.

## Ventaja
Esto mantiene el mismo stack:
- GitHub
- Cloudflare Workers
- Supabase

pero deja el backend mucho menos dependiente de un único archivo gigante.

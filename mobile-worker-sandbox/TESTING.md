# Prueba segura del Worker móvil sandbox

Este sandbox no reemplaza el Worker real y no tiene rutas a `alertasapd.com.ar`.

## 1. Chequeo sin deploy

En GitHub Actions ejecutar:

```txt
Check Mobile Worker Sandbox
```

Esto hace un `wrangler deploy --dry-run` y solo valida que el Worker empaquete.

## 2. Deploy manual aislado

Solo si el chequeo pasa, ejecutar manualmente:

```txt
Deploy Mobile Worker Sandbox
```

Condiciones de seguridad:

- Usar branch `mobile-worker-sandbox`.
- El Worker se llama `apdocentepba-mobile-alerts-sandbox`.
- No tiene `routes`.
- No apunta a `alertasapd.com.ar`.
- No reemplaza `ancient-wildflower-cd37`.

## 3. Variables/secrets necesarios en Cloudflare

El Worker móvil separado necesita las mismas variables de lectura que el clon usa por `env.*`, por ejemplo:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

No poner esas claves en la APK ni en archivos públicos.

## 4. Endpoints de prueba

Primero probar:

```txt
/mobile/health
```

Después:

```txt
/mobile/version
```

Finalmente:

```txt
/mobile/alerts?user_id=TU_USER_ID
```

## 5. Regla de rollback

Si el Worker móvil falla, se elimina o se ignora ese Worker nuevo. No afecta la web principal.

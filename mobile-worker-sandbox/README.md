# Mobile Worker Sandbox

Rama: `mobile-worker-sandbox`

Esta carpeta es un espacio aislado para pegar una copia del Worker de Cloudflare y trabajar una version movil sin tocar produccion.

No esta conectada a `alertasapd.com.ar`.
No modifica el Worker actual.
No modifica Cloudflare Pages.
No modifica Supabase.
No debe tener rutas de produccion ni deploy automatico.

## Archivo para pegar el Worker real

Pegar el codigo completo en:

```txt
mobile-worker-sandbox/worker-cloudflare-clone.js
```

## Regla de seguridad

Todo cambio movil debe quedarse en esta rama hasta probarlo aparte.

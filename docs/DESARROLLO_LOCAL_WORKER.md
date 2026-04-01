# Desarrollo local del Worker

## Objetivo
Poder trabajar el backend desde GitHub sin depender del editor de Cloudflare.

## Archivos importantes
- `worker.js`
- `wrangler.toml`
- `package.json`

## Instalación local
1. Instalar Node.js
2. Ejecutar `npm install`
3. Crear variables locales de desarrollo usando Wrangler o `.dev.vars`
4. Ejecutar `npm run dev:worker`

## Scripts
- `npm run dev:worker`
- `npm run deploy:worker`
- `npm run tail:worker`

## Nota importante
No subir `.dev.vars`, `.env` ni secrets reales al repo.

## Antes de deploy
Confirmar en Cloudflare:
- nombre del Worker
- cron triggers
- KV bindings
- variables y secrets

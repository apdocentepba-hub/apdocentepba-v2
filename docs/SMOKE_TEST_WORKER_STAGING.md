# Smoke test del Worker en staging

## Objetivo
Verificar rapido que el Worker responde bien antes de pensar en tocar produccion.

## Script disponible
- `scripts/smoke-worker.mjs`

## Workflow manual disponible
- `.github/workflows/smoke-worker-manual.yml`

## Qué chequea
- `GET /api/test-db` → debe devolver 200
- `GET /api/planes` → debe devolver 200
- `GET /api/whatsapp/health` → debe devolver 200
- `GET /api/provincia/backfill-status` → debe devolver 200
- `GET /api/no-existe` → debe devolver 404

## Forma 1: desde la PC
```bash
node scripts/smoke-worker.mjs https://tu-worker.workers.dev
```

## Forma 2: desde GitHub Actions
1. Abrir Actions
2. Elegir `Smoke test Worker manual`
3. Ejecutarlo manualmente
4. Pegar la URL base del Worker

## Cuándo usarlo
- después de un deploy a staging
- después de reemplazar el bloque principal del router
- antes de pensar en merge a `main`

## Qué NO valida
- login real
- Google auth
- guardado de preferencias
- matching completo
- webhooks de Mercado Pago
- envios reales de WhatsApp o email

Este smoke test sirve para detectar roturas gruesas del router y errores 500 tempranos.

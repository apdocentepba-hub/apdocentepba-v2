# Histórico provincial — candidato unificado (no desplegado)

El proyecto dispone de dos funcionalidades independientes en modo vista previa:

- **Escritura:** `APD_DAILY_SUMMARY_ENABLED=true` invoca la RPC únicamente al concluir el barrido y persistir estado `finished`. Ante errores, no altera el estado final del escáner.
- **Lectura administrativa:** `APD_DAILY_HISTORY_READ_ENABLED=true` habilita `GET /api/admin/provincia/historico-diario` con sesión Bearer y rol de administrador. Sin habilitación devuelve 404 sin consultas.

`scripts/build-apd-history-unified-preview.mjs` compone ambas en el Worker compilado canónico **sin cambiarlo ni desplegarlo**. `scripts/test-apd-history-unified-preview.mjs` comprueba que no se duplican funciones ni rutas, que los cierres del escáner se guardan antes de intentar la captura, que los snapshots masivos siguen apagados, que el ESM compila y que el `default.fetch` exportado respeta el apagado y rechaza usuarios sin Bearer sin consultar a Supabase. Toda la ejecución es aislada; el test prohíbe acceso a redes.

**Puerta de producción (no satisfecha):** respaldo recuperable de Supabase, migración aprobada y verificada, validación de capturas históricas de varios días, QA con sesiones reales y autorización separada del despliegue. No almacenar contraseñas ni datos privados en GitHub. La herramienta de huellas en Drive es un punto de control, no un dump completo.

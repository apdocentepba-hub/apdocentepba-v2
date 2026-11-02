# Auditoría sin credenciales — API pública del radar

La auditoría `scripts/audit-apd-radar-public-api.mjs` usa el Worker configurado en `app_v2.js`, valida que el dominio pertenezca a APDocentePBA y consulta exclusivamente dos rutas **GET públicas**:

- `/api/provincia/backfill-status`: último barrido completado y ofertas procesadas.
- `/api/provincia/resumen`: total de registros usados para estimar el resumen del radar.

No envía token de usuario, cookies ni solicitudes de escritura; no imprime ofertas individuales ni datos personales. Compara solo conteos públicos agregados. Si el resumen es inferior a las ofertas detectadas en un barrido completo y reciente, genera una advertencia de posible truncamiento por paginación/filtrado; no declara de manera automática que el motivo sea PostgREST.

Este control no altera el Worker ni reemplaza la verificación oficial de ABC. Sólo admite como resultado una auditoría de la respuesta pública; no acredita vigencia de vacantes ni exhaustividad del dataset.

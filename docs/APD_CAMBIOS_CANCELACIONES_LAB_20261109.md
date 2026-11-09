# APDocentePBA · Detector de modificaciones y cancelaciones · laboratorio v2
**Fecha:** 9/11/2026. **Estado:** pruebas offline únicamente; no desplegado ni conectado a envíos.

## Verificación de la fuente real (solo lectura)
Consulta agregada en proyecto Supabase APDocentePBA (sin recuperar identidades de docentes, oferta ni postulantes):
- `public.apd_ofertas_global_current`: 1.865 filas; último `last_seen_at` 2026-11-09 07:35:35 UTC.
- `public.apd_ofertas_global_snapshots`: 25.650 filas; último `captured_at` 2026-09-18 01:17:10 UTC.
- `public.apd_global_scan_state`: `PROVINCIA_FULL`, `current_published`, `finished`, 2026-11-09 07:35:36 UTC.
- `notes.snapshot_writes=false`; motivo `snapshot_storage_free_tier`. **No reactivar el histórico masivo**.

Esta evidencia confirma que no existen dos capturas oficiales recientes, completas y comparables de las que se pueda generar un flujo fiable de eventos. Ni los 1.865 registros de `current` ni el histórico de 2026-09-18 prueban cancelaciones actuales.

## Qué calcula este laboratorio
- Dos colecciones completas, mismo ámbito, identidad estable, timestamps de captura UTC inequívocos, 48h de separación máxima y segunda captura no mayor a 12h.
- Cambios de estado **explícitos** (nunca inferidos de desapariciones), horario, cierre, suplencia, institución, cargo, área y modalidad.
- Avisos internos de cruce a 72/24 horas del cierre, únicamente con plazo verificado.
- El `finoferta` de ABC admite su formato ISO con sufijo `Z` representando reloj local argentino. **Los timestamps de captura no siguen esa regla**.
- No se interpreta como cambio una fecha simplemente reformateada, ni un cierre imposible, ilegible o vacío.
- IDs de evento deterministas, sin mezclar cuentas, sin enviar correos, WhatsApp ni Telegram.

## Diseño pendiente antes de cualquier producción
1. **Prototipo implementado únicamente en memoria:** `scripts/apd-offer-compact-capture.mjs` recibe páginas del mismo distrito, exige offsets consecutivos, total de origen idéntico, identidad sin duplicados, mismo ámbito y timestamp explícito; retorna solo 14 campos necesarios, ordenados y con SHA-256. No copia `raw`, PID, postulantes, correo ni información personal. Se prueba en `scripts/test-apd-offer-compact-capture.mjs`. **No está conectado al escáner ni puede verificar por sí solo que la fuente externa entregó una instantánea atómica**.
2. Mantener como máximo una captura anterior y una actual por distrito (o un outbox restringido con TTL), con commits transaccionales y validación de cobertura; medir bytes e índices antes de habilitar escrituras.
3. Validar dos barridos completos consecutivos con la misma semántica de origen, sin confundir `current_published` con estado explícito de anulación.
4. Aislar eventos en tabla privada con clave única, caducidad, idempotencia, permisos mínimos y control de acceso. Verificar RLS en cada ruta de lectura.
5. Solo después: filtrar por preferencias y plan vigente, consentimientos y límites de frecuencia; probar colas y rollback; pedir autorización explícita antes de desplegar Worker o enviar notificaciones.

## Límites
El laboratorio demuestra comportamiento determinista sobre datos **sintéticos**. No certifica dos capturas recientes, la existencia de cancelaciones reales ni entrega de mensajes. La PR #256, creada antes de los cambios recientes en `main`, quedó desactualizada; esta PR v2 está basada en el `main` actualizado.

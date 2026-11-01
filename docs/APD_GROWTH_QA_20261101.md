# APDocentePBA — QA de activación y preferencias (2026-11-01)

## Estado y alcance
- Rama: `growth/landing-apd-20261101`.
- PR: https://github.com/apdocentepba-hub/apdocentepba-v2/pull/178
- **No fusionar ni desplegar a producción hasta completar QA autenticado.**
- Preview aislada (sin login real): https://apdocentepba-growth-preview.onrender.com/panel-demo.html
- Se preservaron Worker, base, usuarios, preferencias, facturación y entrega de correo productivos.

## Pruebas del producto

Se agregó `scripts/test-growth-worker-preferences.mjs`, que importa
**`worker-live/worker_hotfix.js`** (el bundle versionado que representa el Worker
productivo) como módulo ESM. TODA solicitud `fetch` del Worker se intercepta
con una API de Supabase simulada (`https://unit-test.supabase.co`). No se ejecuta
ningún acceso a la base real ni envíos externos.

Se comprueba:
1. POST sin Bearer → HTTP 401 sin consultar base.
2. Sesión caducada → HTTP 401 sin escritura.
3. Usuario inactivo → HTTP 401 sin escritura.
4. Intento de guardar un `user_id` ajeno → se usa el usuario de la sesión para
   la escritura; la lectura posterior `/api/account/preferences?user_id=OTRO`
   devuelve sólo las preferencias del dueño de la sesión.
5. POST con tipo de contenido no JSON → HTTP 415.
6. Email activado sobre una fila existente → conserva preferencias y canal;
   no ejecuta envío inicial porque se configura una fila anterior no vacía;
   en todos los casos se bloquea cualquier host externo distinto del falso.
7. Suscripción de pago vencida → HTTP 403, sin guardar.

Las pruebas complementarias `scripts/test-growth-preferences-roundtrip.mjs`
cubren las funciones de frontend reales, ida y vuelta de cargo, distrito,
niveles, turno y canal email; se corrigió compatibilidad de datos heredados
`MAÑANA` y `A` para turno.

## Evidencia CI
- Commit: `07b58ed8e90966a08248d9c1e5ab1144fc47d72f`.
- GitHub Actions: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41363264660
- **50/50 pruebas aprobadas:** 43 del bloque de producto (incluyendo las siete
  nuevas del Worker) más siete pruebas de seguridad de la preview.
- Smoke en Chrome: landing móvil y escritorio, guía, preferencias, email.
- 10/10 controles de repositorio concluyeron satisfactoriamente.

## Producción: observación exclusivamente de lectura

Consultas SQL agregadas a Supabase `vvgkinkvojqwfuqaxijh` a 2026-11-01:

| Indicador | Valor |
|---|---:|
| Cuentas registradas | 50 |
| Filas de preferencias | 18 |
| Filas con `alertas_activas=true` | 12 |
| Filas con `alertas_email=true` | 14 |
| Filas con ambas opciones activadas | 11 |
| Filas con distrito principal y al menos un cargo | 17 |
| Log de email `sent_alert_digest`, últimos 30 días | 233 |
| Destinatarios únicos de esos digest | 3 |
| Log de `sent_expiry_notice`, últimos 30 días | 35 |

Interpretación: 32 de 50 cuentas aún no guardaron preferencias; una parte
relevante del embudo de activación está incompleta. Los 233 registros de digest
se concentran en tres cuentas, pero **no debe concluirse que el correo falla
para las otras** sin considerar los planes vigentes, los filtros y la existencia
de nuevas ofertas. El estado literal `ACTIVE` de una fila de suscripción no
demuestra vigencia; revisar las fechas y beneficios administrativos especiales.

## Pendiente antes de publicar
1. QA de uso con cuenta de prueba **autorizada**, en entorno controlado,
   sin contraseñas ni tokens aportados al chat: alta, login, guardado, recarga.
2. Verificar backend real y comportamiento del envío inicial tras primer
   guardado con email activado; ese flujo está presente en el Worker. Evitar
   pruebas que hagan envíos sin consentimiento explícito.
3. Confirmar la paridad entre catálogo Supabase, límites de frontend y
   límites aplicados por Worker, incluyendo preferencias adicionales y planes
   especiales.
4. Revisar el manejo de errores y la medición del embudo (visita → registro →
   preferencias completas → plan vigente → digest efectivamente entregado).
5. QA final de dispositivos, accesibilidad y seguridad de sesión. Recién
   después considerar fusionar PR #178 y desplegar `main`.

## Reversión
Todos los cambios permanecen en la rama de desarrollo. La preview Render tiene
`autoDeploy=no` y una compilación aislada, por lo que la reversión de la demo
no requiere modificar la base productiva.

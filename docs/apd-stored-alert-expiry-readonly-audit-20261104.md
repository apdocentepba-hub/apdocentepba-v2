# APDocentePBA — cierre de auditoría de ofertas guardadas (04/11/2026)

## Evidencia leída de Supabase real (solo consultas)

Proyecto APDocentePBA; consultas SQL **solo lectura**, sin obtener nombres, emails ni identificadores de usuarios en resultados.

- `public.user_offer_state`: **19** filas con `is_active = true` para **7** usuarios.
- En **6** filas de **3** usuarios, el `finoferta` original de ABC ya quedó en el pasado, aunque `is_active` persiste en `true`; ninguna de esas 6 filas fue vista nuevamente durante las últimas dos semanas.
- Las otras **13** filas tienen cierre futuro; las 19 contienen hora original y estado original `Publicada`.
- Para este contraste se interpretó el campo `finoferta=...Z` de esta fuente ABC como reloj argentino, igual que en el guard experimental. **La convención requiere confirmación en la interfaz humana del portal ABC para una oferta concreta.** Las 6 ofertas vencidas son antiguas y no dependen materialmente de la diferencia de 3 horas.
- No se actualizaron las seis filas ni se alteró la base. Se trata de una discrepancia entre el indicador de caché y el plazo real, no de prueba de que se hayan enviado avisos incorrectos.

## Corrección preparada y comprobada

PR experimental [#245](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/245); último Worker candidato **offline**, sin desplegar:

- **SHA256 fuente:** `dee977aea3c1370b744f4a75a910c7429a2ed7b661dfa84d4b74d231db4422db`.
- **Artifact GitHub Actions:** `apd-stored-channel-deadline-safe-offline`, ID **13365647243**, ejecución [41918454231](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41918454231).
- **CI resultado:** `SUCCESS`; pruebas de cierre, correos, sesiones, preferencias, rutas privadas, PID y circuito completo del Worker con cuentas sintéticas, sin acceso real a cuentas.
- **Prueba de circuito final:** 2 ofertas compatibles esperadas en una simulación de ABC con 2 distritos; 7 búsquedas de PID simuladas; sesión acotada a cuenta sintética; ningún POST a Supabase real.

Funciones protegidas por validación de cierre *fail-closed*:
`fetchStoredOffers`, `sendPendingEmailDigests`, `loadTelegramStoredAlerts`, `waLoadStoredAlerts`, `handleTelegramWebhook`, `handleWhatsAppWebhook` y `runEmailAlertsSweep`.

Garantías del código preparado:
1. Las ofertas cacheadas vencidas, cerradas o con hora indeterminada no se muestran como vigentes a través de los canales indicados.
2. Se vuelve a verificar el cierre luego de enriquecer datos en los canales, antes de responder o preparar un digest.
3. Los IDs de ofertas registrados por el digest de email se calculan sobre la lista realmente renderizada, no sobre la lista previa al descarte.
4. Las rutinas de la versión anterior conservan las validaciones de plan, preferencias y sesión. Pruebas simuladas aprobadas.

## Estado de despliegue

- **La corrección de canales es OFFLINE, no está subida ni sirve tráfico en Cloudflare.**
- La última versión subida con 0 % fue `29ef1c70-3cc9-4ddc-ac05-31000546aad3`, que **no incluye** estos cambios.
- En la última atestación de Cloudflare, la versión productiva `da0632dd-1b9e-4332-9c4a-75b5eade8d74` servía el 100 %. No inferir que esa proporción sigue idéntica si no se efectúa una nueva lectura.
- La operación posterior para preparar otra subida quedó bloqueada por un control de la herramienta. No se forzó un bypass ni se ejecutó una subida posterior.
- PR #246 aborda un fallo de un workflow de radar no relacionado: su CI rojo no significa que fallaron las pruebas de este Worker.

## Pendiente de aceptación para lanzamiento

1. Confirmar el reloj de cierre mediante un caso concreto en la interfaz de ABC y atender discrepancias con SAD.
2. Subir el *exacto SHA de este Worker* mediante vía permitida con **0 % de tráfico** y verificar 29 bindings, 4 crons, rutas públicas y denegación de rutas privadas.
3. Probar autenticación, planes, preferencias, ofertas y carrusel con sesión real autorizada, sin exponer credenciales.
4. Validar escrituras de lotes PostgREST en entorno seguro o ensayo autorizado, su deduplicación y reversión, y una entrega de correo únicamente a destinatario de prueba autorizado.
5. Solo después, solicitar autorización independiente para canary de tráfico y posterior producción. No prometer entrega instantánea de alertas: el sistema de correo tiene franjas horarias.

**No se enviaron correos, mensajes de WhatsApp o Telegram, no se hicieron gastos, no se cambiaron planes, no se limpiaron datos de producción y no se activó esta versión.**

## Hallazgo posterior: filtros de cierre en el resumen por email

La revisión del Worker candidato identificó un riesgo en la ruta de email: el payload guardado se normaliza varias veces durante la carga, el enriquecimiento y el render. El guard anterior inspeccionaba una cantidad fija de capas `raw`; en esa ruta podía no alcanzar el `finoferta` original de ABC y clasificar como “no verificable” una oferta futura. Esto es consistente con la omisión del resumen reportada, pero no reemplaza la confirmación con logs de la ejecución productiva.

Se preparó una corrección en `scripts/lib/apd-offer-close-guard.mjs`: recorre de forma acotada hasta 32 niveles del grafo `raw/offer_payload`, mantiene el rechazo ante estados cerrados o conflictivos y da prioridad al `finoferta` fuente sobre etiquetas de presentación. La salida del candidato debe regenerarse desde esta rutina antes de cualquier uso.

**Estado:** código preparado en rama `fix/apd-stored-email-deep-expiry-20261104`; todavía no se reconstruyó el artefacto ni se repitieron las pruebas. No se subió nada a Cloudflare y no cambió el tráfico.


## Verificación offline y estado Cloudflare (2026-11-05)

- El bundle base local coincide con SHA-256 `dee977aea3c1370b744f4a75a910c7429a2ed7b661dfa84d4b74d231db4422db`.
- Se regeneró offline el Worker candidato reemplazando `apdOfferDeadlineStatus` por la versión acotada que recorre wrappers `raw` y `offer_payload`. Nuevo SHA-256: `358c142b4e5f837029453294a78f1a0934912c7e417f8adef6f00fab92d6ffd1`.
- Verificación local: `node --check` OK y 26 pruebas dirigidas aprobadas (0 fallas), incluyendo el resumen por correo y el vencimiento después del enriquecimiento.
- Lectura de Cloudflare: 29 entradas de configuración (28 variables/secretos y 1 binding KV) y 4 cron triggers; no se modificó configuración.
- La pantalla de Deployments mostraba la versión activa `0b289fe2` con 100 % de tráfico. No se subió este nuevo candidato ni se cambió tráfico: el panel de edición no ofrece una garantía visible de carga aislada, y el workflow de preview del repo construye desde `worker-live/worker_hotfix.js`, que no contiene esta función de cierre. No se reutilizó ese workflow para evitar desplegar una fuente distinta al bundle verificado.
- Sin llamadas a usuarios, sin correos enviados y sin cambios en producción.

El ZIP offline `APDocentePBA-worker-candidate-358c142b.zip` contiene el Worker, la atestación y esta información de verificación. La revisión con cuenta real permanece pendiente.


## Resultado del preview aislado (2026-11-05)

- El flujo de GitHub Actions `42011749862` terminó correctamente. Subió la versión `5b70c426-a806-4ba6-bb71-78f8fb0a1c0c` bajo el alias de preview `apd-candidate`, con SHA-256 del módulo `358c142b4e5f837029453294a78f1a0934912c7e417f8adef6f00fab92d6ffd1`.
- Cloudflare confirmó 29 bindings y el hash del módulo coincidió byte por byte con el candidato. La configuración declarada por Wrangler incluye los cuatro cron registrados en producción; la lectura de Settings mostró 4 cron. `versions upload` no ejecuta `triggers deploy`, según el propio log de Wrangler.
- La versión productiva antes y después fue `0b289fe2-e978-414a-a1ae-9f849d7354ae`, al 100 %. El candidato quedó como versión de preview sin promoción ni tráfico productivo.
- Smoke del preview con ID ficticio: endpoints protegidos respondieron 401; `/api/version`, `/api/planes` y OPTIONS respondieron correctamente. No se usaron cuentas reales y no se enviaron correos ni alertas.
- El PR de preparación se cerró sin fusionar porque GitHub mostró 62 archivos por divergencia de la rama. El cierre no revierte ni elimina la versión preview ya cargada.
- La autorización para cambiar el porcentaje de tráfico productivo sigue pendiente y no se solicitó ni ejecutó ningún cambio de tráfico.

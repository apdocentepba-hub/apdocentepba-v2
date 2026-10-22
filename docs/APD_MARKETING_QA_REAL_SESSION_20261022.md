# APDocente — Validación de sesión real del backend comercial

Fecha: 22/10/2026.

## Evidencia aportada por el propietario

El propietario, con sesión iniciada en https://alertasapd.com.ar/, ejecutó la prueba GET de solo lectura documentada en `docs/APD_MARKETING_QA_READONLY_BEFORE_RELEASE.md` contra:

`https://apd-marketing-safe-ancient-wildflower-cd37.apdocentepba.workers.dev`

La captura de la consola mostró `Resumen: 4/4 OK` y la tabla:

| Prueba | Pasó | HTTP |
| --- | --- | --- |
| Acceso del usuario con sesión | true | 200 |
| No acepta suplantación por query string | true | 200 |
| Solicitud sin sesión rechazada | true | 401 |
| No habilita campañas por defecto | true | 200 |

El mensaje rojo HTTP 401 corresponde a la solicitud anónima intencional: es un **resultado esperado**, no un problema de despliegue.

No se adjuntan emails, tokens, identificadores de usuarios, contraseñas ni contenido de respuestas.

## Interpretación y límites

- El backend candidato pasó la prueba de lectura autenticada y aislamiento de usuario desde el navegador del propietario.
- **Esto NO significa que ya se publicó** en el Worker principal. La nueva ruta sigue pendiente del workflow manual `Release marketing preferences backend (manual and gated)` con `main`.
- Tampoco se ha validado aún una operación de baja real (POST) ni su sincronización en Brevo, ni se ha confirmado la integración de opt-in/DOI.
- El frontend de controles comerciales permanece separado en PR #140 y no se debe publicar antes de comprobar el backend productivo.
- El número de contactos habilitados para campañas de reactivación sigue siendo **0**; no iniciar envíos publicitarios.

Próximo control: después de la publicación protegida del backend, repetir GET autenticado en el dominio productivo, comprobar el estado de cron y bindings, y luego publicar el frontend por separado.

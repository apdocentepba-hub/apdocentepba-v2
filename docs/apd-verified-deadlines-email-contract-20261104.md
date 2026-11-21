# APDocentePBA — Control final de veracidad de ofertas y correos (04/11/2026)

## Por qué se agregó este control

Una oferta con `estado=Publicada` puede haber llegado al instante de cierre. La hora exacta de postulación se verifica oferta por oferta. El instructivo provincial APD explica que hay cierres a las **07:30 y a las 10:30**, y una comunicación distrital de SAD Tandil registra antecedentes de divergencias entre la hora presentada en la plataforma y la efectiva comunicada. Por eso el sistema no puede prometer elegibilidad ni designación por el solo hecho de mostrar una coincidencia.

Referencias para contrastar:
- Instructivo APD de la Dirección de Gestión de Asuntos Docentes, página 4: https://sad117.com.ar/wp-content/uploads/2023/03/INSTRUCTIVO-APD-1-1.pdf
- SAD Tres de Febrero, cadena 19/2026 (18/02/2026): https://sad117.com.ar/2026/02/18/18897/
- SAD Tandil (advertencia histórica, **no usar como regla universal vigente**): https://sadtandil.wixsite.com/educacion/apd

## Resultados implementados, únicamente en nueva rama de investigación

- La validación exige `Publicada`, ausencia de estados contradictorios en capas guardadas, y cierre exacto posterior al instante actual.
- Prioridad de fuente: `finoferta` del registro ABC más profundo; secundariamente solo `fecha_cierre_raw`. **Jamás confiar en `fecha_cierre` ni `cierre` presentados al usuario** para asegurar que sigue abierta una oferta.
- Una fecha sin hora, un estado ambiguo, la ausencia de dato original o un plazo pasado hacen que el sistema rechace la oferta como `vigente`.
- El correo muestra la hora argentina derivada del mismo instante validado; no recicla un rótulo guardado, aunque indique otro día u hora.
- Correo con hora argentina de generación, advertencia de confirmación en ABC/SAD y aclaración explícita de que la alerta no asegura una designación.
- El primer correo respeta `isPlanActivo`: si el plan está vencido o no pudo verificarse, no consulta ofertas ni envía.
- Todas las pruebas usan cuentas ficticias, sin correos reales. La hora `Z` de `finoferta` se interpreta como convención de reloj local **solo para esta fuente ABC**, con test separado del ISO genérico. Esta es una interpretación corroborada indirectamente por documentación y lectura de la fuente, no una garantía frente a cambios futuros del proveedor.

## Evidencia y versión

- [PR #245](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/245) — cambios aislados, sin fusionar.
- [CI final con artefacto persistente, ejecución 41913070434](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/41913070434): **SUCCESS**, sin fallas de test. Incluye artefacto `apd-email-deadline-verification-offline` (GitHub Actions artifact **13363701632**), con Worker y attestation SHA256.
- Hash SHA256 de última versión offline aprobada: `c4bc191256bb465244bf0fcd69838add30a13d5f48ba2fc8bccf337e3225bba8`.
- Versión más reciente ya subida a Cloudflare con **0 %** pero **sin** este último endurecimiento: `29ef1c70-3cc9-4ddc-ac05-31000546aad3`.
- La versión productiva original permanece `da0632dd-1b9e-4332-9c4a-75b5eade8d74`, al **100 %** (última comprobación GET-only de subida/preview).

## Bloqueos finales (NO marcar como producción terminada)

1. Cuenta real autenticada: comprobar su plan, preferencias y carrusel con autorización efectiva; no inventar una sesión y no leer datos privados sin necesidad.
2. Prueba real de entrega y depuración de cola con destinatario de prueba autorizado.
3. Comprobación de cierre en interfaz ABC para una oferta concreta con posible excepción distrital (y, si existe conflicto con SAD, avisar o abstenerse).
4. Integración Supabase/PostgREST real para lotes, reversión y métricas tras canary.
5. Nueva subida 0% del último hash de correo: **requiere un procedimiento de subida separado**; la autorización de subida previa fue para una sola versión. El 1%/100% de producción siguen sin autorizar.

## Acción no realizada

No se enviaron alertas, no se activaron versiones para docentes, no se modificaron usuarios ni planes y no se cargó saldo en ningún proveedor.

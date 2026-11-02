# APDocentePBA — barrera de consistencia de páginas ABC (piloto sin despliegue)

Problema: ABC usa una lista paginada ordenada por `ult_movimiento desc`. Si cambia durante un barrido, los índices de páginas pueden moverse, repetir ofertas u omitir registros. La implementación anterior podía interpretar una captura parcial como completa y podar datos de ese distrito.

## Barrera agregada al candidato del Worker
La corrección existe solamente en `scripts/build-apd-scanner-source-alias-preview.mjs`, que genera el Worker temporal protegido por `APD_DISTRICT_SOURCE_ALIASES_ENABLED=true`.

- Verifica un `numFound` entero y no negativo en **cada página**. Si varía dentro de un lote, lanza error antes de subir ese lote y **no llega a la poda**.
- Rechaza ofertas con `source_offer_key` duplicado dentro de las páginas del lote.
- Cuando el distrito necesita más de un ciclo, guarda `notes.district_source_total` y compara ese conteo en la próxima etapa. Si cambió, falla antes del siguiente upsert y de la poda.
- La bandera apagada mantiene el escáner original (sin modificar ninguna ruta ni tabla productiva).
- El ensayo automático usa 650 ofertas sintéticas de MATANZA y una de AVELLANEDA, y simula una modificación del total de ABC entre las primeras 600 y las últimas 50, además de un duplicado en la segunda página. Exige estado `error`, preservación de las preferencias, ausencia de poda, y reversión **manual solo de memoria simulada**.

## Límites que NO resuelve
- **Total estable no implica orden estable.** Una oferta puede entrar o salir mientras otra la reemplaza y el `numFound` quedar igual, desplazando los `offset`. Para garantizar cobertura sin pérdidas se necesitaría paginación estable por clave/snapshot o reconciliación de identificadores y una operación de poda segura.
- Puede haber escrituras previas en pasos que ya finalizaron antes de detectar el cambio. La base no es transaccional por distritos en el flujo actual.
- No hay pruebas de recuperación PostgreSQL real ni respaldo integral restaurable. Por lo tanto, **no activar este candidato en producción aún**.

La auditoría no altera usuarios, pagos, suscripciones ni datos actuales.

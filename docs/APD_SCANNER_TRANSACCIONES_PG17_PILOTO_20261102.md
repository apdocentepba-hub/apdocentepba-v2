# APDocentePBA — prototipo transaccional por distrito en PostgreSQL 17

**02/11/2026 · No desplegado.** Código exclusivamente bajo `tests/sql/`. Todo se ejecuta en una base descartable dentro de GitHub Actions. No toca Supabase, el Worker, los usuarios ni las ofertas actuales.

## Riesgo real que aborda

El escáner productivo escribe `apd_ofertas_global_current` mediante varios `upsert` HTTP y ejecuta el borrado distrital después. Esas operaciones no son atómicas. Una interrupción puede dejar solo algunos lotes aplicados; la simulación del PR #217 demostró ese riesgo.

El prototipo `tests/sql/apd_atomic_district_pilot_pg17.sql` crea **un esquema aislado** `apd_scanner_pilot` con una tabla mínima de ofertas, un registro de capturas por distrito y una tabla de ofertas preparadas. La función `finalize_district` usa `SECURITY INVOKER`, bloqueo transaccional por distrito, validaciones de páginas completas, cantidad de ofertas, identificadores únicos y compatibilidad del distrito. El `UPSERT` y la poda opcional se ejecutan dentro de **una misma transacción de PostgreSQL**.

No permite repetir un mismo lote finalizado ni reasignar la clave de una oferta de otro distrito. No elimina registros por defecto; la poda se habilita solo cuando el lote fue marcado explícitamente y tiene ofertas no vacías.

## Prueba automatizada

`.github/workflows/apd-pg17-atomic-district-pilot.yml` levanta PostgreSQL **17 real** en un servicio temporal y ejecuta `tests/sql/test_apd_atomic_district_pg17.sh` para comprobar:

- Actualización sin borrado predeterminado y conservación del primer avistamiento.
- Interrupción provocada después de insertar: los cambios previos **se revierten automáticamente** por la transacción.
- Poda intencional limitada al distrito, sin afectar Avellaneda.
- Rechazo por captura incompleta, colisión de `source_offer_key`, cero ofertas y doble finalización.
- Copia y restauración de **solo ese esquema descartable** mediante `pg_dump` y `pg_restore`, con conteo posterior de registros y capturas.

La copia de prueba **no es un respaldo de Supabase**. No contiene las tablas reales, usuarios, credenciales, preferencias, historial ni suscripciones.

## Qué falta para pasar a producción

1. Diseñar tablas de staging y una función de aplicación compatibles con el esquema real y el control de acceso del Worker, sin publicar funciones peligrosas para `anon` o `authenticated`.
2. Modificar el flujo del Worker para almacenar la captura completa de cada distrito antes de finalizar; actualmente procesa varias páginas por etapa y guarda directamente en la tabla real.
3. Verificar la inmutabilidad del conjunto de ofertas de ABC durante la paginación: un total constante no garantiza idénticos identificadores.
4. Ensayar integración con PostgREST y PostgreSQL real usando estructura completa, preferencias, reintentos, concurrencia y cancelación.
5. Crear y verificar un respaldo recuperable de producción antes de activar migraciones o cambios destructivos; tener reversión probada.
6. Revisar por separado `CAPITAN SARMIENTO` en el catálogo y posibles referencias.
7. Desplegar primero con funciones y banderas desactivadas, y autorizar por separado el cambio productivo.

**No afirmar que el escáner productivo es atómico ni está corregido.** Esta prueba valida un diseño aislado de recuperación, no una actualización del sistema en uso.

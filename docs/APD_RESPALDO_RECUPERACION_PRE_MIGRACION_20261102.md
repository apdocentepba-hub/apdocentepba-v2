# APDocentePBA — Respaldo previo y recuperación del histórico

Estado: **bloqueo de despliegue**, 2 de noviembre de 2026.

## Evidencia real
- El proyecto Supabase de APDocentePBA está en la organización con plan **Free**, versión de PostgreSQL 17.
- Supabase documenta que los respaldos diarios administrados son para Pro, Team y Enterprise; para Free recomienda exportaciones regulares mediante CLI.
- El conector actualmente disponible NO ofrece descarga ni verificación de un respaldo completo. **No se verificó un respaldo recuperable de producción.**
- La tabla y la RPC del histórico diario siguen sin existir en producción. No está autorizado activar capturas ni cambiar el Worker.

## Qué sí está probado
- Migración SQL sobre PostgreSQL 16 y 17 en CI aislado.
- Permisos de rol `service_role`, RLS, rechazo de barridos inconsistentes, idempotencia.
- `scripts/test-apd-history-ddl-recovery.sql`: prueba exclusivamente en base efímera que el esquema nuevo se puede quitar dentro de una transacción de prueba y restaurar íntegro al revertir la transacción; las tablas existentes de escaneo y ofertas permanecen intactas. **No equivale a un respaldo completo de producción ni prueba una recuperación después de una falla real.**

## Para cumplir la condición de respaldo antes de instalar el esquema
Realizar un respaldo lógico **privado y fuera del repositorio público**, exportando esquema, roles y datos desde la misma base de producción. Según la documentación oficial de Supabase CLI: [Dumps schema/data](https://supabase.com/docs/reference/cli/supabase-db-dump) y [Backup/Restore](https://supabase.com/docs/guides/platform/backups).

Se necesita una conexión de base de datos obtenida en forma segura desde el panel Supabase y Docker + CLI instalados. **No guardar la contraseña en GitHub, archivos compartidos ni mensajes.**

Comandos de referencia de la documentación oficial, tras ingresar de forma segura la cadena de conexión al entorno local:

```sh
supabase db dump --db-url "$DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$DB_URL" -f schema.sql
supabase db dump --db-url "$DB_URL" -f data.sql --use-copy --data-only
```

Los archivos pueden contener datos privados de usuarios, correos y tokens: guardarlos cifrados en almacenamiento local seguro. No subirlos a GitHub ni compartirlos en el chat. Registrar fecha UTC, SHA-256 y tamaño de cada archivo. Revisar que tengan contenido y **ensayar una restauración en una base temporal aislada**, validando conteos e integridad de datos críticos antes de declarar el respaldo recuperable. Verificar también almacenamiento, secretos y configuraciones que no forman parte del dump.

## Puerta para la siguiente acción
Solo si el respaldo ha sido **generado y verificado como recuperable**, correr una última lectura de estado y aplicar únicamente `sql/apd_daily_province_summary_20261102.sql` mediante la herramienta de migraciones. Inmediatamente validar tabla vacía, RLS y rol de servicio. Mantener `APD_DAILY_SUMMARY_ENABLED` desactivada y el Worker intacto.

Si no puede verificarse el respaldo, detener la migración productiva. No crear una rama Supabase con coste no aprobado ni contratar un plan para conseguir backups.

## Reversión del cambio de esquema
El SQL añade solo tabla y RPC nuevas; no elimina ni modifica tablas existentes. Si una migración transaccional falla, verificar que no queden objetos parciales. Tras migración exitosa **y únicamente si la tabla sigue vacía y sin dependencias**, podría retirarse la función y la tabla nuevas mediante un procedimiento controlado, respaldado y autorizado; no automatizar `DROP` en producción. Si hay filas capturadas, preservar los datos y resolver con la bandera apagada.

# APDocentePBA — procedimiento de respaldo cifrado y restauración

**Fecha de revisión:** 2026-11-02. **Estado:** controles de laboratorio aprobados (PR #230 y #231); **sin constancia de primer respaldo restaurable de datos de producción**. Este documento no autoriza migraciones ni despliegues.

## Alcance verificado de la fuente (consulta de solo lectura)

- Supabase APDocentePBA: `vvgkinkvojqwfuqaxijh`, PostgreSQL 17, plan Free.
- Inventario observado el 02/11/2026: 33 tablas de `public`, 50 usuarios de la aplicación, 0 usuarios en `auth.users`, 0 buckets y 0 objetos de Storage.
- Los 33 objetos de tabla de `public` tenían RLS activado. Estos conteos son una **observación puntual** y pueden cambiar.
- `public` contiene datos operativos; NO se asume que un volcado de `public` equivalga a respaldo integral de Supabase. Fuera de alcance: otros esquemas gestionados, objetos físicos de Storage, Cloudflare, secretos, Edge Functions y servicios externos.
- La herramienta aborta si detecta cualquier usuario en `auth.users` o algún bucket/objeto en `storage`. Si esta condición cambia, primero diseñar una copia con alcance ampliado; nunca omitir silenciosamente datos activos.

## Flujo seguro vigente: formato cifrado v3

1. El workflow `.github/workflows/apd-cloud-backup.yml` solo lee producción en ejecución manual `workflow_dispatch`, branch `main`, confirmación literal `RESPALDAR_APDOCENTEPBA`, environment `apd-backup`.
2. Requiere GitHub Secrets `APD_SUPABASE_DB_URL` y `APD_BACKUP_ENCRYPTION_PASSPHRASE` (>= 32 caracteres). El destino PostgreSQL se valida por proyecto, usuario y nombre de base. **Nunca registrar secretos en chat, commits, logs o issues.**
3. El origen se consulta para los tres controles críticos y para **todas las tablas públicas** mediante `scripts/apd_gha_public_inventory.sh`. La lista incluye cada tabla y cantidad de filas, no contenidos personales.
4. Se exportan roles con Supabase CLI y el esquema+dato de `public` en **un solo `pg_dump` PostgreSQL 17**, con instantánea consistente. Antes de aceptar la copia, se reevalúan los conteos y el alcance de Auth/Storage. Si el inventario cambia, el trabajo falla de forma conservadora.
5. Se incluyen `roles.sql`, `app.sql`, `counts.tsv`, `inventory.tsv` y `SHA256SUMS` en un único paquete GPG AES-256. Solo se sube el archivo cifrado `.tar.gpg`. El descifrador puede leer también archivos v1/v2 anteriores, pero las pruebas CI actuales cubren específicamente v2/v3.
6. En un Supabase local descartable con PostgreSQL 17 se descifra, valida SHA-256, aplica el SQL y compara **todas** las tablas y cantidades de `public` con el inventario cifrado. Si la restauración o una comparación falla, no se publica el artifact.
7. El artifact de GitHub caduca a los **30 días**; requiere descarga y almacenamiento externo privado. La frase de cifrado debe conservarse fuera de GitHub. La ejecución local no equivale a una restauración completa de toda la plataforma.

## Evidencia automatizada

- [PR #230](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/230): volcados de una sola instantánea y restauración en PostgreSQL 17.
- [PR #231](https://github.com/apdocentepba-hub/apdocentepba-v2/pull/231): comprobación de todas las tablas, rechazo de datos Auth/Storage fuera de alcance y cifrado v3 compatible con v2.
- Ambos PR tienen pruebas de GitHub Actions aprobadas con datos **ficticios**. Ninguno ejecutó respaldos reales de producción.

## Ejecución manual inicial (pendiente)

1. Abrir [Supabase / Connect](https://supabase.com/dashboard/project/vvgkinkvojqwfuqaxijh) y obtener la URI PostgreSQL del proyecto y su contraseña. No copiarla al chat.
2. Configurar los dos [GitHub Secrets de Actions](https://github.com/apdocentepba-hub/apdocentepba-v2/settings/secrets/actions). Se desconoce desde el conector si ya existen; no se pueden leer ni configurar con las herramientas actualmente disponibles.
3. Ir a [Actions / respaldo cifrado](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/workflows/apd-cloud-backup.yml) y elegir `Run workflow` desde `main`, escribiendo `RESPALDAR_APDOCENTEPBA`. No activar esta ejecución sin credenciales válidas ni fuera del ambiente controlado.
4. Confirmar job `production-backup: success`, resumen de restauración y artifact cifrado disponible. Descargarlo en ubicación privada y conservar la clave de descifrado por separado. Registrar ID del run y fecha. Si falla, no declarar backup operativo.
5. Validar que las tablas, funciones, roles, extensiones y flujos reales que se quieran migrar sean recuperables en un entorno separado. El `pg_dump --schema=public` tiene dependencias externas posibles; los tests con datos ficticios no cubren automáticamente todas las extensiones/roles de producción.
6. **No** activar aún el escáner transaccional en Worker ni aplicar SQL productivo hasta que se verifique el respaldo real restaurable y exista plan de reversión.

## Limitaciones y criterios de aceptación

El conteo idéntico de filas es una prueba de cobertura inicial, no una comparación byte a byte de cada registro. La consistencia temporal del volcado proviene de la instantánea única de `pg_dump`, no de que los conteos coincidan. El export de roles se ejecuta por separado. La copia de `public` no incluye Auth/Storage aunque hoy esos componentes estén vacíos. No hay respaldos diarios automáticos del plan Free; un artifact GitHub con 30 días de retención no reemplaza una política de copias periódicas y almacenamiento externo.

**Estado correcto:** piloto de respaldo y restauración de laboratorio aprobado. **Pendiente:** primer artifact real cifrado, restauración comprobada, retención externa y autorización de migración.

Fuentes: [Guía oficial de backups](https://supabase.com/docs/guides/platform/backups), [Backup/restore Supabase CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).

# APDocentePBA — respaldo remoto por GitHub Actions

**Estado: preparado, pendiente de credenciales seguras y primera ejecución manual.** Fecha: 2026-11-02.

Este procedimiento opera **exclusivamente** sobre Supabase APDocentePBA \`vvgkinkvojqwfuqaxijh\`. Es **de solo lectura** en producción: no hace migraciones, borrados, cron, deploy del Worker, ni modifica preferencias o usuarios.

## Diseño de seguridad
- Workflow: \`.github/workflows/apd-cloud-backup.yml\`. Exportaciones productivas **solo** desde \`main\`, por \`workflow_dispatch\`, y confirmación exacta \`RESPALDAR_APDOCENTEPBA\`.
- Los PR ejecutan **únicamente** pruebas falsas de cifrado y corrupción; no disponen de credenciales ni tocan Supabase.
- El origen se verifica por host + usuario del proyecto APD, evita apuntar a otro proyecto.
- Usa Supabase CLI **2.122.0**, estable, y los comandos oficiales \`db dump\` para roles, esquema y datos. Nunca hace \`db push\`, \`db reset\` o \`apply_migration\`.
- El paquete generado se cifra mediante GnuPG AES-256 y una contraseña larga de GitHub Secrets antes de ser publicado como **único artefacto**. GitHub NO almacena SQL plano en el repositorio ni en sus artifacts.
- Los archivos cifrados incluyen \`roles.sql\`, \`schema.sql\`, \`data.sql\`, \`counts.tsv\`, \`SHA256SUMS\`; verifica suma SHA-256 y que el descifrado sea correcto.
- Restaura en PostgreSQL 17 de un **Supabase local efímero en GitHub runner**; compara cantidades de \`public.users\`, \`public.user_subscriptions\` y \`public.apd_ofertas_global_current\`. Si falla exportación, cifrado, descifrado, restauración o conteos: el trabajo falla y **no sube artifact**.
- Solo conserva un archivo \`.tar.gpg\` cifrado como GitHub Actions artifact, **30 días**. En producción solo lee datos; los SQL temporales existen durante el job en el runner y se eliminan al terminar; GitHub hospedará temporalmente plaintext mientras se ejecuta el job.
- No agrega tareas programadas ni cobros. Mantener la frase de cifrado fuera de chats y del código; preferir un gestor de contraseñas y una copia de recuperación segura. **Sin esa clave el artifact no puede restaurarse.**

## Qué cubre y qué NO
El comando oficial \`supabase db dump\` excluye por diseño esquemas gestionados por Supabase (incluidos \`auth\`, \`storage\` y algunos de extensiones), aun solicitando esquema + datos. Por tanto, esta herramienta respalda los objetos/datos gestionados por **la aplicación**, no equivale por sí misma a una copia física integral del servicio Supabase. No descarga archivos reales de Supabase Storage, Edge Functions, KV, secretos de Cloudflare ni contraseñas externas. La prueba de restauración es **de datos de la aplicación en Postgres local**, no de producción ni de una instancia idéntica en la nube.

**La migración del histórico queda pendiente hasta evaluar si el alcance de esta restauración cubre los datos en riesgo.** El punto de control anterior en Google Drive es complementario, no es un backup recuperable.

## Única configuración externa necesaria (nunca compartir por chat)

1. En [Supabase / Proyecto APDocentePBA / Connect](https://supabase.com/dashboard/project/vvgkinkvojqwfuqaxijh), obtener la **URI de conexión PostgreSQL** correspondiente al proyecto (directa o session pooler; usuario \`postgres\` o \`postgres.vvgkinkvojqwfuqaxijh\`).
2. En [GitHub / Secrets de Actions](https://github.com/apdocentepba-hub/apdocentepba-v2/settings/secrets/actions) crear **repository secrets**:
   - \`APD_SUPABASE_DB_URL\` — URI completa con contraseña de DB. Nunca pegarla en chat, logs, commits o issues.
   - \`APD_BACKUP_ENCRYPTION_PASSPHRASE\` — frase aleatoria de **al menos 32 caracteres**, guardada también fuera de GitHub en un lugar seguro.
3. En [GitHub / Actions / APDocentePBA — respaldo cifrado](https://github.com/apdocentepba-hub/apdocentepba-v2/actions/workflows/apd-cloud-backup.yml), ejecutar **Run workflow**, branch \`main\`, confirmación \`RESPALDAR_APDOCENTEPBA\`. No iniciar si falta alguno de los secretos.
4. Verificar que \`production-backup\` termine **success** y el artifact se haya cargado. Descargar y guardar el \`.tar.gpg\` en un medio privado y duradero antes de que GitHub lo borre tras 30 días. **GitHub Actions no sustituye una política de retención externa.**
5. Si se necesita recuperar: descargar el artifact autorizado de GitHub, extraer el \`.tar.gpg\`, descifrar con la frase guardada, comprobar \`SHA256SUMS\`, restaurar SOLO en una base aislada y seguir el procedimiento controlado de restauración de Supabase. Nunca hacer esto directamente sobre producción sin evaluación y autorización.

No hay herramientas GitHub conectadas en ChatGPT para crear/leer estos Secrets, ni se conocen las contraseñas de producción mediante el conector Supabase. El conector permite leer SQL y aplicar migraciones, **pero no revela la contraseña de conexión**. No se deben inventar las credenciales ni pedir que el usuario las pegue en el chat.

## Criterios para declarar cierre
- CI simulado del PR verde, sin secretos.
- Trabajo manual productivo ejecutado efectivamente con Secrets disponibles.
- GPG, SHA-256, restore local y conteos iguales verificados en logs seguros.
- Artifact cifrado disponible y recuperable dentro de plazo de retención.
- Confirmación de cobertura suficiente para la migración del histórico, considerando los objetos de \`auth\`/\`storage\` excluidos.
- Solo entonces considerar la **migración** previamente autorizada. **No activar capturas ni publicar Worker automáticamente.**

Fuentes: [Supabase GitHub Actions Backups](https://supabase.com/docs/guides/deployment/ci/backups), [Supabase CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump), [Backups Supabase Free](https://supabase.com/docs/guides/platform/backups), [GitHub artifact retention](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

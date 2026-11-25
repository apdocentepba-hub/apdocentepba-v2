# Mis postulaciones — cierre QA y activación separada
Fecha: 2026-11-24 (Argentina). PR #330. Candidato probado: 7788433b01424c337aab9f844fb0def5083eb8fc.

## Evidencia
- Laboratorio con código activo, PostgreSQL descartable y Chromium: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/45518017466
- Worker temporal alojado: https://github.com/apdocentepba-hub/apdocentepba-v2/actions/runs/45521208676
- Resultado: APD_DIARY_TEMPORARY_HOSTED_PASS, APD_DIARY_TEMPORARY_FIXTURE_CLEAN_PASS, APD_DIARY_TEMPORARY_LOCAL_CLEANUP_DONE.
- El primer intento de lectura fue 404 de propagación del edge; después el guard devolvió 404 y la aplicación 401, según lo esperado.
- El entorno alojado utilizó PostgREST/PostgreSQL descartable, no el Supabase productivo. No acredita todavía escrituras reales en producción. La cuenta temporal no se reclamó; la eliminación remota final no se verificó.

## Inspección productiva de solo lectura
El proyecto con la tabla de diario ya tiene public.user_application_diary con PK user_id, FK a users con ON DELETE CASCADE, entries jsonb con validador apd_valid_application_diary, revision bigint acotada y updated_at timestamptz. RLS activa sin políticas; anon y authenticated sin SELECT/INSERT/UPDATE/DELETE; service_role con SELECT/INSERT/UPDATE y sin DELETE. No existe apd_application_diary_cas en ese proyecto. El código activo probado utiliza REST directo de la tabla, no esa RPC. No aplicar la migración candidata de laboratorio: crearía una tabla existente y su contrato difiere. No cambiar el esquema ni permisos como parte de la activación del diario.

## Límites de publicación
PR #330 también incorpora perfil de carrera, catálogo escolar y otras modificaciones. No fusionar todo automáticamente. El perfil de carrera debe conservar accountCareerReleaseEnabled=false. El diario conserva accountDiaryReleaseEnabled=false hasta autorización explícita. Aislar/revisar el diff exacto contra main, asegurar compatibilidad de imports, validar con Chromium incluyendo carrusel vacío y preservar las funciones ya publicadas. El rollback del diario deshabilita su flag y revierte la publicación frontend, sin borrar registros ni restaurar destructivamente PostgreSQL. No desplegar un Worker adicional si la ruta activa permanece compatible.

## Criterio final
Tras aprobación explícita del usuario: verificar versión activa y disponibilidad de una cuenta autorizada de ensayo; activar exclusivamente el diario; comprobar en web pública guardado, nueva sesión, aislamiento y limpieza de datos de ensayo, sin tocar cuentas ajenas. Si falla, desactivar el flag y revertir frontend. No declarar producción aprobada antes de esta evidencia. No se autorizan gastos, cambios del perfil de carrera ni Nexo IA Local.

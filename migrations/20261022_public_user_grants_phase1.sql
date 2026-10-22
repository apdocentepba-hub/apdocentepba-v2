-- APDocente / 2026-10-22
-- ETAPA 1 de seguridad: cambio YA APLICADO en Supabase de producción el 22/10/2026.
-- Este archivo registra el estado deseado para reproducciones/infraestructura.
-- NO es la migración definitiva de RLS: el frontend sigue leyendo
-- public.users y public.user_preferences directamente desde app_v2.js.
-- Repetir los REVOKE/GRANT es idempotente. No ejecutarlo como sustituto
-- de las pruebas de etapa 2.
BEGIN;

-- Los cambios de perfil, registro y preferencias deben transitar el Worker
-- autenticado con credencial de servidor, no la API pública.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.users, public.user_preferences
  FROM anon, authenticated;

-- Proteger la columna de contraseñas: el cliente actual sólo pide
-- id,nombre,apellido,email,celular,activo,ultimo_login.
REVOKE SELECT ON TABLE public.users FROM anon, authenticated;
GRANT SELECT (id, nombre, apellido, email, celular, activo, ultimo_login)
  ON TABLE public.users TO anon, authenticated;

DO $verification$
BEGIN
  IF has_column_privilege('anon', 'public.users', 'password_hash', 'SELECT')
     OR has_column_privilege('authenticated', 'public.users', 'password_hash', 'SELECT') THEN
    RAISE EXCEPTION 'Protección de contraseñas falló; se revierte la transacción';
  END IF;
  IF has_table_privilege('anon','public.users','UPDATE')
     OR has_table_privilege('authenticated','public.users','INSERT')
     OR has_table_privilege('anon','public.user_preferences','UPDATE')
     OR has_table_privilege('authenticated','public.user_preferences','DELETE') THEN
    RAISE EXCEPTION 'Permisos públicos de escritura siguen presentes';
  END IF;
  IF NOT has_column_privilege('anon','public.users','email','SELECT')
     OR NOT has_column_privilege('anon','public.users','id','SELECT') THEN
    RAISE EXCEPTION 'El panel perdió las columnas de perfil requeridas';
  END IF;
  IF NOT has_table_privilege('service_role','public.users','SELECT')
     OR NOT has_table_privilege('service_role','public.users','UPDATE')
     OR NOT has_table_privilege('service_role','public.user_preferences','UPDATE') THEN
    RAISE EXCEPTION 'El backend perdió permisos requeridos';
  END IF;
END $verification$;

COMMIT;

-- ETAPA 2: NO ejecutar aún.
-- 1) Endpoint autenticado Worker para obtener las preferencias DEL usuario
--    derivado de sesión de servidor; jamás confiar en user_id del cliente.
-- 2) Cambiar app_v2.js para evitar lecturas públicas de users y preferencias.
-- 3) Pruebas de login (password/Google), perfil, preferencias, sesiones,
--    panel, notificaciones y accesos admin.
-- 4) En una migración posterior: REVOKE SELECT... FROM anon,authenticated,
--    ALTER TABLE ... ENABLE ROW LEVEL SECURITY, sin políticas públicas.
--    El Worker usa service_role (bypassrls), exclusivamente server-side.

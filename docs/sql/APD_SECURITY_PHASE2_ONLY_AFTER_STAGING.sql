-- ETAPA 2 / APDocente: PRIVACIDAD COMPLETA, AUN NO APLICAR.
-- Archivo de preparación manual. NO es una migración activada automáticamente.
-- Preservar la fase 1 hasta verificar Worker y frontend actualizados, cachés,
-- autenticación contraseña/Google, panel, preferencias y alertas reales.
--
-- Ejecutar en una sesión administrativa solamente cuando la persona responsable
-- haya verificado el despliegue y habilite deliberadamente la bandera:
-- SET apd.auth_dashboard_rollout_verified = 'approved';
-- ATENCION: la bandera es una barrera contra ejecución accidental,
-- NO sustituye la validación técnica y operativa.
BEGIN;

DO $guard$
BEGIN
  IF current_setting('apd.auth_dashboard_rollout_verified', true)
     IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'ETAPA 2 BLOQUEADA: Worker y frontend no verificados';
  END IF;
END
$guard$;

-- El backend con service_role conservará el acceso de servidor.
-- El navegador jamás debería consultar filas de usuarios/preferencias.
REVOKE SELECT ON TABLE public.users, public.user_preferences FROM anon, authenticated;
REVOKE SELECT (id,nombre,apellido,email,celular,activo,ultimo_login)
  ON TABLE public.users FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.users, public.user_preferences FROM anon, authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Sin políticas públicas: acceso exclusivo desde backend confiable.
DO $verify$
BEGIN
  IF has_column_privilege('anon','public.users','id','SELECT')
    OR has_column_privilege('authenticated','public.users','email','SELECT')
    OR has_column_privilege('anon','public.users','password_hash','SELECT')
    OR has_column_privilege('anon','public.user_preferences','user_id','SELECT')
    OR has_table_privilege('authenticated','public.user_preferences','SELECT') THEN
    RAISE EXCEPTION 'Privilegios públicos de lectura siguen presentes; revertir';
  END IF;
  IF NOT has_table_privilege('service_role','public.users','SELECT')
    OR NOT has_table_privilege('service_role','public.users','UPDATE')
    OR NOT has_table_privilege('service_role','public.user_preferences','SELECT')
    OR NOT has_table_privilege('service_role','public.user_preferences','UPDATE') THEN
    RAISE EXCEPTION 'El backend perdió privilegios; revertir';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='users' AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='user_preferences' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS no activada en ambas tablas; revertir';
  END IF;
END
$verify$;

COMMIT;

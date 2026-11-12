-- CANDIDATO, NO EJECUTAR SIN APROBACION DEL CAMBIO DE ESQUEMA.
-- Domicilio personal de referencia, separado de las jornadas (efimeras).
-- La unica ruta de usuario sera un Worker con sesion Bearer validada.
BEGIN;
CREATE TABLE IF NOT EXISTS public.user_home_reference (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  address_text text NOT NULL CHECK (
    char_length(trim(address_text)) BETWEEN 5 AND 180
    AND address_text !~ '[<>]'
  ),
  georef jsonb NULL CHECK (georef IS NULL OR jsonb_typeof(georef) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_home_reference ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_home_reference FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_home_reference TO service_role;
-- No public RLS policies. Only the trusted Worker may act for an authenticated
-- session; neither anon nor authenticated may call the REST table directly.
COMMIT;
-- ROLLBACK MANUAL SOLO SI NO EXISTEN DATOS LEGITIMOS:
-- DROP TABLE public.user_home_reference;

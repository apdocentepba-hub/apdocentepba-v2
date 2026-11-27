\set ON_ERROR_STOP on
-- Isolated fixture table, no live Supabase.
CREATE TABLE public.sessions(token text NOT NULL,user_id uuid NOT NULL,activo boolean NOT NULL);
GRANT SELECT,UPDATE ON public.sessions TO service_role;
\ir ../sql/apd_mobile_logout_session_lab_20261126.sql
INSERT INTO public.sessions VALUES
(repeat('a',64),'11111111-1111-4111-8111-111111111111',true),
(repeat('b',64),'11111111-1111-4111-8111-111111111111',true),
(repeat('c',64),'22222222-2222-4222-8222-222222222222',true),
(repeat('d',64),'22222222-2222-4222-8222-222222222222',true),
(repeat('d',64),'11111111-1111-4111-8111-111111111111',true);
SET ROLE service_role;
DO $test$ BEGIN
 IF public.apd_mobile_logout_session_lab('11111111-1111-4111-8111-111111111111') THEN RAISE EXCEPTION 'UUID accepted'; END IF;
 IF public.apd_mobile_logout_session_lab(repeat('e',64)) THEN RAISE EXCEPTION 'unknown token'; END IF;
 IF public.apd_mobile_logout_session_lab(repeat('d',64)) THEN RAISE EXCEPTION 'ambiguous token'; END IF;
 IF NOT public.apd_mobile_logout_session_lab(repeat('a',64)) THEN RAISE EXCEPTION 'revoke failed'; END IF;
 IF NOT public.apd_mobile_logout_session_lab(repeat('a',64)) THEN RAISE EXCEPTION 'idempotent revoke failed'; END IF;
 IF (SELECT count(*) FROM public.sessions WHERE activo=false)<>1 OR (SELECT activo FROM public.sessions WHERE token=repeat('a',64)) THEN RAISE EXCEPTION 'revoked wrong session'; END IF;
END $test$;
RESET ROLE;
DO $audit$ BEGIN
 IF has_function_privilege('anon','public.apd_mobile_logout_session_lab(text)','EXECUTE') OR has_function_privilege('authenticated','public.apd_mobile_logout_session_lab(text)','EXECUTE') THEN RAISE EXCEPTION 'public revocation'; END IF;
END $audit$;
SELECT 'APD_MOBILE_LOGOUT_SESSION_PG17_PASS' AS result;

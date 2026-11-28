\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.sessions(token text PRIMARY KEY,user_id uuid NOT NULL,metodo text NOT NULL,created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,activo boolean NOT NULL);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE ON public.sessions TO service_role;
INSERT INTO public.sessions VALUES
('expired-1',gen_random_uuid(),'password',now()-interval '40 days',now()-interval '10 days',true),
('expired-2',gen_random_uuid(),'password',now()-interval '32 days',now()-interval '2 days',true),
('valid',gen_random_uuid(),'password',now(),now()+interval '30 days',true),
('inactive',gen_random_uuid(),'password',now()-interval '50 days',now()-interval '20 days',false),
('invalid',gen_random_uuid(),'password',now(),'infinity',true);
CREATE TEMP TABLE original AS SELECT * FROM public.sessions;
\ir ../../docs/sql/APD_SESSION_EXPIRY_CANDIDATE_20261127.sql
SET ROLE service_role;
DO $test$
BEGIN
 IF public.apd_expire_sessions_batch(1)<>1 THEN RAISE EXCEPTION 'batch limit not respected'; END IF;
 IF public.apd_expire_sessions_batch(100)<>1 THEN RAISE EXCEPTION 'remaining expired row not updated'; END IF;
 IF public.apd_expire_sessions_batch(100)<>0 THEN RAISE EXCEPTION 'not idempotent'; END IF;
 BEGIN
  PERFORM public.apd_expire_sessions_batch(101);
  RAISE EXCEPTION 'invalid limit accepted' USING ERRCODE='P0002';
 EXCEPTION WHEN raise_exception THEN NULL;
 END;
END $test$;
RESET ROLE;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.sessions)<>5 THEN RAISE EXCEPTION 'rows deleted'; END IF;
 IF EXISTS(SELECT 1 FROM public.sessions WHERE token IN ('expired-1','expired-2') AND activo) THEN RAISE EXCEPTION 'expired session left active'; END IF;
 IF EXISTS(SELECT * FROM original WHERE token NOT IN ('expired-1','expired-2') EXCEPT SELECT * FROM public.sessions) THEN RAISE EXCEPTION 'unrelated session changed'; END IF;
 IF EXISTS(SELECT token,user_id,metodo,created_at,expires_at FROM original EXCEPT SELECT token,user_id,metodo,created_at,expires_at FROM public.sessions) THEN RAISE EXCEPTION 'session metadata changed'; END IF;
 IF has_function_privilege('anon','public.apd_expire_sessions_batch(integer)','EXECUTE') OR has_function_privilege('authenticated','public.apd_expire_sessions_batch(integer)','EXECUTE') THEN RAISE EXCEPTION 'client execution possible'; END IF;
END $verify$;
SELECT 'APD_SESSION_EXPIRY_PG17_PASS' AS result;

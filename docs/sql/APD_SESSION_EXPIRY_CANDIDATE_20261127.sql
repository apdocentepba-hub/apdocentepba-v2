-- Candidate only: bounded expiration maintenance, never delete session history.
BEGIN;
CREATE FUNCTION public.apd_expire_sessions_batch(p_limit integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE v_now timestamptz:=clock_timestamp(); v_count integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'invalid batch limit'; END IF;
 WITH picked AS (
  SELECT token FROM public.sessions
  WHERE activo IS TRUE AND isfinite(expires_at) AND expires_at<=v_now
  ORDER BY expires_at,token LIMIT p_limit FOR UPDATE SKIP LOCKED
 ), changed AS (
  UPDATE public.sessions s SET activo=false FROM picked p
  WHERE s.token=p.token AND s.activo IS TRUE AND isfinite(s.expires_at) AND s.expires_at<=v_now
  RETURNING 1
 ) SELECT count(*)::integer INTO v_count FROM changed;
 RETURN v_count;
END $fn$;
REVOKE ALL ON FUNCTION public.apd_expire_sessions_batch(integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_expire_sessions_batch(integer) TO service_role;
COMMIT;

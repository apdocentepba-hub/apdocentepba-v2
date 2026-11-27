-- LAB ONLY. Existing deployed Worker resolves public.sessions.token and activo.
-- Confirm actual schema and unique token constraint before deployment.
BEGIN;
CREATE OR REPLACE FUNCTION public.apd_mobile_logout_session_lab(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer; v_active boolean;
BEGIN
 IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
 -- Lock matching sessions; refuse ambiguity and never touch any other token.
 SELECT count(*),bool_or(s.activo) INTO n,v_active
 FROM (SELECT activo FROM public.sessions WHERE token=p_token FOR UPDATE) s;
 IF n<>1 OR v_active IS NULL THEN RETURN false; END IF;
 IF NOT v_active THEN RETURN true; END IF;
 UPDATE public.sessions SET activo=false WHERE token=p_token AND activo=true;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'session revocation conflict'; END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.apd_mobile_logout_session_lab(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_logout_session_lab(text) TO service_role;
COMMIT;

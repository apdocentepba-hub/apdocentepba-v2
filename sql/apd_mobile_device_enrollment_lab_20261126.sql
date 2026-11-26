-- Laboratory only; execute AFTER existing mobile private storage schema.
BEGIN;
CREATE OR REPLACE FUNCTION public.apd_mobile_register_device_lab(
 p_user uuid,p_device uuid,p_platform text,p_transport text,p_hash text,p_ciphertext text
) RETURNS TABLE(id uuid,platform text,transport text,enabled boolean,opted_in boolean)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_user IS NULL OR p_device IS NULL OR p_platform NOT IN ('android','ios')
 OR p_transport IS DISTINCT FROM 'expo' OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
 OR p_ciphertext IS NULL OR length(p_ciphertext) NOT BETWEEN 48 AND 4096
 OR p_ciphertext !~ '^[A-Za-z0-9_-]+$' THEN
  RAISE EXCEPTION 'invalid registration' USING ERRCODE='22023';
 END IF;
 -- Serialize account device cap and changes. Never transfer device ownership.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,218));
 IF (SELECT count(*) FROM public.apd_mobile_push_devices d WHERE d.user_id=p_user AND d.enabled AND d.id<>p_device)>=10 THEN
  RETURN;
 END IF;
 RETURN QUERY INSERT INTO public.apd_mobile_push_devices AS d
 (id,user_id,platform,transport,token_hash,token_ciphertext,enabled,opted_in)
 VALUES(p_device,p_user,p_platform,p_transport,p_hash,p_ciphertext,true,true)
 ON CONFLICT ON CONSTRAINT apd_mobile_push_devices_pkey DO UPDATE SET
  token_hash=EXCLUDED.token_hash,token_ciphertext=EXCLUDED.token_ciphertext,
  enabled=true,opted_in=true,revoked_at=NULL,updated_at=clock_timestamp()
 WHERE d.user_id=p_user AND d.platform=p_platform AND d.transport=p_transport
  AND (NOT d.enabled OR d.token_hash=p_hash)
 RETURNING d.id,d.platform,d.transport,d.enabled,d.opted_in;
EXCEPTION WHEN unique_violation THEN RETURN;
END;$$;
CREATE OR REPLACE FUNCTION public.apd_mobile_revoke_device_lab(p_user uuid,p_device uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF p_user IS NULL OR p_device IS NULL THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,218));
 UPDATE public.apd_mobile_push_devices d SET enabled=false,opted_in=false,
 revoked_at=coalesce(d.revoked_at,clock_timestamp()),updated_at=clock_timestamp()
 WHERE d.id=p_device AND d.user_id=p_user;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END;$$;
REVOKE ALL ON FUNCTION public.apd_mobile_register_device_lab(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.apd_mobile_revoke_device_lab(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_register_device_lab(uuid,uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_revoke_device_lab(uuid,uuid) TO service_role;
COMMIT;

-- Disposable PostgreSQL candidate only. Apply after dispatch authorization.
BEGIN;
ALTER TABLE public.apd_mobile_dispatch_authorizations
 ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
 ADD COLUMN IF NOT EXISTS recipient_token_hash text;
ALTER TABLE public.apd_mobile_dispatch_authorizations
 ADD CONSTRAINT apd_mobile_consumed_recipient_coherent CHECK (
 (consumed_at IS NULL AND recipient_token_hash IS NULL) OR
 (consumed_at IS NOT NULL AND recipient_token_hash IS NOT NULL AND recipient_token_hash ~ '^[0-9a-f]{64}$'));
-- A single durable consumption, bound to the current token digest.
-- Same lock order as revocation: device, outbox, authorization.
CREATE OR REPLACE FUNCTION public.apd_mobile_consume_dispatch_lab(
 p_event_key text,p_dispatch_id uuid,p_token_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_device uuid; v_count integer;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
 OR p_dispatch_id IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
 THEN RETURN false; END IF;
 SELECT d.id INTO v_device FROM public.apd_mobile_push_devices d
 JOIN public.apd_mobile_push_outbox o ON o.device_id=d.id AND o.user_id=d.user_id
 JOIN public.users u ON u.id=o.user_id
 WHERE o.event_key=p_event_key AND d.platform='android' AND d.transport='expo'
 AND d.enabled AND d.opted_in AND d.revoked_at IS NULL AND u.activo
 AND d.token_hash=p_token_hash FOR UPDATE OF d;
 IF v_device IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.apd_mobile_push_outbox o WHERE o.event_key=p_event_key
 AND o.device_id=v_device AND o.status='dispatching'
 AND o.leased_until>clock_timestamp() AND o.offer_expires_at>clock_timestamp()+interval '5 seconds'
 FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE public.apd_mobile_dispatch_authorizations a
 SET consumed_at=clock_timestamp(),recipient_token_hash=p_token_hash
 WHERE a.event_key=p_event_key AND a.dispatch_id=p_dispatch_id
 AND a.state='prepared' AND a.consumed_at IS NULL
 AND a.authorized_at>clock_timestamp()-interval '60 seconds';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END; $$;
REVOKE ALL ON FUNCTION public.apd_mobile_consume_dispatch_lab(text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_consume_dispatch_lab(text,uuid,text) TO service_role;
COMMIT;

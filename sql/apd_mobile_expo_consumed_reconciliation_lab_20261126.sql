-- Disposable lab only; after receipt retention and durable consumption.
BEGIN;
CREATE OR REPLACE FUNCTION public.apd_mobile_quarantine_stale_dispatch(
 p_limit integer DEFAULT 20
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_row record;v_total integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
  RAISE EXCEPTION 'invalid quarantine bounds';
 END IF;
 FOR v_row IN
  SELECT o.event_key FROM public.apd_mobile_push_outbox o
  JOIN public.apd_mobile_dispatch_authorizations a
    ON a.event_key=o.event_key
  WHERE o.status='dispatching' AND a.state='prepared'
    AND a.authorized_at<clock_timestamp()-interval '2 minutes'
    AND NOT EXISTS (SELECT 1 FROM public.apd_mobile_expo_receipt_correlation r
      WHERE r.event_key=o.event_key AND r.tracking_state='awaiting_receipt')
  ORDER BY a.authorized_at
  LIMIT p_limit FOR UPDATE OF o SKIP LOCKED
 LOOP
  -- Recheck under the outbox lock after a concurrent ticket insert.
  IF EXISTS (SELECT 1 FROM public.apd_mobile_expo_receipt_correlation r
    WHERE r.event_key=v_row.event_key AND r.tracking_state='awaiting_receipt') THEN CONTINUE; END IF;
  UPDATE public.apd_mobile_push_outbox
  SET status='uncertain',lease_id=NULL,leased_until=NULL,
      updated_at=clock_timestamp()
  WHERE event_key=v_row.event_key AND status='dispatching';
  UPDATE public.apd_mobile_dispatch_authorizations
  SET state='uncertain',resolved_at=clock_timestamp()
  WHERE event_key=v_row.event_key AND state='prepared';
  v_total=v_total+1;
 END LOOP;
 RETURN v_total;
END; $$;


-- Atomically store the provider observation and resolve the authorization.
-- A receipt accepted by FCM is not confirmation of physical device delivery.
CREATE OR REPLACE FUNCTION public.apd_mobile_expo_settle_consumed_receipt_lab(
 p_event_key text,p_dispatch_id uuid,p_ticket_id text,p_outcome text
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_status text; v_state text; v_consumed timestamptz; v_recorded timestamptz; v_result text;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$' OR p_dispatch_id IS NULL
 OR p_ticket_id IS NULL OR p_ticket_id !~ '^[A-Za-z0-9_-]{8,200}$'
 OR p_outcome IS NULL OR p_outcome NOT IN ('pending','provider_accepted','provider_rejected','invalid_device','uncertain')
 THEN RETURN false; END IF;
 SELECT status INTO v_status FROM public.apd_mobile_push_outbox WHERE event_key=p_event_key FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT state,consumed_at INTO v_state,v_consumed FROM public.apd_mobile_dispatch_authorizations
 WHERE event_key=p_event_key AND dispatch_id=p_dispatch_id FOR UPDATE;
 IF NOT FOUND OR v_consumed IS NULL THEN RETURN false; END IF;
 SELECT ticket_recorded_at INTO v_recorded FROM public.apd_mobile_expo_receipt_correlation
 WHERE event_key=p_event_key AND dispatch_id=p_dispatch_id AND ticket_id=p_ticket_id
 AND tracking_state='awaiting_receipt' AND receipt_outcome IS NULL FOR UPDATE;
 IF NOT FOUND OR v_recorded<=clock_timestamp()-interval '24 hours' THEN RETURN false; END IF;
 IF NOT public.apd_mobile_expo_record_receipt(p_event_key,p_dispatch_id,p_ticket_id,p_outcome) THEN RETURN false; END IF;
 IF p_outcome='pending' OR v_status<>'dispatching' OR v_state<>'prepared' THEN RETURN true; END IF;
 v_result:=CASE p_outcome WHEN 'provider_accepted' THEN 'accepted'
 WHEN 'provider_rejected' THEN 'rejected' WHEN 'invalid_device' THEN 'rejected' ELSE 'uncertain' END;
 IF NOT public.apd_mobile_resolve_dispatch(p_event_key,p_dispatch_id,v_result)
 THEN RAISE EXCEPTION 'atomic receipt resolution conflict'; END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.apd_mobile_expo_settle_consumed_receipt_lab(text,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_expo_settle_consumed_receipt_lab(text,uuid,text,text) TO service_role;
COMMIT;

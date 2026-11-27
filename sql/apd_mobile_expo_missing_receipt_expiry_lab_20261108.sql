-- APD mobile: expiry/reconciliation of unreturned Expo receipts.
-- LAB ONLY. Applies AFTER apd_mobile_expo_receipt_correlation_lab_20261108.sql.
-- No provider request, no automatic resend, no delivery claim.
-- Expo normally removes receipts at 24h; expired results remain uncertain.
BEGIN;

ALTER TABLE public.apd_mobile_expo_receipt_correlation
 ADD COLUMN late_observed_outcome text CHECK (
  late_observed_outcome IN ('provider_accepted','provider_rejected',
    'invalid_device','uncertain')),
 ADD COLUMN late_observed_at timestamptz,
 ADD CONSTRAINT apd_expo_late_observation_pair CHECK (
  (late_observed_outcome IS NULL AND late_observed_at IS NULL)
  OR (late_observed_outcome IS NOT NULL AND late_observed_at IS NOT NULL));

-- Expire a bounded queue batch, claiming outbox rows with SKIP LOCKED.
-- Lock order: outbox -> authorization -> receipt (consistent with RPCs).
-- The prepared authorization and leased outbox are quarantined together.
-- If revocation/quarantine already happened, update receipt audit only.
CREATE OR REPLACE FUNCTION public.apd_mobile_expo_expire_missing_receipts(
 p_limit integer DEFAULT 20
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_row record;v_state text;v_status text;v_timestamp timestamptz;
        v_count integer;v_total integer:=0;v_active boolean;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>20
 THEN RAISE EXCEPTION 'invalid expo expiry bounds'; END IF;

 FOR v_row IN
  SELECT o.event_key,a.dispatch_id
  FROM public.apd_mobile_expo_receipt_correlation r
  JOIN public.apd_mobile_dispatch_authorizations a
   ON a.event_key=r.event_key AND a.dispatch_id=r.dispatch_id
  JOIN public.apd_mobile_push_outbox o ON o.event_key=a.event_key
  WHERE r.tracking_state='awaiting_receipt'
   AND r.receipt_outcome IS NULL
   AND r.ticket_recorded_at < clock_timestamp()-interval '24 hours'
  ORDER BY r.ticket_recorded_at,r.event_key
  LIMIT p_limit FOR UPDATE OF o SKIP LOCKED
 LOOP
  -- The outbox row has been locked by the queue selector.
  SELECT o.status INTO v_status
  FROM public.apd_mobile_push_outbox o
  WHERE o.event_key=v_row.event_key;
  SELECT a.state INTO v_state
  FROM public.apd_mobile_dispatch_authorizations a
  WHERE a.event_key=v_row.event_key AND a.dispatch_id=v_row.dispatch_id
  FOR UPDATE;
  SELECT r.ticket_recorded_at INTO v_timestamp
  FROM public.apd_mobile_expo_receipt_correlation r
  WHERE r.event_key=v_row.event_key AND r.dispatch_id=v_row.dispatch_id
   AND r.tracking_state='awaiting_receipt' AND r.receipt_outcome IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_timestamp IS NULL
    OR v_timestamp>=clock_timestamp()-interval '24 hours'
  THEN CONTINUE; END IF;
  v_active=(v_status='dispatching' AND v_state='prepared');
  IF v_active THEN
   UPDATE public.apd_mobile_push_outbox
   SET status='uncertain',lease_id=NULL,leased_until=NULL,
       updated_at=clock_timestamp()
   WHERE event_key=v_row.event_key AND status='dispatching';
   GET DIAGNOSTICS v_count=ROW_COUNT;
   IF v_count<>1 THEN RAISE EXCEPTION 'expo expiry outbox conflict'; END IF;
   UPDATE public.apd_mobile_dispatch_authorizations
   SET state='uncertain',resolved_at=clock_timestamp()
   WHERE event_key=v_row.event_key AND dispatch_id=v_row.dispatch_id
    AND state='prepared';
   GET DIAGNOSTICS v_count=ROW_COUNT;
   IF v_count<>1 THEN RAISE EXCEPTION 'expo expiry auth conflict'; END IF;
  END IF;
  UPDATE public.apd_mobile_expo_receipt_correlation
  SET receipt_outcome='uncertain',
      tracking_state=CASE WHEN v_active THEN 'uncertain' ELSE 'late_audit' END,
      late_receipt_audit_only=NOT v_active,
      receipt_checked_at=clock_timestamp()
  WHERE event_key=v_row.event_key AND dispatch_id=v_row.dispatch_id
    AND receipt_outcome IS NULL AND tracking_state='awaiting_receipt';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'expo expiry receipt conflict'; END IF;
  v_total=v_total+1;
 END LOOP;
 RETURN v_total;
END; $$;

-- A post-expiry provider observation is retained separately. It NEVER
-- overwrites the unknown-at-expiry outcome or reopens the outbox. This RPC
-- only accepts parsed observations from a future trusted server adapter.
CREATE OR REPLACE FUNCTION public.apd_mobile_expo_record_late_observation(
 p_event_key text,p_dispatch_id uuid,p_ticket_id text,p_outcome text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_status text;v_state text;v_count integer;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
 OR p_dispatch_id IS NULL OR p_ticket_id IS NULL
 OR p_ticket_id !~ '^[A-Za-z0-9_-]{8,200}$'
 OR p_outcome IS NULL OR p_outcome NOT IN (
  'provider_accepted','provider_rejected','invalid_device','uncertain')
 THEN RETURN false; END IF;
 SELECT status INTO v_status FROM public.apd_mobile_push_outbox
 WHERE event_key=p_event_key FOR UPDATE;
 IF v_status IS NULL OR v_status='dispatching' THEN RETURN false; END IF;
 SELECT state INTO v_state FROM public.apd_mobile_dispatch_authorizations
 WHERE event_key=p_event_key AND dispatch_id=p_dispatch_id FOR UPDATE;
 IF v_state NOT IN ('uncertain','revoked','accepted','rejected') OR
    v_state IS NULL THEN RETURN false; END IF;
 UPDATE public.apd_mobile_expo_receipt_correlation
 SET late_observed_outcome=p_outcome,late_observed_at=clock_timestamp(),
     late_receipt_audit_only=true
 WHERE event_key=p_event_key AND dispatch_id=p_dispatch_id
  AND ticket_id=p_ticket_id AND receipt_outcome='uncertain'
  AND tracking_state IN ('uncertain','late_audit')
  AND late_observed_outcome IS NULL;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END; $$;

REVOKE ALL ON FUNCTION public.apd_mobile_expo_expire_missing_receipts(integer)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apd_mobile_expo_record_late_observation(text,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_mobile_expo_expire_missing_receipts(integer)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_expo_record_late_observation(text,uuid,text,text)
 TO service_role;
COMMIT;

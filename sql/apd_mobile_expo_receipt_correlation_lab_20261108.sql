-- APD Mobile: Expo ticket -> receipt persistent correlation, DISPOSABLE LAB ONLY.
-- Apply after apd_mobile_dispatch_authorization_lab_20261108.sql.
-- No provider HTTP, user tokens, receipts containing PII, cron or delivery claims.
BEGIN;
ALTER TABLE public.apd_mobile_dispatch_authorizations
 ADD CONSTRAINT apd_mobile_dispatch_event_id_unique
 UNIQUE (event_key,dispatch_id);
CREATE TABLE public.apd_mobile_expo_receipt_correlation (
 event_key text NOT NULL,
 dispatch_id uuid NOT NULL,
 ticket_id text NOT NULL UNIQUE CHECK (
  ticket_id ~ '^[A-Za-z0-9_-]{8,200}$'),
 tracking_state text NOT NULL DEFAULT 'awaiting_receipt' CHECK (
  tracking_state IN ('awaiting_receipt','provider_accepted',
    'provider_rejected','invalid_device','uncertain','late_audit')),
 receipt_outcome text CHECK (
  receipt_outcome IN ('provider_accepted','provider_rejected',
    'invalid_device','uncertain')),
 ticket_recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 receipt_checked_at timestamptz,
 late_receipt_audit_only boolean NOT NULL DEFAULT false,
 PRIMARY KEY(event_key,dispatch_id),
 FOREIGN KEY(event_key,dispatch_id)
  REFERENCES public.apd_mobile_dispatch_authorizations(event_key,dispatch_id)
  ON DELETE CASCADE,
 CONSTRAINT apd_mobile_expo_receipt_coherent CHECK (
  (receipt_outcome IS NULL AND tracking_state='awaiting_receipt')
  OR (receipt_outcome IS NOT NULL AND tracking_state<>'awaiting_receipt'))
);
CREATE INDEX apd_mobile_expo_pending_lab
 ON public.apd_mobile_expo_receipt_correlation(ticket_recorded_at)
 WHERE tracking_state='awaiting_receipt';
ALTER TABLE public.apd_mobile_expo_receipt_correlation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_expo_receipt_correlation FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_mobile_expo_receipt_correlation
 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE
 ON public.apd_mobile_expo_receipt_correlation TO service_role;

-- Lock outbox then authorization; ensure one Expo ticket per SQL dispatch.
CREATE OR REPLACE FUNCTION public.apd_mobile_expo_record_ticket(
 p_event_key text,p_dispatch_id uuid,p_ticket_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_status text;v_state text;v_count integer;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
  OR p_dispatch_id IS NULL OR p_ticket_id IS NULL
  OR p_ticket_id !~ '^[A-Za-z0-9_-]{8,200}$'
 THEN RETURN false; END IF;
 SELECT o.status INTO v_status
 FROM public.apd_mobile_push_outbox o
 WHERE o.event_key=p_event_key FOR UPDATE;
 IF v_status IS DISTINCT FROM 'dispatching' THEN RETURN false; END IF;
 SELECT a.state INTO v_state
 FROM public.apd_mobile_dispatch_authorizations a
 WHERE a.event_key=p_event_key AND a.dispatch_id=p_dispatch_id
 FOR UPDATE;
 IF v_state IS DISTINCT FROM 'prepared' THEN RETURN false; END IF;
 INSERT INTO public.apd_mobile_expo_receipt_correlation(
  event_key,dispatch_id,ticket_id)
 VALUES(p_event_key,p_dispatch_id,p_ticket_id)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END; $$;

-- Only record a future trusted parsed provider response. NO delivery claim.
-- Revocation/quarantine cannot be reversed by a late receipt.
CREATE OR REPLACE FUNCTION public.apd_mobile_expo_record_receipt(
 p_event_key text,p_dispatch_id uuid,p_ticket_id text,p_outcome text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_status text;v_state text;v_row record;v_count integer;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
  OR p_dispatch_id IS NULL OR p_ticket_id IS NULL
  OR p_ticket_id !~ '^[A-Za-z0-9_-]{8,200}$'
  OR p_outcome IS NULL
  OR p_outcome NOT IN ('pending','provider_accepted',
    'provider_rejected','invalid_device','uncertain')
 THEN RETURN false; END IF;
 SELECT o.status INTO v_status
 FROM public.apd_mobile_push_outbox o
 WHERE o.event_key=p_event_key FOR UPDATE;
 IF v_status IS NULL THEN RETURN false; END IF;
 SELECT a.state INTO v_state
 FROM public.apd_mobile_dispatch_authorizations a
 WHERE a.event_key=p_event_key AND a.dispatch_id=p_dispatch_id
 FOR UPDATE;
 IF v_state IS NULL THEN RETURN false; END IF;
 SELECT r.* INTO v_row
 FROM public.apd_mobile_expo_receipt_correlation r
 WHERE r.event_key=p_event_key AND r.dispatch_id=p_dispatch_id
 FOR UPDATE;
 IF NOT FOUND OR v_row.ticket_id IS DISTINCT FROM p_ticket_id
  OR v_row.receipt_outcome IS NOT NULL THEN RETURN false; END IF;
 IF p_outcome='pending' THEN
  UPDATE public.apd_mobile_expo_receipt_correlation
  SET receipt_checked_at=clock_timestamp()
  WHERE event_key=p_event_key AND dispatch_id=p_dispatch_id;
  RETURN true;
 END IF;
 UPDATE public.apd_mobile_expo_receipt_correlation
 SET receipt_outcome=p_outcome,
     tracking_state=CASE WHEN v_status<>'dispatching'
                         OR v_state<>'prepared'
      THEN 'late_audit' ELSE p_outcome END,
     late_receipt_audit_only=(v_status<>'dispatching' OR v_state<>'prepared'),
     receipt_checked_at=clock_timestamp()
 WHERE event_key=p_event_key AND dispatch_id=p_dispatch_id
   AND receipt_outcome IS NULL;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END; $$;
REVOKE ALL ON FUNCTION public.apd_mobile_expo_record_ticket(text,uuid,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apd_mobile_expo_record_receipt(text,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_mobile_expo_record_ticket(text,uuid,text)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_expo_record_receipt(text,uuid,text,text)
 TO service_role;
-- This does not call providers, mark sent or reopen revoked events.
COMMIT;

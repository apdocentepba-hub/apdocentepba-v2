-- APD mobile LAB: redact resolved Expo tickets after at least 90 days.
-- Only run AFTER correlation + expiry SQL candidates, on disposable PG17.
-- No raw ticket is retained in the tombstone. Unknown/revoked/later
-- receipts remain UNTOUCHED and are never subject to automated purging.
BEGIN;

CREATE TABLE public.apd_mobile_expo_ticket_tombstones (
 event_key text NOT NULL,
 dispatch_id uuid NOT NULL,
 ticket_sha256 text NOT NULL UNIQUE
  CHECK (ticket_sha256 ~ '^[0-9a-f]{64}$'),
 last_provider_outcome text NOT NULL CHECK (
  last_provider_outcome IN
   ('provider_accepted','provider_rejected','invalid_device')),
 retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(event_key,dispatch_id),
 FOREIGN KEY(event_key,dispatch_id)
  REFERENCES public.apd_mobile_dispatch_authorizations(event_key,dispatch_id)
  ON DELETE RESTRICT
);

ALTER TABLE public.apd_mobile_expo_ticket_tombstones
 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_expo_ticket_tombstones
 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_mobile_expo_ticket_tombstones
 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.apd_mobile_expo_ticket_tombstones TO service_role;

-- Replace the candidate RPC with a ticket-hash tombstone check. The advisory
-- lock serializes record_ticket and retirement FOR THE SAME TICKET across
-- different outbox events; plain SELECT without that lock has a race.
CREATE OR REPLACE FUNCTION public.apd_mobile_expo_record_ticket(
 p_event_key text,p_dispatch_id uuid,p_ticket_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_status text;v_state text;v_count integer;v_hash text;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
  OR p_dispatch_id IS NULL OR p_ticket_id IS NULL
  OR p_ticket_id !~ '^[A-Za-z0-9_-]{8,200}$'
 THEN RETURN false; END IF;

 SELECT o.status INTO v_status FROM public.apd_mobile_push_outbox o
 WHERE o.event_key=p_event_key FOR UPDATE;
 IF v_status IS DISTINCT FROM 'dispatching' THEN RETURN false; END IF;
 SELECT a.state INTO v_state
 FROM public.apd_mobile_dispatch_authorizations a
 WHERE a.event_key=p_event_key AND a.dispatch_id=p_dispatch_id
 FOR UPDATE;
 IF v_state IS DISTINCT FROM 'prepared' THEN RETURN false; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended(p_ticket_id,38193));
 v_hash=encode(sha256(convert_to(p_ticket_id,'UTF8')),'hex');
 IF EXISTS (
   SELECT 1 FROM public.apd_mobile_expo_ticket_tombstones t
   WHERE t.ticket_sha256=v_hash
 ) THEN RETURN false; END IF;
 INSERT INTO public.apd_mobile_expo_receipt_correlation(
  event_key,dispatch_id,ticket_id)
 VALUES(p_event_key,p_dispatch_id,p_ticket_id)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END; $$;

-- Limit the redaction to conclusively resolved, consistent, elderly rows.
-- Outbox/auth/correlation/tombstone lock order is identical to other RPCs.
-- Never remove uncertainty, revocation, or late receipt audit evidence.
CREATE OR REPLACE FUNCTION public.apd_mobile_expo_retire_terminal_tickets(
 p_limit integer DEFAULT 20,p_min_age_days integer DEFAULT 90
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v record;v_status text;v_state text;v_row record;
        v_count integer;v_total integer:=0;v_ticket text;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>20
 OR p_min_age_days IS NULL OR p_min_age_days<90
 OR p_min_age_days>3650
 THEN RAISE EXCEPTION 'invalid expo retention bounds'; END IF;

 FOR v IN
  SELECT o.event_key,a.dispatch_id
  FROM public.apd_mobile_expo_receipt_correlation r
  JOIN public.apd_mobile_dispatch_authorizations a
   ON a.event_key=r.event_key AND a.dispatch_id=r.dispatch_id
  JOIN public.apd_mobile_push_outbox o ON o.event_key=r.event_key
  WHERE r.receipt_outcome IN (
   'provider_accepted','provider_rejected','invalid_device')
   AND r.tracking_state=r.receipt_outcome
   AND r.late_receipt_audit_only=false
   AND r.late_observed_outcome IS NULL
   AND r.ticket_recorded_at <
       clock_timestamp()-make_interval(days=>p_min_age_days)
   AND ((o.status='sent' AND a.state='accepted'
        AND r.receipt_outcome='provider_accepted')
     OR (o.status='dead' AND a.state='rejected'
        AND r.receipt_outcome IN ('provider_rejected','invalid_device')))
  ORDER BY r.ticket_recorded_at,o.event_key
  LIMIT p_limit FOR UPDATE OF o SKIP LOCKED
 LOOP
  SELECT o.status INTO v_status
  FROM public.apd_mobile_push_outbox o
  WHERE o.event_key=v.event_key;
  SELECT a.state INTO v_state
  FROM public.apd_mobile_dispatch_authorizations a
  WHERE a.event_key=v.event_key AND a.dispatch_id=v.dispatch_id
  FOR UPDATE;
  -- Read the candidate ticket without a row lock, take its advisory lock,
  -- and only then lock the receipt row. record_ticket takes advisory before
  -- touching receipt uniqueness; this shared ordering avoids deadlocks.
  SELECT r.ticket_id INTO v_ticket
  FROM public.apd_mobile_expo_receipt_correlation r
  WHERE r.event_key=v.event_key AND r.dispatch_id=v.dispatch_id;
  IF NOT FOUND OR v_ticket IS NULL THEN CONTINUE; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_ticket,38193));
  SELECT r.* INTO v_row
  FROM public.apd_mobile_expo_receipt_correlation r
  WHERE r.event_key=v.event_key AND r.dispatch_id=v.dispatch_id
  FOR UPDATE;
  IF NOT FOUND OR v_row.ticket_id IS DISTINCT FROM v_ticket OR
    v_row.late_receipt_audit_only OR
    v_row.late_observed_outcome IS NOT NULL OR
    v_row.ticket_recorded_at>=
      clock_timestamp()-make_interval(days=>p_min_age_days)
    OR v_row.tracking_state IS DISTINCT FROM v_row.receipt_outcome
    OR NOT (
      (v_status='sent' AND v_state='accepted'
       AND v_row.receipt_outcome='provider_accepted')
      OR (v_status='dead' AND v_state='rejected'
       AND v_row.receipt_outcome IN ('provider_rejected','invalid_device'))
    )
  THEN CONTINUE; END IF;

  INSERT INTO public.apd_mobile_expo_ticket_tombstones(
   event_key,dispatch_id,ticket_sha256,last_provider_outcome)
  VALUES(v.event_key,v.dispatch_id,
   encode(sha256(convert_to(v_row.ticket_id,'UTF8')),'hex'),
   v_row.receipt_outcome);
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'expo ticket retirement conflict'; END IF;

  DELETE FROM public.apd_mobile_expo_receipt_correlation r
  WHERE r.event_key=v.event_key AND r.dispatch_id=v.dispatch_id
   AND r.ticket_id=v_row.ticket_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'expo ticket retirement delete conflict'; END IF;
  v_total=v_total+1;
 END LOOP;
 RETURN v_total;
END; $$;

REVOKE ALL ON FUNCTION
 public.apd_mobile_expo_retire_terminal_tickets(integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.apd_mobile_expo_retire_terminal_tickets(integer,integer)
 TO service_role;
-- Not scheduled or applied to any Supabase project.
COMMIT;

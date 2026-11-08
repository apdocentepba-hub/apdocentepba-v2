-- APDocentePBA: dispatch authorization & idempotency LAB ONLY (2026-11-08).
-- ADDITIVE CANDIDATE applied after the existing PRIVATE storage candidate.
-- NEVER APPLY TO PRODUCTION WITHOUT APPROVAL, BACKUP, AND A ROLLBACK PLAN.
--
-- A provider is NEVER contacted here. Once an authorization is issued,
-- *all* uncertain outcomes are quarantined: an expired worker may not retry.
-- Revocation and a provider call are not one atomic operation. The sender
-- must do final checks and use the same idempotency key (when supported).
BEGIN;

ALTER TABLE public.apd_mobile_push_outbox
 DROP CONSTRAINT IF EXISTS apd_mobile_push_outbox_status_check;
ALTER TABLE public.apd_mobile_push_outbox
 ADD CONSTRAINT apd_mobile_push_outbox_status_check CHECK (
  status IN ('pending','leased','dispatching','uncertain','sent','dead','cancelled'));
ALTER TABLE public.apd_mobile_push_outbox
 DROP CONSTRAINT apd_mobile_lease_status_coherent;
ALTER TABLE public.apd_mobile_push_outbox
 ADD CONSTRAINT apd_mobile_lease_status_coherent CHECK (
  (status IN ('leased','dispatching')
    AND lease_id IS NOT NULL AND leased_until IS NOT NULL)
  OR (status NOT IN ('leased','dispatching')
    AND lease_id IS NULL AND leased_until IS NULL));

-- One and only one dispatch authorization per event (globally unique ID).
-- No token, address, delivery payload, payment data or user PII is stored.
CREATE TABLE IF NOT EXISTS public.apd_mobile_dispatch_authorizations (
 event_key text PRIMARY KEY
  REFERENCES public.apd_mobile_push_outbox(event_key) ON DELETE CASCADE,
 dispatch_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 state text NOT NULL DEFAULT 'prepared' CHECK (
  state IN ('prepared','accepted','rejected','uncertain','revoked')),
 authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 resolved_at timestamptz,
 CONSTRAINT apd_mobile_dispatch_resolution CHECK (
  (state='prepared' AND resolved_at IS NULL) OR
  (state<>'prepared' AND resolved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS apd_mobile_dispatch_stale_lab
 ON public.apd_mobile_dispatch_authorizations(authorized_at)
 WHERE state='prepared';

ALTER TABLE public.apd_mobile_dispatch_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_dispatch_authorizations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_mobile_dispatch_authorizations
 FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT,INSERT,UPDATE,DELETE
 ON public.apd_mobile_dispatch_authorizations TO service_role;

-- Lock device FIRST (same lock order as device revocation), then outbox.
-- This serializes revocation against DB authorization. It cannot promise
-- cancellation of a provider request after the DB transaction commits.
CREATE OR REPLACE FUNCTION public.apd_mobile_prepare_dispatch(
 p_event_key text,p_lease_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_device uuid;v_status text;v_lease uuid;
        v_leased_until timestamptz;v_offer_end timestamptz;
        v_dispatch uuid;v_count integer;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
    OR p_lease_id IS NULL THEN RETURN NULL; END IF;

 SELECT d.id INTO v_device
 FROM public.apd_mobile_push_devices d
 JOIN public.apd_mobile_push_outbox o
  ON o.device_id=d.id AND o.user_id=d.user_id
 JOIN public.users u ON u.id=o.user_id
 WHERE o.event_key=p_event_key
   AND d.enabled=true AND d.opted_in=true AND d.revoked_at IS NULL
   AND u.activo=true
 FOR UPDATE OF d;
 IF v_device IS NULL THEN RETURN NULL; END IF;

 SELECT o.status,o.lease_id,o.leased_until,o.offer_expires_at
 INTO v_status,v_lease,v_leased_until,v_offer_end
 FROM public.apd_mobile_push_outbox o
 WHERE o.event_key=p_event_key
 FOR UPDATE;
 IF v_status IS DISTINCT FROM 'leased'
    OR v_lease IS DISTINCT FROM p_lease_id
    OR v_leased_until<=clock_timestamp()
    OR v_offer_end<=clock_timestamp() THEN RETURN NULL; END IF;

 -- A lost response must NOT permit a second authorization for the event.
 IF EXISTS (SELECT 1 FROM public.apd_mobile_dispatch_authorizations a
            WHERE a.event_key=p_event_key) THEN RETURN NULL; END IF;

 v_dispatch=gen_random_uuid();
 INSERT INTO public.apd_mobile_dispatch_authorizations
  (event_key,dispatch_id,state,authorized_at)
 VALUES (p_event_key,v_dispatch,'prepared',clock_timestamp());
 UPDATE public.apd_mobile_push_outbox o
 SET status='dispatching',updated_at=clock_timestamp()
 WHERE o.event_key=p_event_key AND o.status='leased'
   AND o.lease_id=p_lease_id;
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>1 THEN
  RAISE EXCEPTION 'dispatch authorization state conflict';
 END IF;
 RETURN v_dispatch;
END; $$;

-- Provider outcome is *reported*, not produced, by this SQL RPC.
-- Explicit rejection is terminal. Unknown outcome is quarantined.
CREATE OR REPLACE FUNCTION public.apd_mobile_resolve_dispatch(
 p_event_key text,p_dispatch_id uuid,p_outcome text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_state text;v_count integer;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
    OR p_dispatch_id IS NULL
    OR p_outcome NOT IN ('accepted','rejected','uncertain')
 THEN RETURN false; END IF;
 PERFORM 1 FROM public.apd_mobile_push_outbox o
  WHERE o.event_key=p_event_key FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT a.state INTO v_state
 FROM public.apd_mobile_dispatch_authorizations a
 WHERE a.event_key=p_event_key AND a.dispatch_id=p_dispatch_id
 FOR UPDATE;
 IF v_state IS DISTINCT FROM 'prepared' THEN RETURN false; END IF;

 UPDATE public.apd_mobile_push_outbox
 SET status=CASE p_outcome WHEN 'accepted' THEN 'sent'
                          WHEN 'rejected' THEN 'dead'
                          ELSE 'uncertain' END,
     lease_id=NULL,leased_until=NULL,updated_at=clock_timestamp()
 WHERE event_key=p_event_key AND status='dispatching';
 GET DIAGNOSTICS v_count=ROW_COUNT;
 IF v_count<>1 THEN RETURN false; END IF;

 UPDATE public.apd_mobile_dispatch_authorizations
 SET state=p_outcome,resolved_at=clock_timestamp()
 WHERE event_key=p_event_key AND dispatch_id=p_dispatch_id
   AND state='prepared';
 RETURN FOUND;
END; $$;

-- Worker may crash after authorization, after provider call, or before ack.
-- Never reclaim/retry such work automatically; quarantine stale attempts.
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
  ORDER BY a.authorized_at
  LIMIT p_limit FOR UPDATE OF o SKIP LOCKED
 LOOP
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

-- A late revocation cancels pending / leased / dispatching DB state.
-- A provider call already in flight may still be received by the provider.
-- The unique authorization is retained as revoked and never reissued.
CREATE OR REPLACE FUNCTION public.apd_mobile_cancel_revoked_device()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF (NEW.enabled IS NOT TRUE OR NEW.opted_in IS NOT TRUE
     OR NEW.revoked_at IS NOT NULL)
    AND (OLD.enabled IS DISTINCT FROM NEW.enabled
      OR OLD.opted_in IS DISTINCT FROM NEW.opted_in
      OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at)
 THEN
  UPDATE public.apd_mobile_push_outbox
  SET status='cancelled',lease_id=NULL,leased_until=NULL,
      updated_at=clock_timestamp()
  WHERE device_id=NEW.id AND status IN ('pending','leased','dispatching');

  UPDATE public.apd_mobile_dispatch_authorizations a
  SET state='revoked',resolved_at=clock_timestamp()
  FROM public.apd_mobile_push_outbox o
  WHERE o.event_key=a.event_key AND o.device_id=NEW.id
    AND a.state='prepared';
 END IF;
 RETURN NEW;
END; $$;

-- Crucial: legacy finish_push(p_sent=true) MUST NOT bypass the
-- authorization table. All future provider receipts use resolve_dispatch.
CREATE OR REPLACE FUNCTION public.apd_mobile_finish_push(
 p_event_key text,p_lease_id uuid,p_sent boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_count integer;
BEGIN
 IF p_sent IS DISTINCT FROM false OR p_event_key IS NULL
    OR p_event_key !~ '^[0-9a-f]{64}$' OR p_lease_id IS NULL THEN
  RETURN false;
 END IF;
 UPDATE public.apd_mobile_push_outbox o
 SET status=CASE WHEN o.attempts>=3 THEN 'dead' ELSE 'pending' END,
     available_at=clock_timestamp()+
       make_interval(secs=>least(60,power(2,o.attempts-1)::integer)),
     lease_id=NULL,leased_until=NULL,updated_at=clock_timestamp()
 WHERE o.event_key=p_event_key AND o.lease_id=p_lease_id
   AND o.status='leased' AND o.leased_until>clock_timestamp()
   AND o.offer_expires_at>clock_timestamp()
   AND NOT EXISTS (
    SELECT 1 FROM public.apd_mobile_dispatch_authorizations a
    WHERE a.event_key=o.event_key)
   AND EXISTS (
    SELECT 1 FROM public.apd_mobile_push_devices d
    WHERE d.id=o.device_id AND d.user_id=o.user_id
      AND d.enabled=true AND d.opted_in=true
      AND d.revoked_at IS NULL);
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END; $$;

REVOKE ALL ON FUNCTION public.apd_mobile_prepare_dispatch(text,uuid)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apd_mobile_resolve_dispatch(text,uuid,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apd_mobile_quarantine_stale_dispatch(integer)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apd_mobile_finish_push(text,uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_mobile_prepare_dispatch(text,uuid)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_resolve_dispatch(text,uuid,text)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_quarantine_stale_dispatch(integer)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_finish_push(text,uuid,boolean)
 TO service_role;

-- There is no provider transport, cron, external HTTP, token or payload here.
COMMIT;

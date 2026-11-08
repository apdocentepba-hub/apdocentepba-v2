-- APDocentePBA - future mobile push durable storage; SQL LAB CANDIDATE ONLY.
-- DO NOT RUN AGAINST SUPABASE PRODUCTION WITHOUT APPROVAL, BACKUP AND ROLLBACK.
-- Requires public.users(id uuid), gen_random_uuid(), service_role/anon/authenticated.
-- Service-only tables: no direct browser, PostgREST anon or authenticated access.
-- Encrypted provider token supplied by Worker (AES-256-GCM) and HMAC digest;
-- NEVER submit plaintext token, PII, user phone, email or ABC credentials.
BEGIN;

CREATE TABLE IF NOT EXISTS public.apd_mobile_push_devices (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 platform text NOT NULL CHECK (platform IN ('android','ios')),
 transport text NOT NULL CHECK (transport IN ('expo','fcm','apns')),
 token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 token_ciphertext text NOT NULL CHECK (
  length(token_ciphertext) BETWEEN 48 AND 4096 AND
  token_ciphertext ~ '^[A-Za-z0-9_-]+$'),
 opted_in boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 CONSTRAINT apd_mobile_device_user_unique UNIQUE (id,user_id),
 CONSTRAINT apd_mobile_device_optout_closed
  CHECK (enabled=false OR opted_in=true),
 CONSTRAINT apd_mobile_provider_matches_platform CHECK (
  NOT (platform='android' AND transport='apns') AND
  NOT (platform='ios' AND transport='fcm'))
);
CREATE UNIQUE INDEX IF NOT EXISTS apd_mobile_device_unique_active_token
 ON public.apd_mobile_push_devices(token_hash)
 WHERE enabled=true;

CREATE TABLE IF NOT EXISTS public.apd_mobile_push_outbox (
 event_key text PRIMARY KEY CHECK (event_key ~ '^[0-9a-f]{64}$'),
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 device_id uuid NOT NULL,
 offer_fingerprint text NOT NULL CHECK (offer_fingerprint ~ '^[0-9a-f]{64}$'),
 offer_expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (
  status IN ('pending','leased','sent','dead','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid,
 leased_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT apd_mobile_outbox_device_owner FOREIGN KEY (device_id,user_id)
  REFERENCES public.apd_mobile_push_devices(id,user_id) ON DELETE CASCADE,
 CONSTRAINT apd_mobile_lease_status_coherent CHECK (
  (status='leased' AND lease_id IS NOT NULL AND leased_until IS NOT NULL)
  OR (status<>'leased' AND lease_id IS NULL AND leased_until IS NULL))
);
CREATE INDEX IF NOT EXISTS apd_mobile_outbox_next
 ON public.apd_mobile_push_outbox(available_at,created_at)
 WHERE status='pending';
CREATE INDEX IF NOT EXISTS apd_mobile_outbox_lease_recovery
 ON public.apd_mobile_push_outbox(leased_until)
 WHERE status='leased';
CREATE INDEX IF NOT EXISTS apd_mobile_outbox_device
 ON public.apd_mobile_push_outbox(device_id,status);

ALTER TABLE public.apd_mobile_push_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_push_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_push_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_push_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_mobile_push_devices FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON public.apd_mobile_push_outbox FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.apd_mobile_push_devices TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.apd_mobile_push_outbox TO service_role;

-- Revocation is atomic with cancellation; no queued/leased work survives it.
CREATE OR REPLACE FUNCTION public.apd_mobile_cancel_revoked_device()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
BEGIN
 IF (NEW.enabled IS NOT TRUE OR NEW.opted_in IS NOT TRUE)
    AND (OLD.enabled IS DISTINCT FROM NEW.enabled
      OR OLD.opted_in IS DISTINCT FROM NEW.opted_in)
 THEN
  UPDATE public.apd_mobile_push_outbox
   SET status='cancelled',lease_id=NULL,leased_until=NULL,
       updated_at=clock_timestamp()
   WHERE device_id=NEW.id AND status IN ('pending','leased');
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS apd_mobile_revocation_cancels_pending ON public.apd_mobile_push_devices;
CREATE TRIGGER apd_mobile_revocation_cancels_pending
 AFTER UPDATE OF enabled,opted_in ON public.apd_mobile_push_devices
 FOR EACH ROW EXECUTE FUNCTION public.apd_mobile_cancel_revoked_device();

-- Atomic, concurrent-safe claim. This function DOES NOT send a push.
-- Caller must reverify session/plan and offer publication before a provider call.
CREATE OR REPLACE FUNCTION public.apd_mobile_claim_push(
 p_limit integer DEFAULT 10,
 p_lease_seconds integer DEFAULT 60
) RETURNS TABLE (
 event_key text, user_id uuid, device_id uuid, lease_id uuid, attempts integer
) LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 OR
    p_lease_seconds IS NULL OR p_lease_seconds<10 OR p_lease_seconds>300 THEN
  RAISE EXCEPTION 'invalid mobile claim bounds';
 END IF;
 RETURN QUERY
 WITH chosen AS (
  SELECT o.event_key FROM public.apd_mobile_push_outbox o
  INNER JOIN public.apd_mobile_push_devices d
   ON d.id=o.device_id AND d.user_id=o.user_id
  WHERE d.enabled=true AND d.opted_in=true
    AND o.offer_expires_at>clock_timestamp()
    AND o.attempts<3
    AND (
      (o.status='pending' AND o.available_at<=clock_timestamp())
      OR (o.status='leased' AND o.leased_until<clock_timestamp())
    )
  ORDER BY o.created_at,o.event_key
  LIMIT p_limit
  FOR UPDATE OF o SKIP LOCKED
 )
 UPDATE public.apd_mobile_push_outbox o
 SET status='leased',attempts=o.attempts+1,
     lease_id=gen_random_uuid(),
     leased_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
     updated_at=clock_timestamp()
 FROM chosen
 WHERE o.event_key=chosen.event_key
 RETURNING o.event_key,o.user_id,o.device_id,o.lease_id,o.attempts;
END; $$;

-- Acknowledgement only for the current unexpired lease.
-- Return false on revocation, outdated lease, expiry, or unknown event.
CREATE OR REPLACE FUNCTION public.apd_mobile_finish_push(
 p_event_key text,
 p_lease_id uuid,
 p_sent boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE v_count integer;
BEGIN
 IF p_event_key IS NULL OR p_lease_id IS NULL OR p_sent IS NULL THEN
  RETURN false;
 END IF;
 UPDATE public.apd_mobile_push_outbox o
 SET status=CASE WHEN p_sent THEN 'sent'
                 WHEN o.attempts>=3 THEN 'dead'
                 ELSE 'pending' END,
     available_at=CASE WHEN p_sent THEN o.available_at
      ELSE clock_timestamp()+make_interval(secs=>least(60,power(2,o.attempts-1)::integer)) END,
     lease_id=NULL,leased_until=NULL,updated_at=clock_timestamp()
 WHERE o.event_key=p_event_key AND o.lease_id=p_lease_id
   AND o.status='leased' AND o.leased_until>clock_timestamp()
   AND o.offer_expires_at>clock_timestamp()
   AND EXISTS(
    SELECT 1 FROM public.apd_mobile_push_devices d
     WHERE d.id=o.device_id AND d.user_id=o.user_id
       AND d.enabled=true AND d.opted_in=true
   );
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END; $$;

-- Final preflight cancellation of an actively leased event. SQL candidate only.
-- A stale worker may not cancel a subsequent worker's lease.
CREATE OR REPLACE FUNCTION public.apd_mobile_cancel_push(
 p_event_key text,
 p_lease_id uuid
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $$
DECLARE v_count integer;
BEGIN
 IF p_event_key IS NULL OR p_event_key !~ '^[0-9a-f]{64}$'
    OR p_lease_id IS NULL THEN RETURN false; END IF;
 UPDATE public.apd_mobile_push_outbox o
 SET status='cancelled',lease_id=NULL,leased_until=NULL,
     updated_at=clock_timestamp()
 WHERE o.event_key=p_event_key AND o.lease_id=p_lease_id
   AND o.status='leased' AND o.leased_until>clock_timestamp();
 GET DIAGNOSTICS v_count=ROW_COUNT;
 RETURN v_count=1;
END; $$;

REVOKE ALL ON FUNCTION public.apd_mobile_cancel_revoked_device() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apd_mobile_claim_push(integer,integer)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apd_mobile_finish_push(text,uuid,boolean)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_mobile_cancel_revoked_device() TO service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_claim_push(integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.apd_mobile_cancel_push(text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apd_mobile_cancel_push(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apd_mobile_finish_push(text,uuid,boolean) TO service_role;

-- Deliberately no pg_cron trigger, provider API, network, user payload or seed.
COMMIT;

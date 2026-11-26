-- Offline candidate. No provider, no cron, no production migration.
BEGIN;
CREATE TABLE public.user_favorite_reminder_consent (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.favorite_reminder_dispatch (
 user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 offer_key text NOT NULL CHECK(public.apd_valid_favorite_keys(ARRAY[offer_key])),
 deadline timestamptz NOT NULL,
 band text NOT NULL CHECK(band IN ('24h','2h')),
 state text NOT NULL CHECK(state IN ('dispatching','sent','uncertain','cancelled')),
 claimed_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz NOT NULL,
 consent_revision bigint NOT NULL,
 favorite_revision bigint NOT NULL,
 finished_at timestamptz,
 PRIMARY KEY(user_id,offer_key,deadline,band),
 CHECK (verified_at<=claimed_at AND verified_at>=claimed_at-interval '5 minutes'),
 CHECK (deadline>claimed_at),
 CHECK ((state='dispatching' AND finished_at IS NULL) OR (state<>'dispatching' AND finished_at IS NOT NULL))
);
ALTER TABLE public.user_favorite_reminder_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_reminder_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_favorite_reminder_consent,public.favorite_reminder_dispatch FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.user_favorite_reminder_consent TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.favorite_reminder_dispatch TO service_role;
-- Only internal callers may supply verified_at; never expose as a browser endpoint.
CREATE FUNCTION public.apd_claim_favorite_reminder(p_user uuid,p_key text,p_deadline timestamptz,p_verified_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE c public.user_favorite_reminder_consent%ROWTYPE; f public.user_favorite_offers%ROWTYPE; t timestamptz; b text; n integer;
BEGIN
 IF p_user IS NULL OR p_key IS NULL OR NOT public.apd_valid_favorite_keys(ARRAY[p_key]) OR p_deadline IS NULL OR p_verified_at IS NULL THEN RETURN 'rejected'; END IF;
 -- Serialize consent and membership changes with claim. No external call inside transaction.
 SELECT * INTO c FROM public.user_favorite_reminder_consent WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND OR NOT c.enabled THEN RETURN 'no_consent'; END IF;
 SELECT * INTO f FROM public.user_favorite_offers WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND OR NOT (p_key=ANY(f.keys)) THEN RETURN 'not_saved'; END IF;
 t:=clock_timestamp();
 IF p_verified_at>t OR p_verified_at<t-interval '5 minutes' OR p_deadline<=t OR p_deadline>t+interval '24 hours' THEN RETURN 'not_due'; END IF;
 b:=CASE WHEN p_deadline<=t+interval '2 hours' THEN '2h' ELSE '24h' END;
 INSERT INTO public.favorite_reminder_dispatch(user_id,offer_key,deadline,band,state,claimed_at,verified_at,consent_revision,favorite_revision)
 VALUES(p_user,p_key,p_deadline,b,'dispatching',t,p_verified_at,c.revision,f.revision)
 ON CONFLICT(user_id,offer_key,deadline,band) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n=0 THEN RETURN 'already_claimed'; END IF;
 RETURN b;
END $$;
CREATE FUNCTION public.apd_finish_favorite_reminder(p_user uuid,p_key text,p_deadline timestamptz,p_band text,p_state text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 IF p_state IS NULL OR p_state NOT IN ('sent','uncertain','cancelled') THEN RETURN false; END IF;
 UPDATE public.favorite_reminder_dispatch SET state=p_state,finished_at=clock_timestamp()
 WHERE user_id=p_user AND offer_key=p_key AND deadline=p_deadline AND band=p_band AND state='dispatching';
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.apd_claim_favorite_reminder(uuid,text,timestamptz,timestamptz),public.apd_finish_favorite_reminder(uuid,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_claim_favorite_reminder(uuid,text,timestamptz,timestamptz),public.apd_finish_favorite_reminder(uuid,text,timestamptz,text,text) TO service_role;
COMMIT;
-- No retries on uncertain or abandoned dispatching rows. Explicit user consent required.

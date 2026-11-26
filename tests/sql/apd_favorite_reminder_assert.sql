-- Disposable PostgreSQL fixture only.
DO $$
DECLARE r text; t text; p text;
BEGIN
 FOREACH t IN ARRAY ARRAY['public.user_favorite_reminder_consent','public.favorite_reminder_dispatch'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=t::regclass) THEN RAISE EXCEPTION 'RLS missing'; END IF;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege(r,t,p) THEN RAISE EXCEPTION 'Unexpected client grant'; END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_function_privilege(r,'public.apd_claim_favorite_reminder(uuid,text,timestamptz,timestamptz)','EXECUTE') OR has_function_privilege(r,'public.apd_finish_favorite_reminder(uuid,text,timestamptz,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Public RPC'; END IF;
 END LOOP;
END $$;
SET ROLE service_role;
DO $$
DECLARE a uuid:='00000000-0000-0000-0000-000000000001'; b uuid:='00000000-0000-0000-0000-000000000002'; d timestamptz:=now()+interval '3 hours'; t timestamptz:=clock_timestamp();
BEGIN
 IF public.apd_claim_favorite_reminder(a,'D_1',d,t)<>'no_consent' THEN RAISE EXCEPTION 'Missing consent accepted'; END IF;
 INSERT INTO public.user_favorite_reminder_consent(user_id,enabled,revision) VALUES(a,true,1),(b,true,1);
 INSERT INTO public.user_favorite_offers(user_id,keys,revision) VALUES(a,ARRAY['D_1'],1),(b,ARRAY['D_2'],1);
 IF public.apd_claim_favorite_reminder(b,'D_1',d,t)<>'not_saved' THEN RAISE EXCEPTION 'Cross-owner claim'; END IF;
 IF public.apd_claim_favorite_reminder(a,'D_1',d,t-interval '6 minutes')<>'not_due' THEN RAISE EXCEPTION 'Stale source'; END IF;
 IF public.apd_claim_favorite_reminder(a,'D_1',t-interval '1 second',t)<>'not_due' THEN RAISE EXCEPTION 'Expired offer'; END IF;
 IF public.apd_claim_favorite_reminder(a,'D_1',d,t)<>'24h' THEN RAISE EXCEPTION 'Valid claim failed'; END IF;
 IF public.apd_claim_favorite_reminder(a,'D_1',d,t)<>'already_claimed' THEN RAISE EXCEPTION 'Duplicate claim'; END IF;
 IF NOT public.apd_finish_favorite_reminder(a,'D_1',d,'24h','uncertain') THEN RAISE EXCEPTION 'Uncertain finalization'; END IF;
 IF public.apd_finish_favorite_reminder(a,'D_1',d,'24h','sent') THEN RAISE EXCEPTION 'Terminal state overwritten'; END IF;
 IF public.apd_claim_favorite_reminder(a,'D_1',d,t)<>'already_claimed' THEN RAISE EXCEPTION 'Uncertain retry'; END IF;
 UPDATE public.user_favorite_reminder_consent SET enabled=false,revision=2 WHERE user_id=a;
 IF public.apd_claim_favorite_reminder(a,'D_1',t+interval '1 hour',t)<>'no_consent' THEN RAISE EXCEPTION 'Revocation ignored'; END IF;
 UPDATE public.user_favorite_reminder_consent SET enabled=true,revision=3 WHERE user_id=a;
 UPDATE public.user_favorite_offers SET keys='{}',revision=2 WHERE user_id=a;
 IF public.apd_claim_favorite_reminder(a,'D_1',t+interval '1 hour',t)<>'not_saved' THEN RAISE EXCEPTION 'Removal ignored'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS reminder ACL, consent, ownership, expiry, deduplication and terminal uncertainty';

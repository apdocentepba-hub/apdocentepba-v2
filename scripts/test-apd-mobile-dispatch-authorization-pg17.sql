\set ON_ERROR_STOP on
-- PG17 disposable database only. Run AFTER test-apd-mobile-push-private-pg17.sql.
-- No real Supabase project, provider token, internet or delivery.
\ir ../sql/apd_mobile_dispatch_authorization_lab_20261108.sql

DO $audit$
BEGIN
 IF has_table_privilege('anon','public.apd_mobile_dispatch_authorizations','SELECT')
 OR has_table_privilege('authenticated','public.apd_mobile_dispatch_authorizations','INSERT')
 OR has_function_privilege('anon','public.apd_mobile_prepare_dispatch(text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.apd_mobile_resolve_dispatch(text,uuid,text)','EXECUTE')
 OR has_function_privilege('anon','public.apd_mobile_quarantine_stale_dispatch(integer)','EXECUTE')
 THEN RAISE EXCEPTION 'UNSAFE DISPATCH PUBLIC ACCESS'; END IF;

 IF NOT has_table_privilege('service_role','public.apd_mobile_dispatch_authorizations','INSERT')
 OR NOT has_function_privilege('service_role','public.apd_mobile_prepare_dispatch(text,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.apd_mobile_resolve_dispatch(text,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'SERVICE-ONLY DISPATCH PERMISSIONS INVALID'; END IF;

 IF (SELECT NOT relrowsecurity OR NOT relforcerowsecurity FROM pg_class
     WHERE oid='public.apd_mobile_dispatch_authorizations'::regclass)
 THEN RAISE EXCEPTION 'DISPATCH AUTHORIZATIONS RLS MUST BE FORCED'; END IF;
END $audit$;

SET ROLE service_role;

-- A provider has not been contacted. 'sent' is only a simulated receipt.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,
  source_offer_key,offer_expires_at)
VALUES
 (repeat('9',64),'11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),
  'APD:LAB:DISPATCH:A',now()+interval '1 day');

DO $test$
DECLARE c record;v_dispatch uuid;
BEGIN
 SELECT * INTO c FROM public.apd_mobile_claim_push(1,60);
 IF c.event_key IS DISTINCT FROM repeat('9',64)
 THEN RAISE EXCEPTION 'Unexpected dispatch authorization candidate'; END IF;

 IF public.apd_mobile_finish_push(c.event_key,c.lease_id,true)
 THEN RAISE EXCEPTION 'Legacy sent=true bypassed dispatch authorization'; END IF;

 IF public.apd_mobile_prepare_dispatch(c.event_key,
     'dddddddd-dddd-4ddd-8ddd-dddddddddddd') IS NOT NULL
 THEN RAISE EXCEPTION 'Accepted unauthorized lease'; END IF;

 v_dispatch=public.apd_mobile_prepare_dispatch(c.event_key,c.lease_id);
 IF v_dispatch IS NULL THEN
  RAISE EXCEPTION 'First valid unique authorization was not granted'; END IF;

 IF public.apd_mobile_prepare_dispatch(c.event_key,c.lease_id) IS NOT NULL
 THEN RAISE EXCEPTION 'Double authorization accepted'; END IF;
 IF public.apd_mobile_finish_push(c.event_key,c.lease_id,true)
 THEN RAISE EXCEPTION 'Legacy sent=true bypassed prepared event'; END IF;
 IF public.apd_mobile_finish_push(c.event_key,c.lease_id,false)
 THEN RAISE EXCEPTION 'Prepared event was returned to pending'; END IF;

 IF (SELECT status FROM public.apd_mobile_push_outbox
     WHERE event_key=c.event_key) <> 'dispatching'
 THEN RAISE EXCEPTION 'Prepared dispatch not exclusive'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(10,60)) <> 0
 THEN RAISE EXCEPTION 'Prepared dispatch was reclaimed'; END IF;

 IF public.apd_mobile_resolve_dispatch(c.event_key,
     'dddddddd-dddd-4ddd-8ddd-dddddddddddd','accepted')
 THEN RAISE EXCEPTION 'Accepted wrong dispatch receipt'; END IF;
 IF public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,NULL)
 THEN RAISE EXCEPTION 'Accepted missing outcome'; END IF;
 IF public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,'unknown')
 THEN RAISE EXCEPTION 'Accepted undeclared outcome'; END IF;

 IF NOT public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,'accepted')
 THEN RAISE EXCEPTION 'Simulated provider accepted acknowledgement rejected'; END IF;
 IF public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,'accepted')
 THEN RAISE EXCEPTION 'Duplicate provider receipt was accepted'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
     WHERE event_key=c.event_key) <> 'sent'
 THEN RAISE EXCEPTION 'Accepted receipt not recorded as sent'; END IF;
 IF (SELECT state FROM public.apd_mobile_dispatch_authorizations
     WHERE event_key=c.event_key) <> 'accepted'
 THEN RAISE EXCEPTION 'Authorization result not recorded'; END IF;
END $test$;

-- Revocation after 'prepare' must preserve the unique authorization while
-- cancelling the database reservation. It cannot revoke a provider call.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,
  source_offer_key,offer_expires_at)
VALUES
 (repeat('a',64),'11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('b',64),
  'APD:LAB:DISPATCH:B',now()+interval '1 day');

DO $test$
DECLARE c record;v_dispatch uuid;
BEGIN
 SELECT * INTO c FROM public.apd_mobile_claim_push(1,60);
 IF c.event_key IS DISTINCT FROM repeat('a',64)
 THEN RAISE EXCEPTION 'Expected revocation test event'; END IF;
 v_dispatch=public.apd_mobile_prepare_dispatch(c.event_key,c.lease_id);
 IF v_dispatch IS NULL THEN RAISE EXCEPTION 'Prepare before revocation failed'; END IF;

 UPDATE public.apd_mobile_push_devices
 SET enabled=false,opted_in=false,revoked_at=clock_timestamp()
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

 IF (SELECT status FROM public.apd_mobile_push_outbox
    WHERE event_key=c.event_key)<>'cancelled'
 THEN RAISE EXCEPTION 'Late revocation did not cancel dispatching outbox'; END IF;
 IF (SELECT state FROM public.apd_mobile_dispatch_authorizations
    WHERE event_key=c.event_key)<>'revoked'
 THEN RAISE EXCEPTION 'Authorization was not invalidated by revocation'; END IF;
 IF public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,'accepted')
 THEN RAISE EXCEPTION 'Revoked attempt accepted provider acknowledgement'; END IF;

 UPDATE public.apd_mobile_push_devices
 SET enabled=true,opted_in=true,revoked_at=NULL
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

 IF public.apd_mobile_prepare_dispatch(c.event_key,c.lease_id) IS NOT NULL
 THEN RAISE EXCEPTION 'Revoked authorization was reinstated'; END IF;
END $test$;

-- No re-send after a provider timeout: unknown outcome is quarantine.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,
  source_offer_key,offer_expires_at)
VALUES
 (repeat('b',64),'11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('c',64),
  'APD:LAB:DISPATCH:C',now()+interval '1 day');

DO $test$
DECLARE c record;v_dispatch uuid;
BEGIN
 SELECT * INTO c FROM public.apd_mobile_claim_push(1,60);
 IF c.event_key IS DISTINCT FROM repeat('b',64)
 THEN RAISE EXCEPTION 'Expected unknown-outcome candidate'; END IF;
 v_dispatch=public.apd_mobile_prepare_dispatch(c.event_key,c.lease_id);
 IF NOT public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,'uncertain')
 THEN RAISE EXCEPTION 'Unknown outcome could not be quarantined'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
     WHERE event_key=c.event_key)<>'uncertain'
 THEN RAISE EXCEPTION 'Unknown outcome was not quarantined'; END IF;
 IF public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,'accepted')
 THEN RAISE EXCEPTION 'Quarantined event was later accepted'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(10,60))<>0
 THEN RAISE EXCEPTION 'Unknown provider outcome was automatically retried'; END IF;
END $test$;

-- Crash after prepare: stale authorization must be quarantined, not reclaimed.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,
  source_offer_key,offer_expires_at)
VALUES
 (repeat('c',64),'11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('d',64),
  'APD:LAB:DISPATCH:D',now()+interval '1 day');

DO $test$
DECLARE c record;v_dispatch uuid;v_n integer;
BEGIN
 SELECT * INTO c FROM public.apd_mobile_claim_push(1,60);
 IF c.event_key IS DISTINCT FROM repeat('c',64)
 THEN RAISE EXCEPTION 'Expected crash-recovery candidate'; END IF;
 v_dispatch=public.apd_mobile_prepare_dispatch(c.event_key,c.lease_id);
 UPDATE public.apd_mobile_dispatch_authorizations
 SET authorized_at=clock_timestamp()-interval '5 minutes'
 WHERE event_key=c.event_key;
 v_n=public.apd_mobile_quarantine_stale_dispatch(5);
 IF v_n<>1 THEN RAISE EXCEPTION 'Missing stale dispatch quarantine'; END IF;
 IF public.apd_mobile_quarantine_stale_dispatch(5)<>0
 THEN RAISE EXCEPTION 'Duplicate quarantine accepted'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
    WHERE event_key=c.event_key)<>'uncertain'
 THEN RAISE EXCEPTION 'Stale dispatch not quarantined'; END IF;
 IF public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,'accepted')
 THEN RAISE EXCEPTION 'Stale dispatch could mark as sent'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(10,60))<>0
 THEN RAISE EXCEPTION 'Stale dispatch automatically reclaimed'; END IF;
END $test$;

-- An explicit rejection is terminal. It is never treated as confirmed delivery.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,
  source_offer_key,offer_expires_at)
VALUES
 (repeat('d',64),'11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('e',64),
  'APD:LAB:DISPATCH:E',now()+interval '1 day');

DO $test$
DECLARE c record;v_dispatch uuid;
BEGIN
 SELECT * INTO c FROM public.apd_mobile_claim_push(1,60);
 IF c.event_key IS DISTINCT FROM repeat('d',64)
 THEN RAISE EXCEPTION 'Expected rejection candidate'; END IF;
 v_dispatch=public.apd_mobile_prepare_dispatch(c.event_key,c.lease_id);
 IF NOT public.apd_mobile_resolve_dispatch(c.event_key,v_dispatch,'rejected')
 THEN RAISE EXCEPTION 'Explicit rejection could not become terminal'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
    WHERE event_key=c.event_key)<>'dead'
 THEN RAISE EXCEPTION 'Explicit rejection was considered delivered or retriable'; END IF;
END $test$;

-- An expired lease cannot be authorized; legacy sent=true also remains denied.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,
  source_offer_key,offer_expires_at)
VALUES
 (repeat('e',64),'11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('f',64),
  'APD:LAB:DISPATCH:F',now()+interval '1 day');
DO $test$
DECLARE c record;
BEGIN
 SELECT * INTO c FROM public.apd_mobile_claim_push(1,60);
 UPDATE public.apd_mobile_push_outbox
 SET leased_until=clock_timestamp()-interval '1 second'
 WHERE event_key=c.event_key;
 IF public.apd_mobile_prepare_dispatch(c.event_key,c.lease_id) IS NOT NULL
 THEN RAISE EXCEPTION 'Expired lease was authorized'; END IF;
 IF public.apd_mobile_finish_push(c.event_key,c.lease_id,true)
 THEN RAISE EXCEPTION 'Expired lease marked as sent'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_dispatch_authorizations
     WHERE event_key=c.event_key)<>0
 THEN RAISE EXCEPTION 'Failed prepare persisted an authorization'; END IF;
END $test$;

RESET ROLE;
DO $audit$
BEGIN
 IF has_function_privilege('anon','public.apd_mobile_prepare_dispatch(text,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.apd_mobile_resolve_dispatch(text,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'Function leaked through PUBLIC'; END IF;
END $audit$;
SELECT 'APD_MOBILE_DISPATCH_PG17_AUTHORIZATION_AND_QUARANTINE_PASS' AS result;

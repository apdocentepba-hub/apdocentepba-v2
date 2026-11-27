\set ON_ERROR_STOP on
\ir ../sql/apd_mobile_expo_consumed_reconciliation_lab_20261126.sql
SET ROLE service_role;
UPDATE public.apd_mobile_push_devices SET enabled=true,opted_in=true,revoked_at=NULL WHERE id='f1f1f1f1-1111-4111-8111-111111111111';
INSERT INTO public.apd_mobile_push_outbox(event_key,user_id,device_id,offer_fingerprint,source_offer_key,offer_expires_at,status,attempts,lease_id,leased_until)
SELECT repeat('2',63)||suffix,'11111111-1111-4111-8111-111111111111','f1f1f1f1-1111-4111-8111-111111111111',repeat('5',64),'APD:LAB:RECONCILE',now()+interval '1 hour','leased',1,'f4f4f4f4-4444-4444-8444-444444444444',now()+interval '1 minute'
FROM (VALUES ('a'),('b'),('c')) AS x(suffix);
DO $test$
DECLARE e text; d uuid; s text;
BEGIN
 FOR s IN SELECT unnest(ARRAY['a','b','c']) LOOP
 e:=repeat('2',63)||s;
 d:=public.apd_mobile_prepare_dispatch(e,'f4f4f4f4-4444-4444-8444-444444444444');
 IF d IS NULL OR NOT public.apd_mobile_consume_dispatch_lab(e,d,repeat('4',64)) THEN RAISE EXCEPTION 'prepare/consume failed'; END IF;
 IF s<>'c' AND NOT public.apd_mobile_expo_record_ticket(e,d,'reconcile_fixture_'||s||'_1234') THEN RAISE EXCEPTION 'ticket failed'; END IF;
 UPDATE public.apd_mobile_dispatch_authorizations SET authorized_at=now()-interval '20 minutes' WHERE event_key=e;
 END LOOP;
 PERFORM public.apd_mobile_quarantine_stale_dispatch(100);
 IF (SELECT status FROM public.apd_mobile_push_outbox WHERE event_key=repeat('2',63)||'a')<>'dispatching'
 OR (SELECT status FROM public.apd_mobile_push_outbox WHERE event_key=repeat('2',63)||'c')<>'uncertain'
 THEN RAISE EXCEPTION 'premature quarantine or missing orphan quarantine'; END IF;
 e:=repeat('2',63)||'a'; SELECT dispatch_id INTO d FROM public.apd_mobile_dispatch_authorizations WHERE event_key=e;
 IF public.apd_mobile_expo_settle_consumed_receipt_lab(e,d,'wrong_ticket_1234','provider_accepted') THEN RAISE EXCEPTION 'wrong ticket'; END IF;
 IF NOT public.apd_mobile_expo_settle_consumed_receipt_lab(e,d,'reconcile_fixture_a_1234','pending') THEN RAISE EXCEPTION 'pending failed'; END IF;
 IF NOT public.apd_mobile_expo_settle_consumed_receipt_lab(e,d,'reconcile_fixture_a_1234','provider_accepted') THEN RAISE EXCEPTION 'settle failed'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox WHERE event_key=e)<>'sent' OR (SELECT state FROM public.apd_mobile_dispatch_authorizations WHERE event_key=e)<>'accepted' THEN RAISE EXCEPTION 'settle not atomic'; END IF;
 IF public.apd_mobile_expo_settle_consumed_receipt_lab(e,d,'reconcile_fixture_a_1234','provider_accepted') THEN RAISE EXCEPTION 'duplicate receipt'; END IF;
 e:=repeat('2',63)||'b'; SELECT dispatch_id INTO d FROM public.apd_mobile_dispatch_authorizations WHERE event_key=e;
 UPDATE public.apd_mobile_push_devices SET enabled=false,opted_in=false,revoked_at=now() WHERE id='f1f1f1f1-1111-4111-8111-111111111111';
 IF NOT public.apd_mobile_expo_settle_consumed_receipt_lab(e,d,'reconcile_fixture_b_1234','provider_accepted') THEN RAISE EXCEPTION 'late observation lost'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox WHERE event_key=e)<>'cancelled' OR (SELECT tracking_state FROM public.apd_mobile_expo_receipt_correlation WHERE event_key=e)<>'late_audit' THEN RAISE EXCEPTION 'revocation reopened'; END IF;
END $test$;
RESET ROLE;
DO $audit$ BEGIN
 IF has_function_privilege('anon','public.apd_mobile_expo_settle_consumed_receipt_lab(text,uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.apd_mobile_expo_settle_consumed_receipt_lab(text,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'public receipt settlement'; END IF;
END $audit$;
SELECT 'PG17_CONSUMED_RECEIPT_RECONCILIATION_PASS' AS result;

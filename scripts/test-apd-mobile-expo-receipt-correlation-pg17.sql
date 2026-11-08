\set ON_ERROR_STOP on
-- Disposable PG17; run after authorization and concurrency suites.
-- No Expo API, no user PII, no device token, no network.
\ir ../sql/apd_mobile_expo_receipt_correlation_lab_20261108.sql

DO $roles$
BEGIN
 IF has_table_privilege('anon','public.apd_mobile_expo_receipt_correlation','SELECT')
 OR has_table_privilege('authenticated','public.apd_mobile_expo_receipt_correlation','INSERT')
 OR has_function_privilege('anon','public.apd_mobile_expo_record_ticket(text,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.apd_mobile_expo_record_receipt(text,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'PUBLIC EXPO RECEIPT ACCESS LEAKED'; END IF;
 IF NOT has_table_privilege('service_role',
   'public.apd_mobile_expo_receipt_correlation','SELECT')
 OR NOT has_function_privilege('service_role',
   'public.apd_mobile_expo_record_ticket(text,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'SERVICE RECEIPT PERMISSIONS MISSING'; END IF;
 IF (SELECT NOT relrowsecurity OR NOT relforcerowsecurity
  FROM pg_class WHERE oid=
   'public.apd_mobile_expo_receipt_correlation'::regclass)
 THEN RAISE EXCEPTION 'RECEIPT CORRELATION RLS NOT FORCED'; END IF;
END $roles$;

SET ROLE service_role;
INSERT INTO public.apd_mobile_push_outbox(
 event_key,user_id,device_id,offer_fingerprint,source_offer_key,
 offer_expires_at,status,attempts,lease_id,leased_until
) SELECT repeat(e,32),
 '11111111-1111-4111-8111-111111111111'::uuid,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,
 repeat('e',64),'APD:LAB:RECEIPT',
 now()+interval '1 day','leased',1,
 '88888888-8888-4888-8888-888888888888'::uuid,
 now()+interval '10 minutes'
FROM (VALUES ('f1'),('f2'),('f3'),('f4')) AS v(e);

DO $test$
DECLARE e text:=repeat('f1',32); d uuid;
BEGIN
 d=public.apd_mobile_prepare_dispatch(
  e,'88888888-8888-4888-8888-888888888888');
 IF d IS NULL THEN RAISE EXCEPTION 'CORRELATION PREPARE FAILED'; END IF;
 IF public.apd_mobile_expo_record_ticket(e,
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd','ticket_demo_one_1234')
 THEN RAISE EXCEPTION 'WRONG DISPATCH ATTACHED A TICKET'; END IF;
 IF public.apd_mobile_expo_record_ticket(e,d,'bad/id')
 THEN RAISE EXCEPTION 'MALFORMED EXPO TICKET ACCEPTED'; END IF;
 IF NOT public.apd_mobile_expo_record_ticket(e,d,'ticket_demo_one_1234')
 THEN RAISE EXCEPTION 'EXPO TICKET NOT STORED'; END IF;
 IF public.apd_mobile_expo_record_ticket(e,d,'ticket_demo_one_1234')
 THEN RAISE EXCEPTION 'EXPO TICKET DUPLICATE ACCEPTED'; END IF;
 IF public.apd_mobile_expo_record_ticket(e,d,'ticket_demo_two_1234')
 THEN RAISE EXCEPTION 'EXPO TICKET REPLACED'; END IF;
 IF NOT public.apd_mobile_expo_record_receipt(e,d,
  'ticket_demo_one_1234','pending')
 THEN RAISE EXCEPTION 'MISSING RECEIPT CHECK NOT RECORDED'; END IF;
 IF (SELECT receipt_outcome FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=e) IS NOT NULL
 THEN RAISE EXCEPTION 'PENDING RECEIPT MARKED AS SUCCESS'; END IF;
 IF public.apd_mobile_expo_record_receipt(e,d,
  'ticket_demo_two_1234','provider_accepted')
 THEN RAISE EXCEPTION 'MISMATCHED TICKET RECEIPT APPLIED'; END IF;
 IF NOT public.apd_mobile_expo_record_receipt(e,d,
  'ticket_demo_one_1234','provider_accepted')
 THEN RAISE EXCEPTION 'VALID RECEIPT NOT CORRELATED'; END IF;
 IF public.apd_mobile_expo_record_receipt(e,d,
  'ticket_demo_one_1234','provider_rejected')
 THEN RAISE EXCEPTION 'RECEIPT OUTCOME OVERWRITTEN'; END IF;
 IF (SELECT tracking_state FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=e)<>'provider_accepted'
 THEN RAISE EXCEPTION 'PROVIDER ACCEPTANCE NOT AUDITED'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
  WHERE event_key=e)<>'dispatching'
 THEN RAISE EXCEPTION 'LAB CLAIMED MESSAGE WAS SENT'; END IF;
END $test$;

-- Duplicate ticket across two dispatch IDs and uncertain receipt after
-- quarantine. Neither may reopen the outbox or enqueue a resend.
DO $test$
DECLARE e text:=repeat('f2',32);d uuid;
BEGIN
 d=public.apd_mobile_prepare_dispatch(
  e,'88888888-8888-4888-8888-888888888888');
 IF d IS NULL THEN RAISE EXCEPTION 'SECOND DISPATCH SETUP FAILED'; END IF;
 IF public.apd_mobile_expo_record_ticket(e,d,'ticket_demo_one_1234')
 THEN RAISE EXCEPTION 'CROSS-DISPATCH TICKET REUSED'; END IF;
 IF NOT public.apd_mobile_expo_record_ticket(e,d,'ticket_demo_three_1234')
 THEN RAISE EXCEPTION 'SECOND UNIQUE TICKET REJECTED'; END IF;
 IF NOT public.apd_mobile_resolve_dispatch(e,d,'uncertain')
 THEN RAISE EXCEPTION 'UNCERTAIN STATE SETUP FAILED'; END IF;
 IF NOT public.apd_mobile_expo_record_receipt(e,d,
  'ticket_demo_three_1234','provider_accepted')
 THEN RAISE EXCEPTION 'LATE RECEIPT EVIDENCE WAS LOST'; END IF;
 IF (SELECT tracking_state||'|'||late_receipt_audit_only::text
   FROM public.apd_mobile_expo_receipt_correlation
   WHERE event_key=e)<>'late_audit|true'
 THEN RAISE EXCEPTION 'LATE RECEIPT NOT AUDIT-ONLY'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox WHERE event_key=e)
   <>'uncertain'
 THEN RAISE EXCEPTION 'RECEIPT REOPENED QUARANTINED OUTBOX'; END IF;
 IF public.apd_mobile_expo_record_ticket(e,d,'ticket_demo_four_1234')
 THEN RAISE EXCEPTION 'LATE TICKET ALTERED QUARANTINE'; END IF;
END $test$;

-- A device revocation after ticket: receipt is auditable but cannot
-- restore state, reauthorize, or mark delivery.
DO $test$
DECLARE e text:=repeat('f3',32);d uuid;
BEGIN
 d=public.apd_mobile_prepare_dispatch(
  e,'88888888-8888-4888-8888-888888888888');
 IF d IS NULL THEN RAISE EXCEPTION 'REVOCATION TICKET SETUP FAILED'; END IF;
 IF NOT public.apd_mobile_expo_record_ticket(e,d,'ticket_demo_revoke_1234')
 THEN RAISE EXCEPTION 'REVOCATION TICKET NOT STORABLE'; END IF;
 UPDATE public.apd_mobile_push_devices
 SET revoked_at=clock_timestamp()
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 IF NOT public.apd_mobile_expo_record_receipt(e,d,
  'ticket_demo_revoke_1234','invalid_device')
 THEN RAISE EXCEPTION 'REVOKED LATE RECEIPT NOT AUDITED'; END IF;
 IF (SELECT tracking_state FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=e)<>'late_audit'
 THEN RAISE EXCEPTION 'REVOKED RECEIPT CHANGED STATE'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox WHERE event_key=e)
   <>'cancelled'
 THEN RAISE EXCEPTION 'REVOKED OUTBOX REOPENED'; END IF;
 UPDATE public.apd_mobile_push_devices SET revoked_at=NULL
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 IF public.apd_mobile_prepare_dispatch(e,
  '88888888-8888-4888-8888-888888888888') IS NOT NULL
 THEN RAISE EXCEPTION 'REVOKED CORRELATION REAUTHORIZED'; END IF;
END $test$;

-- Ticket cannot be added once reservation has been quarantined.
DO $test$
DECLARE e text:=repeat('f4',32);d uuid;
BEGIN
 d=public.apd_mobile_prepare_dispatch(
  e,'88888888-8888-4888-8888-888888888888');
 IF d IS NULL THEN RAISE EXCEPTION 'QUARANTINE SETUP FAILED'; END IF;
 IF NOT public.apd_mobile_resolve_dispatch(e,d,'uncertain')
 THEN RAISE EXCEPTION 'QUARANTINE SETUP FAILED'; END IF;
 IF public.apd_mobile_expo_record_ticket(e,d,'ticket_demo_late_1234')
 THEN RAISE EXCEPTION 'TICKET ATTACHED TO TERMINAL DISPATCH'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=e)<>0
 THEN RAISE EXCEPTION 'TERMINAL DISPATCH HAS A TICKET'; END IF;
END $test$;
RESET ROLE;
SELECT 'PG17_EXPO_TICKET_RECEIPT_CORRELATION_PASS' AS result;

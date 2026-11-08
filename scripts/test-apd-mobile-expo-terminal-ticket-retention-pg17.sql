\set ON_ERROR_STOP on
-- Last stage of disposable PG17 mobile suite. Never run against production.
\ir ../sql/apd_mobile_expo_terminal_ticket_retention_lab_20261108.sql

DO $security$
BEGIN
 IF has_table_privilege('anon',
  'public.apd_mobile_expo_ticket_tombstones','SELECT')
 OR has_table_privilege('authenticated',
  'public.apd_mobile_expo_ticket_tombstones','INSERT')
 OR has_function_privilege('anon',
  'public.apd_mobile_expo_retire_terminal_tickets(integer,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.apd_mobile_expo_retire_terminal_tickets(integer,integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.apd_mobile_expo_retire_terminal_tickets(integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'BAD TICKET RETENTION GRANTS'; END IF;
 IF (SELECT NOT relrowsecurity OR NOT relforcerowsecurity FROM pg_class
     WHERE oid='public.apd_mobile_expo_ticket_tombstones'::regclass)
 THEN RAISE EXCEPTION 'TOMBSTONE RLS NOT FORCED'; END IF;
 IF has_table_privilege('service_role',
    'public.apd_mobile_expo_ticket_tombstones','DELETE')
 THEN RAISE EXCEPTION 'TOMBSTONE DELETION NOT ALLOWED'; END IF;
END $security$;

SET ROLE service_role;
-- f1 was provider-accepted by the prior disposable correlation suite,
-- but SQL dispatch remains prepared. Finish its *synthetic* acknowledgment.
DO $case$
DECLARE d uuid;
BEGIN
 SELECT dispatch_id INTO d FROM public.apd_mobile_dispatch_authorizations
 WHERE event_key=repeat('f1',32);
 IF d IS NULL OR NOT public.apd_mobile_resolve_dispatch(
  repeat('f1',32),d,'accepted')
 THEN RAISE EXCEPTION 'OLD ACCEPTED TICKET SETUP FAILED'; END IF;
 UPDATE public.apd_mobile_expo_receipt_correlation
 SET ticket_recorded_at=clock_timestamp()-interval '101 days'
 WHERE event_key=repeat('f1',32);
END $case$;

-- A terminal explicit rejection is also a valid privacy-redaction case.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,source_offer_key,
  offer_expires_at,status,attempts,lease_id,leased_until)
VALUES(repeat('f8',32),
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 repeat('e',64),'APD:LAB:RETENTION_REJECTED',
 now()+interval '1 day','leased',1,
 '88888888-8888-4888-8888-888888888888',
 now()+interval '10 minutes');
DO $case$
DECLARE d uuid;
BEGIN
 d=public.apd_mobile_prepare_dispatch(
  repeat('f8',32),'88888888-8888-4888-8888-888888888888');
 IF d IS NULL OR NOT public.apd_mobile_expo_record_ticket(
  repeat('f8',32),d,'ticket_demo_rejected_1234')
 OR NOT public.apd_mobile_expo_record_receipt(
  repeat('f8',32),d,'ticket_demo_rejected_1234','provider_rejected')
 OR NOT public.apd_mobile_resolve_dispatch(repeat('f8',32),d,'rejected')
 THEN RAISE EXCEPTION 'OLD REJECTED TICKET SETUP FAILED'; END IF;
 UPDATE public.apd_mobile_expo_receipt_correlation
 SET ticket_recorded_at=clock_timestamp()-interval '100 days'
 WHERE event_key=repeat('f8',32);
END $case$;

-- Authorization remains pending on this fresh event so a retired ticket
-- can be tested for reuse. No actual Expo call.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,source_offer_key,
  offer_expires_at,status,attempts,lease_id,leased_until)
VALUES(repeat('f9',32),
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 repeat('f',64),'APD:LAB:RETENTION_DUPLICATE',
 now()+interval '1 day','leased',1,
 '88888888-8888-4888-8888-888888888888',
 now()+interval '10 minutes');

DO $case$
DECLARE d uuid;v_total integer;v_count integer;
BEGIN
 -- A single pass cannot retire more than one.
 v_total=public.apd_mobile_expo_retire_terminal_tickets(1,90);
 IF v_total<>1 THEN RAISE EXCEPTION 'RETENTION BATCH LIMIT IGNORED'; END IF;
 IF public.apd_mobile_expo_retire_terminal_tickets(20,90)<>1
 THEN RAISE EXCEPTION 'SECOND RETENTION NOT PERFORMED'; END IF;
 IF public.apd_mobile_expo_retire_terminal_tickets(20,90)<>0
 THEN RAISE EXCEPTION 'REDACTION NOT IDEMPOTENT'; END IF;
 SELECT count(*) INTO v_count
 FROM public.apd_mobile_expo_ticket_tombstones
 WHERE event_key IN (repeat('f1',32),repeat('f8',32));
 IF v_count<>2 THEN RAISE EXCEPTION 'MISSING PRIVACY TOMBSTONES'; END IF;
 SELECT count(*) INTO v_count
 FROM public.apd_mobile_expo_receipt_correlation
 WHERE event_key IN (repeat('f1',32),repeat('f8',32));
 IF v_count<>0 THEN RAISE EXCEPTION 'RAW TICKET NOT REMOVED'; END IF;
 IF EXISTS (SELECT 1 FROM public.apd_mobile_expo_ticket_tombstones
  WHERE ticket_sha256 !~ '^[0-9a-f]{64}$'
  OR last_provider_outcome NOT IN ('provider_accepted','provider_rejected'))
 THEN RAISE EXCEPTION 'INVALID TOMBSTONE'; END IF;
 IF (SELECT ticket_sha256 FROM public.apd_mobile_expo_ticket_tombstones
  WHERE event_key=repeat('f1',32)) IS DISTINCT FROM
    encode(sha256(convert_to('ticket_demo_one_1234','UTF8')),'hex')
 THEN RAISE EXCEPTION 'WRONG TOMBSTONE HASH'; END IF;

 -- Unknown, late and revoked receipts are NEVER eligible for redaction.
 IF (SELECT count(*) FROM public.apd_mobile_expo_receipt_correlation
     WHERE event_key IN (repeat('f2',32),repeat('f3',32),
                         repeat('f5',32),repeat('f6',32),repeat('f7',32)))<>5
 THEN RAISE EXCEPTION 'UNKNOWN OR REVOKED EVIDENCE LOST'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
     WHERE event_key=repeat('f1',32))<>'sent'
 OR (SELECT status FROM public.apd_mobile_push_outbox
     WHERE event_key=repeat('f8',32))<>'dead'
 THEN RAISE EXCEPTION 'RETENTION MUTATED OUTBOX'; END IF;

 d=public.apd_mobile_prepare_dispatch(
  repeat('f9',32),'88888888-8888-4888-8888-888888888888');
 IF d IS NULL THEN RAISE EXCEPTION 'TOMBSTONE REUSE SETUP FAILED'; END IF;
 IF public.apd_mobile_expo_record_ticket(
  repeat('f9',32),d,'ticket_demo_one_1234')
 THEN RAISE EXCEPTION 'RETIRED RAW TICKET WAS REUSED'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=repeat('f9',32))<>0
 THEN RAISE EXCEPTION 'TOMBSTONE REUSE INSERTED RAW TICKET'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(10,60))<>0
 THEN RAISE EXCEPTION 'RETENTION REQUEUED A PROVIDER PUSH'; END IF;
END $case$;

-- Guardrail: 90 days is a hard minimum, no caller-selected 0-day purge.
DO $case$
DECLARE message text;
BEGIN
 BEGIN
  PERFORM public.apd_mobile_expo_retire_terminal_tickets(1,89);
  RAISE EXCEPTION 'DID NOT REJECT 89 DAY RETENTION';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message <> 'invalid expo retention bounds' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.apd_mobile_expo_retire_terminal_tickets(21,90);
  RAISE EXCEPTION 'DID NOT REJECT OVERSIZED RETENTION';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;
  IF message <> 'invalid expo retention bounds' THEN RAISE; END IF;
 END;
END $case$;
RESET ROLE;
SELECT 'PG17_EXPO_TOMBSTONE_RETENTION_90D_PASS' AS result;

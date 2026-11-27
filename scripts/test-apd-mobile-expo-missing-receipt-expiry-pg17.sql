\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 only; after receipt correlation suite.
\ir ../sql/apd_mobile_expo_missing_receipt_expiry_lab_20261108.sql

DO $security$
BEGIN
 IF has_function_privilege('anon',
  'public.apd_mobile_expo_expire_missing_receipts(integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.apd_mobile_expo_record_late_observation(text,uuid,text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.apd_mobile_expo_expire_missing_receipts(integer)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.apd_mobile_expo_record_late_observation(text,uuid,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'INSECURE EXPO EXPIRY RPC GRANTS'; END IF;
END $security$;

SET ROLE service_role;

-- Seed 2 independent authorizations with one 25h-old missing receipt,
-- another 23h-old ticket that should not yet expire.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,source_offer_key,
  offer_expires_at,status,attempts,lease_id,leased_until)
SELECT repeat(e,32),
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 repeat('a',64),'APD:LAB:EXPO:EXPIRE',
 now()+interval '1 day','leased',1,
 '88888888-8888-4888-8888-888888888888',
 now()+interval '10 minutes'
FROM (VALUES ('f5'),('f6')) AS ids(e);

DO $case$
DECLARE old_id uuid;fresh_id uuid;v_count integer;v_late boolean;
BEGIN
 old_id=public.apd_mobile_prepare_dispatch(repeat('f5',32),
   '88888888-8888-4888-8888-888888888888');
 fresh_id=public.apd_mobile_prepare_dispatch(repeat('f6',32),
   '88888888-8888-4888-8888-888888888888');
 IF old_id IS NULL OR fresh_id IS NULL
 THEN RAISE EXCEPTION 'TICKET EXPIRY TEST SETUP FAILED'; END IF;
 IF NOT public.apd_mobile_expo_record_ticket(
  repeat('f5',32),old_id,'ticket_expired_one_123456')
 OR NOT public.apd_mobile_expo_record_ticket(
  repeat('f6',32),fresh_id,'ticket_fresh_two_123456')
 THEN RAISE EXCEPTION 'TICKET EXPIRY CORRELATION SETUP FAILED'; END IF;
 UPDATE public.apd_mobile_expo_receipt_correlation
 SET ticket_recorded_at=clock_timestamp()-interval '25 hours'
 WHERE event_key=repeat('f5',32);
 UPDATE public.apd_mobile_expo_receipt_correlation
 SET ticket_recorded_at=clock_timestamp()-interval '23 hours'
 WHERE event_key=repeat('f6',32);

 v_count=public.apd_mobile_expo_expire_missing_receipts(1);
 IF v_count<>1 THEN RAISE EXCEPTION 'DID NOT EXPIRE EXACTLY ONE 25H TICKET'; END IF;
 IF public.apd_mobile_expo_expire_missing_receipts(20)<>0
 THEN RAISE EXCEPTION 'DUPLICATE EXPIRY OR PREMATURE 23H EXPIRY'; END IF;

 IF (SELECT status FROM public.apd_mobile_push_outbox
  WHERE event_key=repeat('f5',32))<>'uncertain'
 OR (SELECT state FROM public.apd_mobile_dispatch_authorizations
  WHERE event_key=repeat('f5',32))<>'uncertain'
 OR (SELECT tracking_state||'|'||receipt_outcome
  FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=repeat('f5',32))<>'uncertain|uncertain'
 THEN RAISE EXCEPTION 'EXPIRED RECEIPT FAILED CLOSED'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
  WHERE event_key=repeat('f6',32))<>'dispatching'
 OR (SELECT tracking_state FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=repeat('f6',32))<>'awaiting_receipt'
 THEN RAISE EXCEPTION 'YOUNG TICKET EXPIRED'; END IF;

 IF public.apd_mobile_expo_record_receipt(
   repeat('f5',32),old_id,'ticket_expired_one_123456','provider_accepted')
 THEN RAISE EXCEPTION 'EXPIRED UNKNOWN OVERWRITTEN AS PROVIDER ACCEPTED'; END IF;
 IF public.apd_mobile_expo_record_late_observation(
   repeat('f5',32),old_id,'wrong_ticket_123456','provider_accepted')
 THEN RAISE EXCEPTION 'SPOOFED LATE TICKET ACCEPTED'; END IF;
 v_late=public.apd_mobile_expo_record_late_observation(
   repeat('f5',32),old_id,'ticket_expired_one_123456','provider_accepted');
 IF v_late IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'LATE OBSERVATION LOST'; END IF;
 IF public.apd_mobile_expo_record_late_observation(
   repeat('f5',32),old_id,'ticket_expired_one_123456','provider_rejected')
 THEN RAISE EXCEPTION 'LATE OBSERVATION REWRITTEN'; END IF;
 IF (SELECT receipt_outcome||'|'||late_observed_outcome
  FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=repeat('f5',32))<>'uncertain|provider_accepted'
 THEN RAISE EXCEPTION 'EXPIRED AND LATE EVIDENCE WERE NOT SEPARATE'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
  WHERE event_key=repeat('f5',32))<>'uncertain'
 THEN RAISE EXCEPTION 'LATE RECEIPT REOPENED OUTBOX'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(10,60))<>0
 THEN RAISE EXCEPTION 'EXPIRED RECEIPT REQUEUED A PUSH'; END IF;
END $case$;

-- Another 25h pending receipt becomes late_audit if device was revoked
-- before expiry; never change the canceled outbox into another state.
INSERT INTO public.apd_mobile_push_outbox
 (event_key,user_id,device_id,offer_fingerprint,source_offer_key,
  offer_expires_at,status,attempts,lease_id,leased_until)
VALUES(repeat('f7',32),
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 repeat('b',64),'APD:LAB:EXPO:REVOKED',
 now()+interval '1 day','leased',1,
 '88888888-8888-4888-8888-888888888888',
 now()+interval '10 minutes');

DO $case$
DECLARE v_id uuid;
BEGIN
 v_id=public.apd_mobile_prepare_dispatch(
  repeat('f7',32),'88888888-8888-4888-8888-888888888888');
 IF v_id IS NULL OR NOT public.apd_mobile_expo_record_ticket(
  repeat('f7',32),v_id,'ticket_revoked_three_123456')
 THEN RAISE EXCEPTION 'REVOKED RECEIPT SETUP FAILED'; END IF;
 UPDATE public.apd_mobile_expo_receipt_correlation
 SET ticket_recorded_at=clock_timestamp()-interval '25 hours'
 WHERE event_key=repeat('f7',32);

 UPDATE public.apd_mobile_push_devices
 SET revoked_at=clock_timestamp()
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 IF public.apd_mobile_expo_expire_missing_receipts(20)<>1
 THEN RAISE EXCEPTION 'REVOKED MISSING RECEIPT NOT AUDITED'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
  WHERE event_key=repeat('f7',32))<>'cancelled'
 OR (SELECT state FROM public.apd_mobile_dispatch_authorizations
  WHERE event_key=repeat('f7',32))<>'revoked'
 OR (SELECT tracking_state||'|'||late_receipt_audit_only::text
  FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=repeat('f7',32))<>'late_audit|true'
 THEN RAISE EXCEPTION 'EXPIRY REOPENED REVOKED DISPATCH'; END IF;
 IF NOT public.apd_mobile_expo_record_late_observation(
  repeat('f7',32),v_id,'ticket_revoked_three_123456','invalid_device')
 THEN RAISE EXCEPTION 'REVOKED LATE OBSERVATION NOT AUDITABLE'; END IF;
 IF (SELECT late_observed_outcome
  FROM public.apd_mobile_expo_receipt_correlation
  WHERE event_key=repeat('f7',32))<>'invalid_device'
 THEN RAISE EXCEPTION 'REVOKED LATE EVIDENCE NOT PRESERVED'; END IF;
 UPDATE public.apd_mobile_push_devices SET revoked_at=NULL
 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
END $case$;

RESET ROLE;
SELECT 'PG17_EXPO_24H_MISSING_RECEIPT_EXPIRY_PASS' AS result;

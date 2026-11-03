\set ON_ERROR_STOP on
-- CI PostgreSQL 17, disposable DB only. No Supabase, users or credentials.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.users (
 id uuid PRIMARY KEY, activo boolean NOT NULL DEFAULT true
);
INSERT INTO public.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
\ir ../sql/apd_mobile_push_private_candidate_20261103.sql
DO $test$
BEGIN
 IF has_table_privilege('anon','public.apd_mobile_push_devices','SELECT')
 OR has_table_privilege('authenticated','public.apd_mobile_push_devices','INSERT')
 OR has_table_privilege('anon','public.apd_mobile_push_outbox','SELECT')
 OR has_table_privilege('authenticated','public.apd_mobile_push_outbox','UPDATE')
 OR has_function_privilege('anon','public.apd_mobile_claim_push(integer,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.apd_mobile_finish_push(text,uuid,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'UNSAFE PUBLIC ACCESS'; END IF;
 IF NOT has_table_privilege('service_role','public.apd_mobile_push_devices','INSERT')
 OR NOT has_table_privilege('service_role','public.apd_mobile_push_outbox','UPDATE')
 OR NOT has_function_privilege('service_role','public.apd_mobile_claim_push(integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Service role cannot safely operate'; END IF;
 IF (SELECT NOT relrowsecurity OR NOT relforcerowsecurity
      FROM pg_class WHERE oid='public.apd_mobile_push_devices'::regclass)
 OR (SELECT NOT relrowsecurity OR NOT relforcerowsecurity
      FROM pg_class WHERE oid='public.apd_mobile_push_outbox'::regclass)
 THEN RAISE EXCEPTION 'RLS not forced'; END IF;
END $test$;

SET ROLE service_role;
-- Everything below is synthetic test data. Ciphertext field is a dummy token-like
-- lab marker; production Worker must generate AES-GCM ciphertext, never plaintext.
INSERT INTO public.apd_mobile_push_devices
(id,user_id,platform,transport,token_hash,token_ciphertext,opted_in,enabled)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','android','expo',
  repeat('a',64),repeat('Q',64),true,true),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222','ios','apns',
  repeat('b',64),repeat('Z',64),true,true);

INSERT INTO public.apd_mobile_push_outbox
(event_key,user_id,device_id,offer_fingerprint,offer_expires_at)
VALUES
 (repeat('1',64),'11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),now()+interval '1 day'),
 (repeat('2',64),'22222222-2222-4222-8222-222222222222',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',repeat('b',64),now()+interval '1 day');

DO $test$
DECLARE v_claim record;
BEGIN
 SELECT * INTO v_claim FROM public.apd_mobile_claim_push(1,60);
 IF v_claim.event_key IS NULL OR v_claim.attempts<>1 THEN
  RAISE EXCEPTION 'Expected first atomic claim'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(1,60))<>1 THEN
  RAISE EXCEPTION 'Expected second disjoint claim'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(1,60))<>0 THEN
  RAISE EXCEPTION 'Double claim was possible'; END IF;
 IF public.apd_mobile_finish_push(v_claim.event_key,
       'dddddddd-dddd-4ddd-8ddd-dddddddddddd',true)
 THEN RAISE EXCEPTION 'Accepted wrong lease'; END IF;
 IF NOT public.apd_mobile_finish_push(
   v_claim.event_key,v_claim.lease_id,true)
 THEN RAISE EXCEPTION 'Valid lease not acknowledged'; END IF;
 IF public.apd_mobile_finish_push(
   v_claim.event_key,v_claim.lease_id,true)
 THEN RAISE EXCEPTION 'Duplicate completion accepted'; END IF;
 IF (SELECT status FROM public.apd_mobile_push_outbox
    WHERE event_key=v_claim.event_key)<>'sent'
 THEN RAISE EXCEPTION 'Expected sent state'; END IF;
END $test$;

-- Revoke the second device while it has a live claimed event.
UPDATE public.apd_mobile_push_devices SET enabled=false,opted_in=false,
 revoked_at=now() WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $test$
BEGIN
 IF (SELECT status FROM public.apd_mobile_push_outbox
    WHERE event_key=repeat('2',64))<>'cancelled'
 THEN RAISE EXCEPTION 'Revocation did not cancel live lease'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(10,60))<>0
 THEN RAISE EXCEPTION 'Revoked device got a new claim'; END IF;
END $test$;

-- A user cannot enqueue an event for a device of another account; composite
-- foreign key must reject mismatched device_id+user_id.
DO $test$
BEGIN
 BEGIN
  INSERT INTO public.apd_mobile_push_outbox(
   event_key,user_id,device_id,offer_fingerprint,offer_expires_at)
  VALUES (repeat('3',64),'22222222-2222-4222-8222-222222222222',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),
    now()+interval '1 day');
  RAISE EXCEPTION 'Cross-user enqueue accepted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.apd_mobile_push_outbox(
   event_key,user_id,device_id,offer_fingerprint,offer_expires_at)
  VALUES (repeat('1',64),'11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),
    now()+interval '1 day');
  RAISE EXCEPTION 'Duplicate event accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.apd_mobile_push_devices(
   id,user_id,platform,transport,token_hash,token_ciphertext,opted_in,enabled)
  VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
   '11111111-1111-4111-8111-111111111111','android','expo',
    repeat('a',64),repeat('Y',64),true,true);
  RAISE EXCEPTION 'Active token hash collision accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
END $test$;

-- Do not claim outdated/offline offers even with a consenting active device.
INSERT INTO public.apd_mobile_push_outbox(
 event_key,user_id,device_id,offer_fingerprint,offer_expires_at)
VALUES (repeat('4',64),'11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('d',64),
 now()-interval '1 second');
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.apd_mobile_claim_push(10,60))<>0
 THEN RAISE EXCEPTION 'Expired offer was claimed'; END IF;
END $test$;

RESET ROLE;
-- Functions remain strictly service-only.
DO $test$
BEGIN
 IF has_function_privilege('anon','public.apd_mobile_claim_push(integer,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.apd_mobile_finish_push(text,uuid,boolean)','EXECUTE')
 THEN RAISE EXCEPTION 'Function privilege leak'; END IF;
END $test$;

SELECT 'APD_MOBILE_PG17_RLS_OWNER_ATOMIC_CLAIM_REVOKE_DEDUP_OK' AS result;

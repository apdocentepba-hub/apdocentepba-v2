\set ON_ERROR_STOP on
\ir ../sql/apd_mobile_consume_dispatch_lab_20261126.sql
DO $test$
BEGIN
 IF has_function_privilege('anon','public.apd_mobile_consume_dispatch_lab(text,uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.apd_mobile_consume_dispatch_lab(text,uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'public consumption'; END IF;
END $test$;
SET ROLE service_role;
INSERT INTO public.apd_mobile_push_devices(id,user_id,platform,transport,token_hash,token_ciphertext,enabled,opted_in)
VALUES ('f1f1f1f1-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','android','expo',repeat('1',64),repeat('Q',80),true,true);
INSERT INTO public.apd_mobile_push_outbox(event_key,user_id,device_id,offer_fingerprint,source_offer_key,offer_expires_at,status,attempts,lease_id,leased_until)
VALUES (repeat('1',63)||'a','11111111-1111-4111-8111-111111111111','f1f1f1f1-1111-4111-8111-111111111111',repeat('2',64),'APD:LAB:CONSUME',now()+interval '1 hour','leased',1,'f2f2f2f2-2222-4222-8222-222222222222',now()+interval '1 minute'),
(repeat('1',63)||'b','11111111-1111-4111-8111-111111111111','f1f1f1f1-1111-4111-8111-111111111111',repeat('3',64),'APD:LAB:ROTATE',now()+interval '1 hour','leased',1,'f3f3f3f3-3333-4333-8333-333333333333',now()+interval '1 minute');
DO $test$
DECLARE e text:=repeat('1',63)||'a'; d uuid;
BEGIN
 d:=public.apd_mobile_prepare_dispatch(e,'f2f2f2f2-2222-4222-8222-222222222222');
 IF d IS NULL THEN RAISE EXCEPTION 'prepare failed'; END IF;
 IF public.apd_mobile_consume_dispatch_lab(e,d,repeat('0',64)) THEN RAISE EXCEPTION 'wrong recipient accepted'; END IF;
 IF NOT public.apd_mobile_consume_dispatch_lab(e,d,repeat('1',64)) THEN RAISE EXCEPTION 'valid recipient denied'; END IF;
 IF public.apd_mobile_consume_dispatch_lab(e,d,repeat('1',64)) THEN RAISE EXCEPTION 'replay accepted'; END IF;
END $test$;
-- Independent transaction confirms persistence rather than an in-memory lock.
DO $test$
DECLARE e text:=repeat('1',63)||'a'; d uuid;
BEGIN
 SELECT dispatch_id INTO d FROM public.apd_mobile_dispatch_authorizations WHERE event_key=e;
 IF public.apd_mobile_consume_dispatch_lab(e,d,repeat('1',64)) THEN RAISE EXCEPTION 'durable replay accepted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.apd_mobile_dispatch_authorizations WHERE event_key=e AND consumed_at IS NOT NULL AND recipient_token_hash=repeat('1',64)) THEN RAISE EXCEPTION 'missing durable binding'; END IF;
END $test$;
DO $test$
DECLARE e text:=repeat('1',63)||'b'; d uuid;
BEGIN
 d:=public.apd_mobile_prepare_dispatch(e,'f3f3f3f3-3333-4333-8333-333333333333');
 IF d IS NULL THEN RAISE EXCEPTION 'prepare rotation failed'; END IF;
 UPDATE public.apd_mobile_push_devices SET token_hash=repeat('4',64) WHERE id='f1f1f1f1-1111-4111-8111-111111111111';
 IF public.apd_mobile_consume_dispatch_lab(e,d,repeat('1',64)) THEN RAISE EXCEPTION 'old recipient accepted'; END IF;
 UPDATE public.apd_mobile_push_devices SET enabled=false,opted_in=false,revoked_at=clock_timestamp() WHERE id='f1f1f1f1-1111-4111-8111-111111111111';
 IF public.apd_mobile_consume_dispatch_lab(e,d,repeat('4',64)) THEN RAISE EXCEPTION 'revoked recipient accepted'; END IF;
END $test$;
RESET ROLE;
SELECT 'APD_CONSUME_DISPATCH_PG17_PASS' AS result;

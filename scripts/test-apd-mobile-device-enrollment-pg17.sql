\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.users(id) VALUES('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
DO $$
DECLARE a uuid:='11111111-1111-4111-8111-111111111111'; b uuid:='22222222-2222-4222-8222-222222222222'; d uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; e uuid:='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; h text:=repeat('a',64); c text:=repeat('b',60); n int;
BEGIN
 IF has_function_privilege('anon','public.apd_mobile_register_device_lab(uuid,uuid,text,text,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.apd_mobile_revoke_device_lab(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'grant leak'; END IF;
 SELECT count(*) INTO n FROM public.apd_mobile_register_device_lab(a,d,'android','expo',h,c);
 IF n<>1 THEN RAISE EXCEPTION 'register failed'; END IF;
 SELECT count(*) INTO n FROM public.apd_mobile_register_device_lab(b,d,'android','expo',h,c);
 IF n<>0 THEN RAISE EXCEPTION 'owner takeover'; END IF;
 SELECT count(*) INTO n FROM public.apd_mobile_register_device_lab(b,e,'android','expo',h,c);
 IF n<>0 THEN RAISE EXCEPTION 'duplicate token'; END IF;
 SELECT count(*) INTO n FROM public.apd_mobile_register_device_lab(a,d,'android','expo',repeat('c',64),c);
 IF n<>0 THEN RAISE EXCEPTION 'live token rotation'; END IF;
 IF public.apd_mobile_revoke_device_lab(b,d) THEN RAISE EXCEPTION 'foreign revoke'; END IF;
 INSERT INTO public.apd_mobile_push_outbox(event_key,user_id,device_id,offer_fingerprint,source_offer_key,offer_expires_at)
 VALUES(repeat('d',64),a,d,repeat('e',64),'fixture',now()+interval '1 hour');
 IF NOT public.apd_mobile_revoke_device_lab(a,d) THEN RAISE EXCEPTION 'revoke failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.apd_mobile_push_outbox WHERE event_key=repeat('d',64) AND status='cancelled') THEN RAISE EXCEPTION 'outbox not cancelled'; END IF;
 SELECT count(*) INTO n FROM public.apd_mobile_register_device_lab(a,d,'android','expo',repeat('c',64),c);
 IF n<>1 THEN RAISE EXCEPTION 'consented re-register failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.apd_mobile_push_outbox WHERE event_key=repeat('d',64) AND status='cancelled') THEN RAISE EXCEPTION 'cancelled work revived'; END IF;
END;$$;
ROLLBACK;
\echo APD_DEVICE_ENROLLMENT_OWNER_TOKEN_REVOKE_PASS

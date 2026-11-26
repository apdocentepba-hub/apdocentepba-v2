-- Run after payment tests. The fixture's synthetic rejected checkout is not an open production session.
UPDATE public.mercadopago_checkout_sessions SET status='rejected' WHERE external_reference='qa-invalid';
GRANT INSERT ON public.mercadopago_checkout_sessions TO service_role;
INSERT INTO public.users(id,activo) VALUES ('00000000-0000-4000-8000-000000000005',true),('00000000-0000-4000-8000-000000000006',true);
SET ROLE service_role;
DO $$ BEGIN
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000005')->>'reason'<>'release_disabled' THEN RAISE EXCEPTION 'catalog gate'; END IF;
END $$;
RESET ROLE;
UPDATE public.subscription_plans SET is_active=true WHERE code='FREE';
DO $$ BEGIN
 IF has_function_privilege('anon','public.apd_reserve_complete_checkout(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.apd_finalize_complete_checkout(uuid,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'RPC exposed'; END IF;
END $$;
SET ROLE service_role;
DO $$ DECLARE r jsonb; ref text; uid uuid:='00000000-0000-4000-8000-000000000005'; u text:='https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=fixture'; BEGIN
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000002')->>'reason'<>'existing_contract' THEN RAISE EXCEPTION 'legacy contract'; END IF;
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000001')->>'reason'<>'existing_contract' THEN RAISE EXCEPTION 'already paid'; END IF;
 IF public.apd_reserve_complete_checkout('00000000-0000-4000-8000-000000000003')->>'reason'<>'account_unavailable' THEN RAISE EXCEPTION 'disabled account'; END IF;
 r=public.apd_reserve_complete_checkout(uid); ref=r->>'reference';
 IF r->>'mode'<>'create' OR ref IS NULL THEN RAISE EXCEPTION 'reservation failed'; END IF;
 IF public.apd_reserve_complete_checkout(uid)->>'reason'<>'checkout_in_progress' OR public.apd_reserve_complete_checkout(uid)->>'reference' IS DISTINCT FROM ref THEN RAISE EXCEPTION 'duplicate provider call'; END IF;
 IF public.apd_finalize_complete_checkout(uid,ref,'https://example.invalid/checkout/','fixture')->>'reason'<>'invalid_provider_response' THEN RAISE EXCEPTION 'unsafe URL'; END IF;
 u:='https://www.mercadopago.com/mla/checkout/start?pref_id=fixture';
 IF public.apd_finalize_complete_checkout(uid,ref,u,'fixture')->>'ok'<>'true' THEN RAISE EXCEPTION 'finalize failed'; END IF;
 IF public.apd_finalize_complete_checkout(uid,ref,u,'fixture')->>'duplicate'<>'true' THEN RAISE EXCEPTION 'finalize duplicate'; END IF;
 r=public.apd_reserve_complete_checkout(uid);
 IF r->>'mode'<>'reuse' OR r->>'checkout_url'<>u THEN RAISE EXCEPTION 'checkout reuse'; END IF;
END $$;
RESET ROLE;

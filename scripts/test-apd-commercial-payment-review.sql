
DO $$ BEGIN
 IF has_function_privilege('anon','public.apd_review_complete_payment(text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Review RPC exposed'; END IF;
END $$;
SET ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
 r=public.apd_review_complete_payment('100','qa-a','review');
 IF r->>'disposition' IS DISTINCT FROM 'review' THEN RAISE EXCEPTION 'Review failed: %',r; END IF;
 IF (SELECT status FROM public.user_subscriptions WHERE external_reference='qa-a') IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'Review revoked active access'; END IF;
 r=public.apd_review_complete_payment('100','qa-a','revoke');
 IF r->>'disposition' IS DISTINCT FROM 'revoke' THEN RAISE EXCEPTION 'Revocation failed: %',r; END IF;
 IF (SELECT status FROM public.user_subscriptions WHERE external_reference='qa-a') IS DISTINCT FROM 'CANCELLED' THEN RAISE EXCEPTION 'Linked entitlement not revoked'; END IF;
 IF public.apd_review_complete_payment('100','qa-a','review')->>'disposition' IS DISTINCT FROM 'revoke' THEN RAISE EXCEPTION 'Revoke regressed'; END IF;
 IF public.apd_apply_complete_approval('100','qa-a','approved',2000,'ARS',now())->>'reason' IS DISTINCT FROM 'payment_under_review' THEN RAISE EXCEPTION 'Replayed approval'; END IF;
 IF public.apd_review_complete_payment('100','qa-b','revoke')->>'reason' IS DISTINCT FROM 'payment_or_checkout_conflict' THEN RAISE EXCEPTION 'Wrong checkout affected'; END IF;
 IF (SELECT status FROM public.user_subscriptions WHERE external_reference='qa-b') IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'Unrelated entitlement changed'; END IF;
 IF public.apd_review_complete_payment('103','qa-invalid','revoke')->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Early reversal failed'; END IF;
 IF public.apd_apply_complete_approval('103','qa-invalid','approved',2000,'ARS',now())->>'reason' IS DISTINCT FROM 'payment_under_review' THEN RAISE EXCEPTION 'Early reversal replay'; END IF;
END $$;
RESET ROLE;

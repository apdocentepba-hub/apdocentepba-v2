-- APD expiration and billing safety — STAGED MIGRATION (do not auto-run).
-- Apply only after validating service-role access and the verified Worker bundle.
BEGIN;

-- Mirna's existing administrator-authorized, unlimited Insigne grant was
-- historically saved as trial_auto_register with no current_period_ends_at.
-- Preserve the grant, mark it explicitly so the Worker can recognize it.
DO $$
DECLARE
  target_user uuid;
  changed integer;
BEGIN
  SELECT id INTO STRICT target_user
  FROM public.users
  WHERE lower(trim(nombre)) = 'mirna romina'
    AND lower(trim(apellido)) = 'cardoso';
  UPDATE public.user_subscriptions
     SET source = 'manual_admin_grant', updated_at = now()
   WHERE user_id = target_user
     AND plan_code = 'INSIGNE'
     AND status = 'ACTIVE'
     AND source = 'trial_auto_register'
     AND current_period_ends_at IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one manual grant for Mirna, changed %', changed;
  END IF;
END $$;

-- User-subscription billing rows must never be mutable with the browser anon key.
-- The production Worker uses the server-side service_role credentials.
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_subscriptions FROM anon, authenticated;

COMMIT;

-- Read-only smoke checks after applying:
-- SELECT nombre, apellido, plan_code, status, source, current_period_ends_at
-- FROM public.users u JOIN public.user_subscriptions s ON s.user_id = u.id
-- WHERE lower(u.apellido) = 'cardoso';
-- SELECT has_table_privilege('anon','public.user_subscriptions','update');
-- SELECT has_table_privilege('service_role','public.user_subscriptions','select');

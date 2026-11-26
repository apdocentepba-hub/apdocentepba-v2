-- Operator-reviewed transaction. Do not run before explicit publication authorization,
-- confirmed Worker/frontend release, schema/permissions validation and recoverable backup.
-- Activates the new access model WITHOUT opening admission or changing legacy rows.
BEGIN;
SELECT pg_advisory_xact_lock(170394,20261125);
DO $gate$
DECLARE affected integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.apd_commercial_release_control WHERE singleton AND enrollment_open IS FALSE)
 THEN RAISE EXCEPTION 'Admission must remain closed'; END IF;
 IF has_table_privilege('service_role','public.apd_commercial_release_control','UPDATE') OR has_table_privilege('service_role','public.apd_commercial_release_control','DELETE') OR has_table_privilege('service_role','public.apd_commercial_release_control','TRUNCATE')
 THEN RAISE EXCEPTION 'Release control not operator-only'; END IF;
 IF (SELECT count(*) FROM public.subscription_plans WHERE NOT is_active AND NOT public_visible AND
 ((code='FREE' AND price_ars=0 AND trial_days=0 AND max_distritos=1 AND max_cargos=1)
 OR (code='TRIAL_14D' AND price_ars=0 AND trial_days=14 AND max_distritos=5 AND max_cargos=10)
 OR (code='COMPLETO' AND price_ars=2000 AND trial_days=0 AND max_distritos=5 AND max_cargos=10)) AND mercadopago_plan_id IS NULL)<>3
 THEN RAISE EXCEPTION 'Unexpected staged catalog'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_subscriptions WHERE plan_code IN ('FREE','TRIAL_14D','COMPLETO'))
 THEN RAISE EXCEPTION 'Existing commercial rights: do not reinitialize'; END IF;
 UPDATE public.subscription_plans SET is_active=true,public_visible=(code<>'TRIAL_14D')
 WHERE code IN ('FREE','TRIAL_14D','COMPLETO') AND NOT is_active AND NOT public_visible;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>3 THEN RAISE EXCEPTION 'Catalog activation incomplete'; END IF;
END $gate$;
COMMIT;

-- APD-006: review candidate, never execute automatically against production.
-- Apply only after backup, ACL snapshot, dependency review and explicit approval.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE t text; oid_table oid;
BEGIN
 FOREACH t IN ARRAY ARRAY['alert_history','alert_notifications','mercadopago_checkout_sessions','mercadopago_webhook_events','sessions','user_identity_profile','webpush_subscriptions'] LOOP
  SELECT c.oid INTO oid_table FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname=t AND c.relkind='r' AND c.relrowsecurity;
  IF oid_table IS NULL OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=oid_table) THEN
   RAISE EXCEPTION 'Unexpected table or policy state: %',t;
  END IF;
  IF NOT has_table_privilege('service_role',oid_table,'SELECT') OR NOT has_table_privilege('service_role',oid_table,'INSERT') OR NOT has_table_privilege('service_role',oid_table,'UPDATE') OR NOT has_table_privilege('service_role',oid_table,'DELETE') THEN
   RAISE EXCEPTION 'Unexpected backend ACL: %',t;
  END IF;
  EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated, PUBLIC',t);
  FOR oid_table IN SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t LOOP
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated']) r(role_name) CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(priv) WHERE has_table_privilege(r.role_name,oid_table,p.priv)) THEN
    RAISE EXCEPTION 'Residual inherited privileges: %',t;
   END IF;
   IF NOT has_table_privilege('service_role',oid_table,'SELECT') OR NOT has_table_privilege('service_role',oid_table,'INSERT') OR NOT has_table_privilege('service_role',oid_table,'UPDATE') OR NOT has_table_privilege('service_role',oid_table,'DELETE') THEN
    RAISE EXCEPTION 'Backend ACL changed unexpectedly: %',t;
   END IF;
  END LOOP;
 END LOOP;
END $guard$;
COMMIT;

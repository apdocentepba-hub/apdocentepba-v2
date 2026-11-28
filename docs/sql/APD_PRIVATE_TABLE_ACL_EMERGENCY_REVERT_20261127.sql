-- APD-006: emergency compensation for the exact observed ACL revision.
-- Restores the old, overbroad grants. NEVER execute automatically or as routine rollback.
-- Requires incident owner approval and exact post-migration ACL/owner/RLS match.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE t text; oid_table oid;
DECLARE expected text[] := ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'];
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Original grantor required'; END IF;
 FOREACH t IN ARRAY ARRAY['alert_history','alert_notifications','mercadopago_checkout_sessions','mercadopago_webhook_events','sessions','user_identity_profile','webpush_subscriptions'] LOOP
  EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
  SELECT c.oid INTO STRICT oid_table FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relkind='r' AND c.relrowsecurity AND c.relowner='postgres'::regrole;
  IF EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=oid_table) THEN RAISE EXCEPTION 'Unexpected policy: %',t; END IF;
  IF EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=oid_table AND (a.grantor<>'postgres'::regrole OR a.grantee NOT IN ('postgres'::regrole,'service_role'::regrole) OR a.is_grantable))
   OR (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=oid_table)<>16
   OR EXISTS(SELECT 1 FROM unnest(ARRAY['postgres','service_role']) r(role_name) WHERE (SELECT array_agg(a.privilege_type ORDER BY a.privilege_type) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=oid_table AND a.grantee=r.role_name::regrole) IS DISTINCT FROM expected)
  THEN RAISE EXCEPTION 'Post-migration ACL drift: %',t; END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.%I TO anon, authenticated',t);
  IF (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=oid_table)<>32 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=oid_table AND (a.grantor<>'postgres'::regrole OR a.is_grantable))
  THEN RAISE EXCEPTION 'Restored ACL mismatch: %',t; END IF;
 END LOOP;
END $guard$;
COMMIT;

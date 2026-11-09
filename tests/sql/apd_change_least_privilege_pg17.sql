-- Discardable PG17 staging ROLE CONTRACT ONLY.
-- Never run on Supabase production. Not a deployment migration.
-- Owner is NOLOGIN, NOSUPERUSER, NOBYPASSRLS; the ingest role sees only
-- carefully constrained entrypoints, NOT the tables or original procedures.
BEGIN;
CREATE ROLE apd_lab_function_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE apd_lab_ingest NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE apd_lab_observer NOLOGIN NOSUPERUSER NOBYPASSRLS;

GRANT USAGE ON SCHEMA apd_change_lab TO
 apd_lab_function_owner,apd_lab_ingest;
-- Needed temporarily to transfer ownership, revoked before commit.
GRANT CREATE ON SCHEMA apd_change_lab TO apd_lab_function_owner;
GRANT SELECT,INSERT,DELETE ON apd_change_lab.captures TO apd_lab_function_owner;
GRANT SELECT,INSERT,DELETE ON apd_change_lab.audit_events TO apd_lab_function_owner;

-- A policy for the specific NOLOGIN function owner only. App role still has
-- no direct table grants; public/observer/guest roles have no policy.
CREATE POLICY apd_fn_capture ON apd_change_lab.captures
 FOR ALL TO apd_lab_function_owner USING(true) WITH CHECK(true);
CREATE POLICY apd_fn_audit ON apd_change_lab.audit_events
 FOR ALL TO apd_lab_function_owner USING(true) WITH CHECK(true);

GRANT EXECUTE ON FUNCTION apd_change_lab.save_compact(jsonb,boolean)
 TO apd_lab_function_owner;
GRANT EXECUTE ON FUNCTION apd_change_lab.record_audit_batch(jsonb,boolean)
 TO apd_lab_function_owner;

-- No injection flag in either external signature, always false internally.
CREATE FUNCTION apd_change_lab.submit_compact(p_snapshot jsonb)
RETURNS TABLE(applied boolean,retained integer,total_bytes bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,apd_change_lab,pg_temp
AS $$
BEGIN
 RETURN QUERY SELECT * FROM apd_change_lab.save_compact(p_snapshot,false);
END
$$;
REVOKE ALL ON FUNCTION apd_change_lab.submit_compact(jsonb) FROM PUBLIC;
ALTER FUNCTION apd_change_lab.submit_compact(jsonb)
 OWNER TO apd_lab_function_owner;
GRANT EXECUTE ON FUNCTION apd_change_lab.submit_compact(jsonb)
 TO apd_lab_ingest;

CREATE FUNCTION apd_change_lab.submit_audit(p_batch jsonb)
RETURNS TABLE(added integer,retained integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,apd_change_lab,pg_temp
AS $$
BEGIN
 RETURN QUERY SELECT * FROM apd_change_lab.record_audit_batch(p_batch,false);
END
$$;
REVOKE ALL ON FUNCTION apd_change_lab.submit_audit(jsonb) FROM PUBLIC;
ALTER FUNCTION apd_change_lab.submit_audit(jsonb)
 OWNER TO apd_lab_function_owner;
GRANT EXECUTE ON FUNCTION apd_change_lab.submit_audit(jsonb)
 TO apd_lab_ingest;
REVOKE CREATE ON SCHEMA apd_change_lab FROM apd_lab_function_owner;
COMMIT;

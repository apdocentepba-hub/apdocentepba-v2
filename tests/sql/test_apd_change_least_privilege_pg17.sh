#!/usr/bin/env bash
# Run only against ephemeral postgres:17 CI service, not user Supabase.
set -euo pipefail
if [[ "${PGHOST:-}" != "localhost" || "${PGDATABASE:-}" != "apd_ci" ||
      "${PGUSER:-}" != "apd_ci" ]]; then
  echo 'APD_ROLE_LAB_DISABLED: disposable PG17 required' >&2
  exit 2
fi
psql -X -v ON_ERROR_STOP=1 -f tests/sql/apd_change_least_privilege_pg17.sql

psql -X -v ON_ERROR_STOP=1 <<'SQL'
-- Validate role attributes and no direct grant to the app ingest role.
DO $verify$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN (
    'apd_lab_ingest','apd_lab_observer','apd_lab_function_owner')
  AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
  RAISE EXCEPTION 'App and function roles must never bypass RLS or login';
 END IF;
 IF has_table_privilege('apd_lab_ingest',
      'apd_change_lab.captures','SELECT,INSERT,UPDATE,DELETE') OR
    has_table_privilege('apd_lab_ingest',
      'apd_change_lab.audit_events','SELECT,INSERT,UPDATE,DELETE') OR
    has_schema_privilege('apd_lab_ingest','apd_change_lab','CREATE') OR
    has_schema_privilege('apd_lab_function_owner','apd_change_lab','CREATE') OR
    has_function_privilege('apd_lab_ingest',
      'apd_change_lab.save_compact(jsonb,boolean)','EXECUTE') OR
    has_function_privilege('apd_lab_ingest',
      'apd_change_lab.record_audit_batch(jsonb,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Ingest can bypass validated entrypoint or modify SQL';
 END IF;
 IF NOT has_function_privilege('apd_lab_ingest',
      'apd_change_lab.submit_compact(jsonb)','EXECUTE') OR
    NOT has_function_privilege('apd_lab_ingest',
      'apd_change_lab.submit_audit(jsonb)','EXECUTE') OR
    has_function_privilege('apd_lab_observer',
      'apd_change_lab.submit_compact(jsonb)','EXECUTE') OR
    has_function_privilege('apd_lab_observer',
      'apd_change_lab.submit_audit(jsonb)','EXECUTE') OR
    has_schema_privilege('apd_lab_observer','apd_change_lab','USAGE') THEN
  RAISE EXCEPTION 'Stage entrypoints not restricted to ingest';
 END IF;
 IF EXISTS (
   SELECT 1 FROM pg_proc
   WHERE oid IN ('apd_change_lab.submit_compact(jsonb)'::regprocedure,
      'apd_change_lab.submit_audit(jsonb)'::regprocedure)
     AND (NOT prosecdef OR proowner <> 'apd_lab_function_owner'::regrole
       OR NOT (proconfig::text LIKE '%pg_temp%'))
 ) THEN RAISE EXCEPTION 'Invalid function ownership, security or search_path'; END IF;
END $verify$;

SET ROLE apd_lab_ingest;
DO $deny$
BEGIN
 BEGIN
  PERFORM 1 FROM apd_change_lab.captures LIMIT 1;
  RAISE EXCEPTION 'EXPECTED_DENIAL_NOT_RAISED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  DELETE FROM apd_change_lab.audit_events;
  RAISE EXCEPTION 'EXPECTED_DENIAL_NOT_RAISED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM * FROM apd_change_lab.save_compact('{}'::jsonb,true);
  RAISE EXCEPTION 'EXPECTED_DENIAL_NOT_RAISED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $deny$;

SELECT * FROM apd_change_lab.submit_compact(
 apd_change_lab.fixture('BERISSO','2026-11-09T08:00:00Z',
  jsonb_build_array(apd_change_lab.fixture_row('D_STAGE_1','BERISSO','Mañana'))));
SELECT * FROM apd_change_lab.submit_compact(
 apd_change_lab.fixture('BERISSO','2026-11-09T09:00:00Z',
  jsonb_build_array(apd_change_lab.fixture_row('D_STAGE_1','BERISSO','Tarde'))));
SELECT * FROM apd_change_lab.submit_audit(jsonb_build_object(
 'verified',true,'scope','BERISSO','capturedAt','2026-11-09T09:00:00Z',
 'events',jsonb_build_array(jsonb_build_object(
  'event_key',repeat('b',64),'source_offer_key','D_STAGE_1',
  'type','offer_modified','field','turno',
  'before','Mañana','after','Tarde'
 ))));

DO $deny$
BEGIN
 BEGIN
  PERFORM * FROM apd_change_lab.submit_audit(jsonb_build_object(
   'verified',true,'scope','BERISSO','capturedAt','2026-11-09T09:00:00Z',
   'events',jsonb_build_array(jsonb_build_object(
    'event_key',repeat('c',64),'source_offer_key','D_STAGE_1',
    'type','offer_modified','field','turno',
    'before','FORGED','after','Tarde'))));
  RAISE EXCEPTION 'EXPECTED_REJECTION_NOT_RAISED';
 EXCEPTION WHEN others THEN
  IF SQLERRM='EXPECTED_REJECTION_NOT_RAISED' THEN RAISE; END IF;
 END;
END $deny$;
RESET ROLE;

DO $verify$
BEGIN
 IF (SELECT count(*) FROM apd_change_lab.captures
     WHERE scope='BERISSO')<>2 OR
    (SELECT count(*) FROM apd_change_lab.audit_events
     WHERE scope='BERISSO' AND status='audit_only')<>1 OR
    (SELECT count(*) FROM apd_change_lab.audit_events
     WHERE scope='BERISSO' AND before_value='FORGED')<>0 THEN
   RAISE EXCEPTION 'Role-isolated write did not retain exact verified evidence';
 END IF;
END $verify$;

SET ROLE apd_lab_observer;
DO $deny$
BEGIN
 BEGIN
  PERFORM * FROM apd_change_lab.submit_compact('{}'::jsonb);
  RAISE EXCEPTION 'EXPECTED_DENIAL_NOT_RAISED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $deny$;
RESET ROLE;
SELECT 'PASS: PG17 least privilege, non-login owner, RLS, read denial, controlled audit' AS result;
SQL
echo 'APD_LEAST_PRIVILEGE_PG17_PASSED'

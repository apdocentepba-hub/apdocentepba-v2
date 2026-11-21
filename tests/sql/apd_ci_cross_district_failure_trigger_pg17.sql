-- APDocentePBA: disposable PG17 fault injection ONLY.
-- Apply solely after the other apd_scanner_pilot lab DDL in GitHub CI.
-- It simulates a failure DURING the full-row UPSERT, after the minimal
-- representation was already written inside the SAME transaction.
-- This file MUST NEVER be run in Supabase.
CREATE FUNCTION apd_scanner_pilot.ci_abort_full_upsert()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.distrito = 'AVELLANEDA'
     AND NEW.source_offer_key = 'D_7001' THEN
    RAISE EXCEPTION 'CI_FORCED_ABORT_AFTER_MINIMAL_UPSERT';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ci_fail_one_fake_full_row
BEFORE INSERT OR UPDATE ON apd_scanner_pilot.current_offers_full
FOR EACH ROW EXECUTE FUNCTION apd_scanner_pilot.ci_abort_full_upsert();

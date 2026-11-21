-- CI-only mid-request latency injection: disposable PostgreSQL 17.
-- Never deploy this object to actual Supabase.
CREATE FUNCTION apd_scanner_pilot.ci_delay_midflight()
RETURNS trigger LANGUAGE plpgsql AS $apd_delay$
BEGIN
  IF NEW.source_offer_key = 'D_9201' AND NEW.distrito = 'HURLINGHAM' THEN
    PERFORM pg_sleep(7);
  END IF;
  RETURN NEW;
END;
$apd_delay$;
CREATE TRIGGER ci_midflight_slow_full_row
BEFORE INSERT ON apd_scanner_pilot.current_offers_full
FOR EACH ROW EXECUTE FUNCTION apd_scanner_pilot.ci_delay_midflight();

-- ISOLATED PG17 TEST ONLY. Never apply to the real Supabase database.
-- Adds page-wise staging and a verified seal to the disposable PR #219 pilot.
BEGIN;
ALTER TABLE apd_scanner_pilot.runs
  ADD COLUMN source_total integer CHECK (source_total >= 0);
CREATE TABLE apd_scanner_pilot.staged_pages (
  run_id uuid NOT NULL REFERENCES apd_scanner_pilot.runs(run_id),
  page_index integer NOT NULL CHECK (page_index >= 0),
  source_total integer NOT NULL CHECK (source_total >= 0),
  filtered_rows integer NOT NULL CHECK (filtered_rows BETWEEN 0 AND 150),
  payload_md5 text NOT NULL,
  PRIMARY KEY (run_id, page_index)
);

CREATE FUNCTION apd_scanner_pilot.stage_page(
  p_run_id uuid,
  p_page_index integer,
  p_source_total integer,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, apd_scanner_pilot
AS $$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  prior apd_scanner_pilot.staged_pages%ROWTYPE;
  item jsonb;
  offer_key text;
  district text;
  offer_state text;
  digest text;
  amount integer;
BEGIN
  SELECT * INTO r FROM apd_scanner_pilot.runs WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown run'; END IF;
  IF r.status <> 'ready' OR r.stage_verified THEN
    RAISE EXCEPTION 'Run sealed or finalized';
  END IF;
  IF p_page_index IS NULL OR p_page_index < 0 OR p_page_index >= r.expected_pages OR
     p_source_total IS NULL OR p_source_total < 0 OR p_source_total > 100000 OR
     (r.source_total IS NOT NULL AND p_source_total <> r.source_total) THEN
    RAISE EXCEPTION 'Invalid page index or changed source count';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 150 THEN
    RAISE EXCEPTION 'Invalid page payload';
  END IF;
  amount := jsonb_array_length(p_rows);
  IF amount > p_source_total THEN
    RAISE EXCEPTION 'Filtered page exceeds source total';
  END IF;
  digest := md5(p_rows::text);
  SELECT * INTO prior FROM apd_scanner_pilot.staged_pages
  WHERE run_id=p_run_id AND page_index=p_page_index;
  IF FOUND THEN
    IF prior.payload_md5 <> digest OR prior.source_total <> p_source_total OR prior.filtered_rows <> amount THEN
      RAISE EXCEPTION 'Retried page content changed';
    END IF;
    RETURN r.completed_pages; -- exact replay: no duplicate writes
  END IF;
  IF p_page_index <> r.completed_pages THEN
    RAISE EXCEPTION 'Out-of-order page';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(item) <> 'object' THEN RAISE EXCEPTION 'Invalid offer item'; END IF;
    offer_key := item->>'source_offer_key';
    district := item->>'distrito';
    offer_state := item->>'estado';
    IF offer_key IS NULL OR length(btrim(offer_key))=0 OR length(offer_key)>300 OR
       district IS DISTINCT FROM r.distrito OR offer_state IS DISTINCT FROM 'Publicada' THEN
      RAISE EXCEPTION 'Invalid key, district or state';
    END IF;
    -- Primary key(run,key) prevents repeats across *different* pages.
    INSERT INTO apd_scanner_pilot.staged_offers
      (run_id,source_offer_key,distrito,estado)
    VALUES (p_run_id,offer_key,district,offer_state);
  END LOOP;
  INSERT INTO apd_scanner_pilot.staged_pages
    (run_id,page_index,source_total,filtered_rows,payload_md5)
  VALUES (p_run_id,p_page_index,p_source_total,amount,digest);
  UPDATE apd_scanner_pilot.runs SET completed_pages=completed_pages+1,
    source_total=coalesce(source_total,p_source_total)
  WHERE run_id=p_run_id;
  RETURN r.completed_pages+1;
END;
$$;

CREATE FUNCTION apd_scanner_pilot.seal_capture(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_pilot
AS $$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  n integer;
BEGIN
  SELECT * INTO r FROM apd_scanner_pilot.runs WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown run'; END IF;
  IF r.status <> 'ready' THEN RAISE EXCEPTION 'Run finalized'; END IF;
  IF r.stage_verified THEN
    RETURN r.expected_offers; -- idempotent only after sealing
  END IF;
  IF r.completed_pages<>r.expected_pages OR r.source_total IS NULL OR
     r.captured_at<r.capture_started_at OR
     (SELECT count(*) FROM apd_scanner_pilot.staged_pages WHERE run_id=p_run_id)<>r.expected_pages THEN
    RAISE EXCEPTION 'Capture pages incomplete';
  END IF;
  SELECT count(*)::integer INTO n FROM apd_scanner_pilot.staged_offers WHERE run_id=p_run_id;
  IF n>r.source_total THEN RAISE EXCEPTION 'Filtered count larger than source count'; END IF;
  UPDATE apd_scanner_pilot.runs SET expected_offers=n,stage_verified=true
  WHERE run_id=p_run_id;
  RETURN n;
END;
$$;
COMMIT;

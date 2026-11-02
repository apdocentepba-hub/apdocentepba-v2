-- LOCAL TEST ONLY. Never run this against production Supabase.
-- Exact 24-column replica of public.apd_ofertas_global_current as observed on 2026-11-02.
-- Depends on tests/sql/apd_atomic_district_pilot_pg17.sql and apd_atomic_stage_pages_pg17.sql.
BEGIN;
CREATE TABLE apd_scanner_pilot.current_offers_full (
  source_offer_key text PRIMARY KEY,
  idoferta text,
  iddetalle text,
  estado text,
  distrito text,
  escuela text,
  cargo text,
  area text,
  nivel_modalidad text,
  turno text,
  jornada text,
  hsmodulos text,
  cursodivision text,
  supl_desde text,
  supl_hasta text,
  finoferta text,
  ult_movimiento text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_state_change_at timestamptz NOT NULL,
  times_seen bigint NOT NULL DEFAULT 1,
  state_changes bigint NOT NULL DEFAULT 0,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE apd_scanner_pilot.full_staged_payloads (
  run_id uuid NOT NULL REFERENCES apd_scanner_pilot.runs(run_id),
  source_offer_key text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (run_id, source_offer_key)
);

CREATE FUNCTION apd_scanner_pilot.stage_full_page(
  p_run_id uuid, p_page_index integer, p_source_total integer, p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_pilot
AS $$
DECLARE
  item jsonb;
  count_done integer;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>150 THEN
    RAISE EXCEPTION 'Invalid full snapshot page';
  END IF;
  -- Same transaction: minimal stage and full payloads commit/rollback together.
  count_done:=apd_scanner_pilot.stage_page(p_run_id,p_page_index,p_source_total,p_rows);

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(item)<>'object' OR
       jsonb_typeof(item->'raw') NOT IN ('object','null') OR
       NOT (item ?& ARRAY['source_offer_key','idoferta','iddetalle','estado','distrito',
           'escuela','cargo','area','nivel_modalidad','turno','jornada','hsmodulos',
           'cursodivision','supl_desde','supl_hasta','finoferta','ult_movimiento','raw']) OR
       EXISTS (SELECT 1 FROM jsonb_object_keys(item) k
         WHERE k NOT IN ('source_offer_key','idoferta','iddetalle','estado','distrito',
           'escuela','cargo','area','nivel_modalidad','turno','jornada','hsmodulos',
           'cursodivision','supl_desde','supl_hasta','finoferta','ult_movimiento','raw',
           'captured_at')) THEN
      RAISE EXCEPTION 'Full payload is missing required fields or contains unknown keys';
    END IF;
    INSERT INTO apd_scanner_pilot.full_staged_payloads
      (run_id,source_offer_key,payload)
    VALUES (p_run_id,item->>'source_offer_key',item)
    ON CONFLICT (run_id,source_offer_key) DO UPDATE SET payload=EXCLUDED.payload
    WHERE apd_scanner_pilot.full_staged_payloads.payload=EXCLUDED.payload;
    IF NOT FOUND THEN RAISE EXCEPTION 'Full payload changed during page retry'; END IF;
  END LOOP;
  RETURN count_done;
END;
$$;

CREATE FUNCTION apd_scanner_pilot.finalize_full_district(
  p_run_id uuid, p_inject_error_for_test boolean DEFAULT false
)
RETURNS TABLE(upserted integer, pruned integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,apd_scanner_pilot
AS $$
DECLARE
  r apd_scanner_pilot.runs%ROWTYPE;
  n integer;
  n_applied integer;
BEGIN
  SELECT * INTO r FROM apd_scanner_pilot.runs WHERE run_id=p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown full capture run'; END IF;
  IF r.status<>'ready' OR NOT r.stage_verified OR
     r.completed_pages<>r.expected_pages THEN
    RAISE EXCEPTION 'Full capture incomplete or finalized';
  END IF;
  SELECT count(*)::integer INTO n FROM apd_scanner_pilot.full_staged_payloads
   WHERE run_id=p_run_id;
  IF n<>r.expected_offers THEN RAISE EXCEPTION 'Full rows are incomplete'; END IF;
  IF EXISTS (
    SELECT 1 FROM apd_scanner_pilot.full_staged_payloads s
    JOIN apd_scanner_pilot.current_offers_full c USING(source_offer_key)
    WHERE s.run_id=p_run_id AND c.distrito<>r.distrito
  ) THEN RAISE EXCEPTION 'Full key belongs to another district'; END IF;

  -- The prior PG17 pilot finalizes its minimal representation, locks by district,
  -- and flips the run status; this whole invocation remains one transaction.
  PERFORM * FROM apd_scanner_pilot.finalize_district(p_run_id,false,false);

  INSERT INTO apd_scanner_pilot.current_offers_full AS dst
    (source_offer_key,idoferta,iddetalle,estado,distrito,escuela,cargo,area,
     nivel_modalidad,turno,jornada,hsmodulos,cursodivision,supl_desde,supl_hasta,
     finoferta,ult_movimiento,first_seen_at,last_seen_at,last_state_change_at,
     times_seen,state_changes,raw,updated_at)
  SELECT
    j.source_offer_key,j.idoferta,j.iddetalle,j.estado,j.distrito,j.escuela,j.cargo,
    j.area,j.nivel_modalidad,j.turno,j.jornada,j.hsmodulos,j.cursodivision,
    j.supl_desde,j.supl_hasta,j.finoferta,j.ult_movimiento,
    r.captured_at,r.captured_at,r.captured_at,1,0,j.raw,r.captured_at
  FROM apd_scanner_pilot.full_staged_payloads s
  CROSS JOIN LATERAL jsonb_to_record(s.payload) AS j(
    source_offer_key text,idoferta text,iddetalle text,estado text,distrito text,
    escuela text,cargo text,area text,nivel_modalidad text,turno text,
    jornada text,hsmodulos text,cursodivision text,supl_desde text,supl_hasta text,
    finoferta text,ult_movimiento text,raw jsonb
  )
  WHERE s.run_id=p_run_id
  ON CONFLICT(source_offer_key) DO UPDATE SET
    idoferta=EXCLUDED.idoferta,
    iddetalle=EXCLUDED.iddetalle,
    estado=EXCLUDED.estado,
    escuela=EXCLUDED.escuela,
    cargo=EXCLUDED.cargo,
    area=EXCLUDED.area,
    nivel_modalidad=EXCLUDED.nivel_modalidad,
    turno=EXCLUDED.turno,
    jornada=EXCLUDED.jornada,
    hsmodulos=EXCLUDED.hsmodulos,
    cursodivision=EXCLUDED.cursodivision,
    supl_desde=EXCLUDED.supl_desde,
    supl_hasta=EXCLUDED.supl_hasta,
    finoferta=EXCLUDED.finoferta,
    ult_movimiento=EXCLUDED.ult_movimiento,
    last_seen_at=EXCLUDED.last_seen_at,
    last_state_change_at=CASE
      WHEN dst.estado IS DISTINCT FROM EXCLUDED.estado
      THEN EXCLUDED.last_seen_at ELSE dst.last_state_change_at END,
    times_seen=dst.times_seen+1,
    state_changes=dst.state_changes+
      CASE WHEN dst.estado IS DISTINCT FROM EXCLUDED.estado THEN 1 ELSE 0 END,
    raw=EXCLUDED.raw,
    updated_at=EXCLUDED.updated_at
  WHERE dst.distrito=EXCLUDED.distrito;
  GET DIAGNOSTICS n_applied=ROW_COUNT;
  IF n_applied<>n THEN
    RAISE EXCEPTION 'Full payload lost a row or has cross-district collision';
  END IF;

  IF p_inject_error_for_test THEN
    RAISE EXCEPTION 'INJECTED_FULL_ROW_FAILURE';
  END IF;
  RETURN QUERY SELECT n_applied,0;
END;
$$;
COMMIT;

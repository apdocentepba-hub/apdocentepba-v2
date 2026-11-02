-- APDocentePBA: un resumen provincial por dia, SIN copiar las 2.600+ ofertas.
-- PASO PREPARADO, NO EJECUTAR EN SUPABASE SIN APROBACION DE DESPLIEGUE.
-- El Worker tiene snapshot_writes=false deliberadamente por cuota de almacenamiento.
-- Requiere proyecto Supabase con roles service_role, anon y authenticated.
CREATE TABLE IF NOT EXISTS public.apd_daily_province_summary (
  scan_date date PRIMARY KEY,
  scan_finished_at timestamptz NOT NULL,
  total_districts integer NOT NULL CHECK (total_districts > 0),
  districts_with_offers integer NOT NULL CHECK (districts_with_offers >= 0),
  offers_total bigint NOT NULL CHECK (offers_total >= 0),
  district_offer_counts jsonb NOT NULL,
  source text NOT NULL DEFAULT 'apd_ofertas_global_current',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT district_counts_must_be_object CHECK (jsonb_typeof(district_offer_counts) = 'object'),
  CONSTRAINT district_count_not_above_total CHECK (districts_with_offers <= total_districts)
);
ALTER TABLE public.apd_daily_province_summary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.apd_daily_province_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.apd_daily_province_summary TO service_role;

-- La RPC debe invocarse exclusivamente con el service role *en el backend*.
-- Por defecto SECURITY INVOKER, SIN privilegios de superusuario ni RLS bypass a usuarios.
CREATE OR REPLACE FUNCTION public.capture_apd_daily_province_summary(p_scan_date date)
RETURNS TABLE(saved boolean, captured_date date, offers bigint, districts_with_offers integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scan public.apd_global_scan_state%ROWTYPE;
  v_counts jsonb;
  v_offers bigint;
  v_districts integer;
  v_rows integer;
BEGIN
  IF p_scan_date IS NULL THEN
    RAISE EXCEPTION 'scan_date requerido';
  END IF;

  SELECT * INTO v_scan
  FROM public.apd_global_scan_state
  WHERE scope = 'PROVINCIA_FULL'
  FOR UPDATE;

  IF NOT FOUND OR v_scan.status <> 'finished'
    OR v_scan.mode <> 'current_published'
    OR v_scan.started_at IS NULL
    OR v_scan.finished_at IS NULL
    OR v_scan.finished_at <= v_scan.started_at
    OR v_scan.total_districts <= 0
    OR v_scan.districts_completed <> v_scan.total_districts
    OR v_scan.notes->>'completed_scan_date' IS DISTINCT FROM p_scan_date::text
    OR v_scan.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires' < p_scan_date::timestamp
    OR v_scan.started_at AT TIME ZONE 'America/Argentina/Buenos_Aires' >= (p_scan_date + 1)::timestamp
    OR v_scan.finished_at AT TIME ZONE 'America/Argentina/Buenos_Aires' >= (p_scan_date + 1)::timestamp
  THEN
    RAISE EXCEPTION 'No hay barrido provincial completo y vigente para fecha %', p_scan_date;
  END IF;

  -- Solo filas observadas durante el barrido terminado: ni estados de otro dia
  -- ni primeras observaciones tratadas incorrectamente como publicaciones ABC.
  SELECT coalesce(jsonb_object_agg(distrito, n ORDER BY distrito), '{}'::jsonb),
         coalesce(sum(n), 0)::bigint, count(*)::integer
  INTO v_counts, v_offers, v_districts
  FROM (
    SELECT btrim(distrito) AS distrito, count(*)::bigint AS n
    FROM public.apd_ofertas_global_current
    WHERE last_seen_at >= v_scan.started_at
      AND last_seen_at <= v_scan.finished_at
      AND nullif(btrim(distrito), '') IS NOT NULL
    GROUP BY btrim(distrito)
  ) grouped;

  IF v_offers <> v_scan.offers_processed
    OR v_districts > v_scan.total_districts
  THEN
    RAISE EXCEPTION 'Inconsistencia: filas actuales %, procesadas %, distritos %/%',
      v_offers, v_scan.offers_processed, v_districts, v_scan.total_districts;
  END IF;

  INSERT INTO public.apd_daily_province_summary (
    scan_date, scan_finished_at, total_districts,
    districts_with_offers, offers_total, district_offer_counts
  ) VALUES (
    p_scan_date, v_scan.finished_at, v_scan.total_districts,
    v_districts, v_offers, v_counts
  )
  ON CONFLICT (scan_date) DO UPDATE SET
    scan_finished_at = EXCLUDED.scan_finished_at,
    total_districts = EXCLUDED.total_districts,
    districts_with_offers = EXCLUDED.districts_with_offers,
    offers_total = EXCLUDED.offers_total,
    district_offer_counts = EXCLUDED.district_offer_counts,
    updated_at = now()
  WHERE public.apd_daily_province_summary.scan_finished_at < EXCLUDED.scan_finished_at;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN QUERY SELECT (v_rows > 0), p_scan_date, v_offers, v_districts;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_apd_daily_province_summary(date)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_apd_daily_province_summary(date) TO service_role;

-- No pg_cron, no trigger y no escrituras automáticas en este cambio.
-- Una integración futura llamará esta RPC solo tras status=finished.
-- El frontend leerá datos agregados a través de un endpoint de Worker autenticado.

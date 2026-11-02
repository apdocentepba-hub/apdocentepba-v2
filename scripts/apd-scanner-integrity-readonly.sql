-- APDocentePBA: scanner live-data structural preflight. READ ONLY.
-- No offer/person records are returned. This is NOT approval for migration.
-- Caller should set PGOPTIONS='-c default_transaction_read_only=on'.
WITH checks AS (
  SELECT count(*)::bigint AS total_offers,
    count(DISTINCT source_offer_key)::bigint AS distinct_source_keys,
    count(DISTINCT distrito)::bigint AS represented_districts,
    count(*) FILTER (WHERE source_offer_key IS NULL OR btrim(source_offer_key) = '')::bigint AS missing_source_keys,
    count(*) FILTER (WHERE distrito IS NULL OR btrim(distrito) = '')::bigint AS missing_districts,
    count(*) FILTER (WHERE idoferta IS NULL OR btrim(idoferta) = '')::bigint AS missing_idoferta,
    count(*) FILTER (WHERE iddetalle IS NULL OR btrim(iddetalle) = '')::bigint AS missing_iddetalle,
    count(*) FILTER (WHERE first_seen_at IS NULL OR last_seen_at IS NULL OR first_seen_at > last_seen_at)::bigint AS invalid_seen_times,
    count(*) FILTER (WHERE last_state_change_at IS NOT NULL AND last_seen_at IS NOT NULL AND last_state_change_at > last_seen_at)::bigint AS invalid_state_times,
    count(*) FILTER (WHERE times_seen IS NULL OR times_seen < 1)::bigint AS invalid_times_seen,
    count(*) FILTER (WHERE state_changes IS NULL OR state_changes < 0)::bigint AS invalid_state_changes
  FROM public.apd_ofertas_global_current
)
SELECT total_offers,
       distinct_source_keys,
       represented_districts,
       missing_source_keys,
       missing_districts,
       missing_idoferta,
       missing_iddetalle,
       invalid_seen_times,
       invalid_state_times,
       invalid_times_seen,
       invalid_state_changes,
       (total_offers > 0
        AND total_offers = distinct_source_keys
        AND missing_source_keys = 0
        AND missing_districts = 0
        AND missing_idoferta = 0
        AND missing_iddetalle = 0
        AND invalid_seen_times = 0
        AND invalid_state_times = 0
        AND invalid_times_seen = 0
        AND invalid_state_changes = 0) AS structural_checks_ok
FROM checks;

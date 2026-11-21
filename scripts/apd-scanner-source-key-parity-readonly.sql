-- APDocentePBA: aggregate-only parity between persisted source_offer_key and
-- Worker canonical buildSourceOfferKeyFromOferta PRIMARY path (iddetalle).
-- READ ONLY, no personal data or individual offer IDs in output.
-- Fallbacks based on raw.id, idoferta or composite text are NOT silently accepted:
-- they require separate review before any migration.
WITH normalized AS (
  SELECT source_offer_key,
    regexp_replace(coalesce(iddetalle, ''), '[^0-9]', '', 'g') AS detail_digits,
    nullif(coalesce(raw->>'id',''), '') AS raw_solr_id
  FROM public.apd_ofertas_global_current
),
observed AS (
 SELECT source_offer_key, detail_digits, raw_solr_id,
   regexp_replace(coalesce(raw_solr_id,''), '[^0-9]', '', 'g') AS raw_id_digits
 FROM normalized
),
counts AS (
 SELECT count(*)::bigint AS total_offers,
   count(*) FILTER (WHERE detail_digits <> '')::bigint AS detail_numeric_count,
   count(*) FILTER (WHERE detail_digits = '')::bigint AS fallback_requires_review,
   count(*) FILTER (WHERE detail_digits <> '' AND source_offer_key = 'D_' || detail_digits)::bigint AS matching_worker_primary_key,
   count(*) FILTER (WHERE detail_digits <> '' AND source_offer_key IS DISTINCT FROM ('D_' || detail_digits))::bigint AS mismatched_worker_primary_key,
   count(*) FILTER (WHERE raw_solr_id IS NOT NULL)::bigint AS raw_solr_id_present,
   count(*) FILTER (WHERE raw_solr_id IS NOT NULL AND raw_id_digits <> detail_digits)::bigint AS raw_solr_vs_detail_mismatch
 FROM observed
)
SELECT total_offers,detail_numeric_count,fallback_requires_review,
       matching_worker_primary_key,mismatched_worker_primary_key,
       raw_solr_id_present,raw_solr_vs_detail_mismatch,
       (total_offers > 0 AND total_offers=detail_numeric_count
        AND total_offers=matching_worker_primary_key
        AND total_offers=raw_solr_id_present
        AND fallback_requires_review=0
        AND mismatched_worker_primary_key=0
        AND raw_solr_vs_detail_mismatch=0) AS primary_identity_parity_ok
FROM counts;

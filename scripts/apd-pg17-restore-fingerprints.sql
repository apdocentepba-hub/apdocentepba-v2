-- Disposable PG17 lab only. Emits NO table rows, offer IDs or PII.
-- One deterministic row per private/base table: table name, count, digest.
-- Sorting canonical JSONB digest makes the fingerprint independent of heap order.
SELECT format(
  'SELECT %L::text AS relation_name, count(*)::bigint, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '','' ORDER BY md5(to_jsonb(t)::text)), '''')) FROM %I.%I t;',
  table_schema||'.'||table_name,table_schema,table_name
)
FROM information_schema.tables
WHERE table_schema IN ('apd_scanner_pilot','apd_scanner_api')
  AND table_type='BASE TABLE'
ORDER BY table_schema,table_name
\gexec

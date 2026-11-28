-- Revert only this exact candidate index. Never drop unrelated indexes.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $guard$
BEGIN
 IF current_setting('apd.review_index_authorized',true) IS DISTINCT FROM 'REVIEWED_INDEX_ONLY' THEN RAISE EXCEPTION 'Explicit acknowledgement required'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_am am ON am.oid=c.relam JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='checkout_id' WHERE i.indexrelid=to_regclass('public.apd_payment_review_checkout_idx') AND i.indrelid='public.apd_complete_payment_review'::regclass AND i.indnkeyatts=1 AND i.indnatts=1 AND i.indkey[0]=a.attnum AND i.indpred IS NULL AND i.indexprs IS NULL AND NOT i.indisunique AND am.amname='btree' AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conindid=i.indexrelid)) THEN RAISE EXCEPTION 'Candidate index identity not confirmed'; END IF;
END
$guard$;
DROP INDEX public.apd_payment_review_checkout_idx;
COMMIT;

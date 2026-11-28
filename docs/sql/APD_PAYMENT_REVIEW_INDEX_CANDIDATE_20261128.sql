-- APD009. Candidate only; do not apply automatically. Small-table migration.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';
DO $guard$
BEGIN
 IF current_setting('apd.review_index_authorized',true) IS DISTINCT FROM 'REVIEWED_INDEX_ONLY' THEN
  RAISE EXCEPTION 'Explicit migration acknowledgement required';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.apd_complete_payment_review'::regclass AND confrelid='public.mercadopago_checkout_sessions'::regclass AND contype='f' AND convalidated AND confdeltype='r' AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=conrelid AND attname='checkout_id' AND NOT attisdropped)]::smallint[] AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=confrelid AND attname='id' AND NOT attisdropped)]::smallint[]) THEN
  RAISE EXCEPTION 'Expected validated FK absent';
 END IF;
 IF pg_total_relation_size('public.apd_complete_payment_review')>1048576 THEN RAISE EXCEPTION 'Table grew: reassess concurrent index strategy'; END IF;
 IF EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='checkout_id' WHERE i.indrelid='public.apd_complete_payment_review'::regclass AND i.indisvalid AND i.indpred IS NULL AND i.indkey[0]=a.attnum) THEN
  RAISE EXCEPTION 'Equivalent leading index already exists';
 END IF;
END
$guard$;
CREATE INDEX apd_payment_review_checkout_idx ON public.apd_complete_payment_review USING btree (checkout_id);
COMMIT;

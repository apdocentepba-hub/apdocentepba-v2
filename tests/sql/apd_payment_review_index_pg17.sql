\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'apd_index_fixture' THEN RAISE EXCEPTION 'Wrong disposable database'; END IF; END $$;
CREATE TABLE public.mercadopago_checkout_sessions(id uuid PRIMARY KEY);
CREATE TABLE public.apd_complete_payment_review(payment_id text PRIMARY KEY,checkout_id uuid NOT NULL REFERENCES public.mercadopago_checkout_sessions(id) ON DELETE RESTRICT,disposition text NOT NULL CHECK(disposition IN ('review','revoke')),observed_at timestamptz NOT NULL);
INSERT INTO public.mercadopago_checkout_sessions VALUES ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
INSERT INTO public.apd_complete_payment_review SELECT 'fixture-'||g,'11111111-1111-4111-8111-111111111111'::uuid,'review',now() FROM generate_series(1,1000) g;
SET apd.review_index_authorized='REVIEWED_INDEX_ONLY';
\ir ../../docs/sql/APD_PAYMENT_REVIEW_INDEX_CANDIDATE_20261128.sql
ANALYZE public.apd_complete_payment_review;
SET enable_seqscan=off;
DO $$
DECLARE plan json; BEGIN
 EXECUTE 'EXPLAIN (FORMAT JSON) SELECT payment_id FROM public.apd_complete_payment_review WHERE checkout_id=''22222222-2222-4222-8222-222222222222''' INTO plan;
 IF position('apd_payment_review_checkout_idx' in plan::text)=0 THEN RAISE EXCEPTION 'Index not eligible'; END IF;
 IF (SELECT count(*) FROM public.apd_complete_payment_review)<>1000 THEN RAISE EXCEPTION 'Rows changed'; END IF;
 BEGIN DELETE FROM public.mercadopago_checkout_sessions WHERE id='11111111-1111-4111-8111-111111111111'; RAISE EXCEPTION 'FK unexpectedly allowed deletion'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
RESET enable_seqscan;
\ir ../../docs/sql/APD_PAYMENT_REVIEW_INDEX_REVERT_20261128.sql
DO $$ BEGIN
 IF to_regclass('public.apd_payment_review_checkout_idx') IS NOT NULL OR (SELECT count(*) FROM public.apd_complete_payment_review)<>1000 OR to_regclass('public.apd_complete_payment_review_pkey') IS NULL THEN RAISE EXCEPTION 'Rollback verification failed'; END IF;
END $$;
SELECT 'APD_PAYMENT_REVIEW_INDEX_FIXTURE_PASS' AS result;

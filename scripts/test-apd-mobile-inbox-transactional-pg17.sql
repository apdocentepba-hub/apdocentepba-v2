\set ON_ERROR_STOP on
-- Disposable PG17 only. No production DB, no real ABC user or push.
\ir ../sql/apd_mobile_inbox_transactional_lab_20261108.sql
DO $security$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'apd_mobile_inbox_accounts_lab','apd_mobile_inbox_items_lab',
  'apd_mobile_inbox_events_lab'
 ] LOOP
  IF has_table_privilege('anon','public.'||t,'SELECT')
   OR has_table_privilege('authenticated','public.'||t,'INSERT')
   OR has_table_privilege('authenticated','public.'||t,'UPDATE')
   OR NOT has_table_privilege('service_role','public.'||t,'SELECT')
  THEN RAISE EXCEPTION 'INBOX DATABASE PRIVILEGES LEAKED: %',t; END IF;
  IF (SELECT NOT relrowsecurity OR NOT relforcerowsecurity
   FROM pg_class WHERE oid=('public.'||t)::regclass)
  THEN RAISE EXCEPTION 'INBOX RLS NOT FORCED: %',t; END IF;
 END LOOP;
 IF has_table_privilege('service_role',
  'public.apd_mobile_inbox_events_lab','UPDATE')
 OR has_table_privilege('service_role',
  'public.apd_mobile_inbox_events_lab','DELETE')
 OR has_table_privilege('service_role',
  'public.apd_mobile_inbox_items_lab','DELETE')
 THEN RAISE EXCEPTION 'INBOX EVENT IMMUTABILITY NOT PROTECTED'; END IF;
 IF has_function_privilege('anon',
  'public.apd_mobile_inbox_page_lab(uuid,integer,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.apd_mobile_inbox_ack_read_lab(uuid,text,integer)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.apd_mobile_inbox_append_event_lab(uuid,text,text,integer,text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
  'public.apd_mobile_inbox_page_lab(uuid,integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'INBOX RPC PERMISSION LEAK'; END IF;
END $security$;

SET ROLE service_role;
DO $test$
DECLARE a uuid:='11111111-1111-4111-8111-111111111111';
        b uuid:='22222222-2222-4222-8222-222222222222';
        page jsonb;ack jsonb;v_cursor integer;
BEGIN
 IF NOT public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-001','DEMO-APD-001',1,'active')
 OR NOT public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-002','DEMO-APD-002',1,'active')
 OR NOT public.apd_mobile_inbox_append_event_lab(b,
  'DEMO-AVISO-004','DEMO-APD-004',1,'active')
 THEN RAISE EXCEPTION 'INBOX FIXTURE SEED FAILED'; END IF;

 IF public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-001','DEMO-APD-001',1,'active')
 OR public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-001','DEMO-APD-002',2,'active')
 OR public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-009','DEMO-APD-009',1,'active')
 THEN RAISE EXCEPTION 'SPOOFED OR DUPLICATE INBOX EVENT'; END IF;
 IF (SELECT last_cursor FROM public.apd_mobile_inbox_accounts_lab
  WHERE user_id=a)<>2
 THEN RAISE EXCEPTION 'INBOX DUPLICATE ADVANCED CURSOR'; END IF;

 page=public.apd_mobile_inbox_page_lab(a,0,1);
 IF (page->>'version')::integer<>1
 OR (page->>'fromCursor')::integer<>0
 OR (page->>'nextCursor')::integer<>1
 OR (page->>'hasMore')::boolean IS DISTINCT FROM true
 OR jsonb_array_length(page->'events')<>1
 OR (page->'events'->0->>'id')<>'DEMO-AVISO-001'
 OR page::text LIKE '%11111111-1111%'
 OR page::text LIKE '%22222222-2222%'
 THEN RAISE EXCEPTION 'ACCOUNT A PAGE NOT PRIVATE OR NOT BOUNDED'; END IF;
 page=public.apd_mobile_inbox_page_lab(b,0,20);
 IF jsonb_array_length(page->'events')<>1
 OR (page->'events'->0->>'id')<>'DEMO-AVISO-004'
 OR (page->>'nextCursor')::integer<>1
 OR page::text LIKE '%DEMO-AVISO-001%'
 THEN RAISE EXCEPTION 'FOREIGN TENANT B READ DATA LEAK'; END IF;
 page=public.apd_mobile_inbox_page_lab(a,2,20);
 IF (page->>'nextCursor')::integer<>2
 OR (page->>'hasMore')::boolean IS DISTINCT FROM false
 OR jsonb_array_length(page->'events')<>0
 THEN RAISE EXCEPTION 'EMPTY LAST PAGE CONTRACT FAILED'; END IF;

 ack=public.apd_mobile_inbox_ack_read_lab(a,'DEMO-AVISO-001',1);
 IF (ack->>'accepted')::boolean IS DISTINCT FROM true
 OR (ack->>'alreadyRead')::boolean IS DISTINCT FROM false
 OR (ack->>'cursor')::integer<>3
 THEN RAISE EXCEPTION 'READ ACK DID NOT CREATE EVENT'; END IF;
 ack=public.apd_mobile_inbox_ack_read_lab(a,'DEMO-AVISO-001',1);
 IF (ack->>'alreadyRead')::boolean IS DISTINCT FROM true
 OR (ack->>'cursor')::integer<>3
 THEN RAISE EXCEPTION 'DUPLICATE READ ACK NOT IDEMPOTENT'; END IF;
 IF (SELECT count(*) FROM public.apd_mobile_inbox_events_lab
  WHERE user_id=a AND kind='read')<>1
 THEN RAISE EXCEPTION 'DUPLICATE READ EVENTS STORED'; END IF;
 IF (public.apd_mobile_inbox_ack_read_lab(b,'DEMO-AVISO-001',1)
   ->>'reason')<>'not_found'
 THEN RAISE EXCEPTION 'FOREIGN ACCOUNT READ ACK WAS NOT REJECTED'; END IF;
 IF (SELECT last_cursor FROM public.apd_mobile_inbox_accounts_lab
  WHERE user_id=b)<>1
 THEN RAISE EXCEPTION 'FOREIGN ACCOUNT CURSOR MUTATED'; END IF;

 IF NOT public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-001','DEMO-APD-001',2,'active')
 THEN RAISE EXCEPTION 'ADVANCE REVISION FAILED'; END IF;
 IF (SELECT read FROM public.apd_mobile_inbox_items_lab
  WHERE user_id=a AND notice_id='DEMO-AVISO-001') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'REVISION OVERWROTE READ ACK'; END IF;
 IF NOT public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-001','DEMO-APD-001',3,'cancelled')
 THEN RAISE EXCEPTION 'CANCEL FAILED'; END IF;
 IF public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-001','DEMO-APD-001',4,'active')
 OR public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-001','DEMO-APD-001',2,'active')
 THEN RAISE EXCEPTION 'CANCELLED EVENT WAS RESURRECTED'; END IF;
 IF (public.apd_mobile_inbox_ack_read_lab(a,'DEMO-AVISO-001',3)
  ->>'reason')<>'cancelled'
 OR (public.apd_mobile_inbox_ack_read_lab(a,'DEMO-AVISO-001',2)
  ->>'reason')<>'stale_revision'
 THEN RAISE EXCEPTION 'READ ACK REACTIVATED A CANCELLED EVENT'; END IF;

 -- A cancellation preceding the original arrival is a durable tombstone.
 IF NOT public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-003','DEMO-APD-003',7,'cancelled')
 OR public.apd_mobile_inbox_append_event_lab(a,
  'DEMO-AVISO-003','DEMO-APD-003',8,'active')
 THEN RAISE EXCEPTION 'CANCEL-BEFORE-ARRIVAL TOMBSTONE FAILED'; END IF;
 IF (SELECT status||'|'||read::text
  FROM public.apd_mobile_inbox_items_lab
  WHERE user_id=a AND notice_id='DEMO-AVISO-003')<>'cancelled|true'
 THEN RAISE EXCEPTION 'TOMBSTONE DID NOT PERSIST'; END IF;

 IF (SELECT last_cursor FROM public.apd_mobile_inbox_accounts_lab
  WHERE user_id=a)<>6
 OR (SELECT count(*) FROM public.apd_mobile_inbox_events_lab
  WHERE user_id=a)<>6
 THEN RAISE EXCEPTION 'ACCOUNT A HAD GAPPED OR REPEATED CURSORS'; END IF;
 SELECT count(*) INTO v_cursor FROM (
  SELECT cursor, row_number() OVER(ORDER BY cursor) seq
  FROM public.apd_mobile_inbox_events_lab WHERE user_id=a
 ) t WHERE t.cursor<>t.seq;
 IF v_cursor<>0 THEN RAISE EXCEPTION 'ACCOUNT CURSORS NOT CONTIGUOUS'; END IF;
 page=public.apd_mobile_inbox_page_lab(a,3,20);
 IF (page->>'nextCursor')::integer<>6
 OR (page->'events'->0->>'kind')<>'event'
 OR (page->'events'->1->>'status')<>'cancelled'
 OR (page->'events'->2->>'status')<>'cancelled'
 THEN RAISE EXCEPTION 'CURSOR PAGE LOST CANCELLATION'; END IF;
END $test$;

-- The server's user UUID is only trusted when verified before calling RPC.
-- Direct unauthenticated roles cannot use these tables or functions.
RESET ROLE;
DO $security$
DECLARE m text;
BEGIN
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.apd_mobile_inbox_page_lab(
   '11111111-1111-4111-8111-111111111111',0,20);
  RAISE EXCEPTION 'AUTHENTICATED ROLE READ SERVER INBOX';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS m=MESSAGE_TEXT;
  IF m NOT LIKE '%permission denied%' THEN RAISE; END IF;
 END;
END $security$;
SELECT 'PG17_MOBILE_INBOX_TRANSACTIONAL_ISOLATION_PASS' AS result;

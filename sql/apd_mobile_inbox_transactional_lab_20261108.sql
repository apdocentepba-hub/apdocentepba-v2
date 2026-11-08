-- APDocentePBA inbox server-backed contract -- DISPOSABLE PostgreSQL 17 LAB.
-- Deploy NEVER: requires approval, privileges review, backup, rollback and real
-- authorization repository. No provider calls, cron, live users or real data.
-- Trusted Worker verifies auth session BEFORE passing user_id to service-only RPC.
BEGIN;

CREATE TABLE public.apd_mobile_inbox_accounts_lab (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 last_cursor integer NOT NULL DEFAULT 0 CHECK (last_cursor BETWEEN 0 AND 100000)
);

CREATE TABLE public.apd_mobile_inbox_items_lab (
 user_id uuid NOT NULL,
 notice_id text NOT NULL CHECK (notice_id ~ '^DEMO-AVISO-00[1-4]$'),
 offer_id text NOT NULL CHECK (offer_id ~ '^DEMO-APD-00[1-4]$'),
 revision integer NOT NULL CHECK (revision BETWEEN 1 AND 100000),
 status text NOT NULL CHECK (status IN ('active','cancelled')),
 read boolean NOT NULL,
 PRIMARY KEY(user_id,notice_id),
 FOREIGN KEY(user_id) REFERENCES public.apd_mobile_inbox_accounts_lab(user_id)
  ON DELETE CASCADE,
 CONSTRAINT apd_inbox_demo_offer_binding CHECK (right(notice_id,3)=right(offer_id,3)),
 CONSTRAINT apd_inbox_cancel_is_read CHECK (status<>'cancelled' OR read=true)
);

CREATE TABLE public.apd_mobile_inbox_events_lab (
 user_id uuid NOT NULL,
 cursor integer NOT NULL CHECK (cursor BETWEEN 1 AND 100000),
 kind text NOT NULL CHECK (kind IN ('event','read')),
 notice_id text NOT NULL CHECK (notice_id ~ '^DEMO-AVISO-00[1-4]$'),
 offer_id text NOT NULL CHECK (offer_id ~ '^DEMO-APD-00[1-4]$'),
 revision integer NOT NULL CHECK (revision BETWEEN 1 AND 100000),
 status text NOT NULL CHECK (status IN ('active','cancelled')),
 read boolean NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,cursor),
 FOREIGN KEY(user_id) REFERENCES public.apd_mobile_inbox_accounts_lab(user_id)
  ON DELETE CASCADE,
 CONSTRAINT apd_inbox_event_demo_offer_binding CHECK (right(notice_id,3)=right(offer_id,3)),
 CONSTRAINT apd_inbox_event_cancel_is_read CHECK (status<>'cancelled' OR read=true),
 CONSTRAINT apd_inbox_read_kind_is_active CHECK (kind<>'read' OR (read=true AND status='active'))
);
CREATE INDEX apd_mobile_inbox_event_notice_lab
 ON public.apd_mobile_inbox_events_lab(user_id,notice_id,cursor DESC);

ALTER TABLE public.apd_mobile_inbox_accounts_lab ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_inbox_accounts_lab FORCE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_inbox_items_lab ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_inbox_items_lab FORCE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_inbox_events_lab ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apd_mobile_inbox_events_lab FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.apd_mobile_inbox_accounts_lab,
 public.apd_mobile_inbox_items_lab,public.apd_mobile_inbox_events_lab
 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.apd_mobile_inbox_accounts_lab,
 public.apd_mobile_inbox_items_lab TO service_role;
GRANT SELECT,INSERT ON public.apd_mobile_inbox_events_lab TO service_role;

-- Only the trusted internal server can inject a synthetic offer event.
-- Always lock the PER-ACCOUNT cursor row before reading or changing items.
-- No unverified user can call this function directly (revoked below).
CREATE OR REPLACE FUNCTION public.apd_mobile_inbox_append_event_lab(
 p_user_id uuid,p_notice_id text,p_offer_id text,
 p_revision integer,p_status text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_cursor integer;v_item record;v_read boolean;
BEGIN
 IF p_user_id IS NULL OR p_notice_id IS NULL
 OR p_notice_id !~ '^DEMO-AVISO-00[1-4]$'
 OR p_offer_id IS NULL OR p_offer_id !~ '^DEMO-APD-00[1-4]$'
 OR right(p_notice_id,3)<>right(p_offer_id,3)
 OR p_revision IS NULL OR p_revision NOT BETWEEN 1 AND 100000
 OR p_status IS NULL OR p_status NOT IN ('active','cancelled')
 THEN RETURN false; END IF;

 INSERT INTO public.apd_mobile_inbox_accounts_lab(user_id) VALUES(p_user_id)
 ON CONFLICT DO NOTHING;
 SELECT last_cursor INTO v_cursor
 FROM public.apd_mobile_inbox_accounts_lab WHERE user_id=p_user_id FOR UPDATE;
 IF v_cursor IS NULL OR v_cursor>=100000
 THEN RAISE EXCEPTION 'inbox_cursor_limit'; END IF;

 SELECT * INTO v_item FROM public.apd_mobile_inbox_items_lab
 WHERE user_id=p_user_id AND notice_id=p_notice_id FOR UPDATE;
 IF FOUND AND (v_item.status='cancelled' OR p_revision<=v_item.revision)
 THEN RETURN false; END IF;
 v_read=CASE WHEN p_status='cancelled' THEN true
             WHEN v_item.notice_id IS NOT NULL THEN v_item.read
             ELSE false END;

 INSERT INTO public.apd_mobile_inbox_items_lab(
  user_id,notice_id,offer_id,revision,status,read
 ) VALUES (p_user_id,p_notice_id,p_offer_id,p_revision,p_status,v_read)
 ON CONFLICT (user_id,notice_id) DO UPDATE SET
  offer_id=EXCLUDED.offer_id,revision=EXCLUDED.revision,
  status=EXCLUDED.status,read=EXCLUDED.read;

 INSERT INTO public.apd_mobile_inbox_events_lab(
  user_id,cursor,kind,notice_id,offer_id,revision,status,read
 ) VALUES(p_user_id,v_cursor+1,'event',p_notice_id,p_offer_id,
  p_revision,p_status,v_read);
 UPDATE public.apd_mobile_inbox_accounts_lab SET last_cursor=v_cursor+1
 WHERE user_id=p_user_id;
 RETURN true;
END; $$;

-- Exactly one read event per revision, even under concurrent requests.
-- The JSON outcome is compatible with the already-tested HTTP handler.
CREATE OR REPLACE FUNCTION public.apd_mobile_inbox_ack_read_lab(
 p_user_id uuid,p_notice_id text,p_revision integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_cursor integer;v_item record;
BEGIN
 IF p_user_id IS NULL OR p_notice_id IS NULL
 OR p_notice_id !~ '^DEMO-AVISO-00[1-4]$'
 OR p_revision IS NULL OR p_revision NOT BETWEEN 1 AND 100000
 THEN RETURN jsonb_build_object('accepted',false,'reason','not_found'); END IF;

 SELECT last_cursor INTO v_cursor FROM public.apd_mobile_inbox_accounts_lab
 WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('accepted',false,'reason','not_found'); END IF;
 SELECT * INTO v_item FROM public.apd_mobile_inbox_items_lab
 WHERE user_id=p_user_id AND notice_id=p_notice_id FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('accepted',false,'reason','not_found'); END IF;
 IF p_revision<>v_item.revision THEN
  RETURN jsonb_build_object('accepted',false,'reason','stale_revision'); END IF;
 IF v_item.status='cancelled' THEN
  RETURN jsonb_build_object('accepted',false,'reason','cancelled'); END IF;
 IF v_item.read=true THEN
  RETURN jsonb_build_object('accepted',true,'alreadyRead',true,
   'cursor',v_cursor,'read',true); END IF;
 IF v_cursor>=100000 THEN RAISE EXCEPTION 'inbox_cursor_limit'; END IF;
 UPDATE public.apd_mobile_inbox_items_lab SET read=true
 WHERE user_id=p_user_id AND notice_id=p_notice_id;
 INSERT INTO public.apd_mobile_inbox_events_lab(
  user_id,cursor,kind,notice_id,offer_id,revision,status,read
 ) VALUES(p_user_id,v_cursor+1,'read',v_item.notice_id,v_item.offer_id,
  v_item.revision,'active',true);
 UPDATE public.apd_mobile_inbox_accounts_lab SET last_cursor=v_cursor+1
 WHERE user_id=p_user_id;
 RETURN jsonb_build_object('accepted',true,'alreadyRead',false,
  'cursor',v_cursor+1,'read',true);
END; $$;

-- A stable snapshot of one account's ordered event sequence.
-- Shared row lock prevents concurrent writes from changing the cursor
-- midway through the pagination response. No foreign tenant data returned.
CREATE OR REPLACE FUNCTION public.apd_mobile_inbox_page_lab(
 p_user_id uuid,p_after integer DEFAULT 0,p_limit integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_cursor integer:=0;v_events jsonb;v_next integer;
BEGIN
 IF p_user_id IS NULL OR p_after IS NULL OR p_after NOT BETWEEN 0 AND 100000
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20
 THEN RAISE EXCEPTION 'invalid_inbox_page'; END IF;
 SELECT last_cursor INTO v_cursor FROM public.apd_mobile_inbox_accounts_lab
 WHERE user_id=p_user_id FOR SHARE;
 IF NOT FOUND THEN v_cursor=0; END IF;
 IF p_after>v_cursor THEN RAISE EXCEPTION 'invalid_inbox_page'; END IF;
 SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
   'cursor',e.cursor,'kind',e.kind,'id',e.notice_id,
   'offerId',e.offer_id,'revision',e.revision,
   'status',e.status,'read',e.read)
  ORDER BY e.cursor),'[]'::jsonb)
 INTO v_events FROM (
  SELECT cursor,kind,notice_id,offer_id,revision,status,read
  FROM public.apd_mobile_inbox_events_lab
  WHERE user_id=p_user_id AND cursor>p_after AND cursor<=v_cursor
  ORDER BY cursor LIMIT p_limit
 ) e;
 SELECT COALESCE(MAX((val->>'cursor')::integer),p_after)
 INTO v_next FROM jsonb_array_elements(v_events) AS val;
 RETURN jsonb_build_object(
  'version',1,'fromCursor',p_after,'nextCursor',v_next,
  'hasMore',v_next<v_cursor,'events',v_events);
END; $$;

REVOKE ALL ON FUNCTION
 public.apd_mobile_inbox_append_event_lab(uuid,text,text,integer,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION
 public.apd_mobile_inbox_ack_read_lab(uuid,text,integer)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION
 public.apd_mobile_inbox_page_lab(uuid,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.apd_mobile_inbox_append_event_lab(uuid,text,text,integer,text)
 TO service_role;
GRANT EXECUTE ON FUNCTION
 public.apd_mobile_inbox_ack_read_lab(uuid,text,integer)
 TO service_role;
GRANT EXECUTE ON FUNCTION
 public.apd_mobile_inbox_page_lab(uuid,integer,integer)
 TO service_role;
COMMIT;

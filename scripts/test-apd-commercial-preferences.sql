DO $$ BEGIN
 IF has_function_privilege('anon','public.apd_save_free_preferences(uuid,jsonb,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.apd_save_free_preferences(uuid,jsonb,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'RPC exposed'; END IF;
END $$;
SET ROLE service_role;
DO $$ DECLARE s jsonb; u uuid:='00000000-0000-4000-8000-000000000005'; BEGIN
 SELECT snapshot INTO s FROM public.apd_pref_qa_snapshot;
 IF public.apd_save_free_preferences(u,NULL,s)->>'reason' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'missing snapshot accepted'; END IF;
 IF public.apd_save_free_preferences(u,s,s||'{"user_id":"00000000-0000-4000-8000-000000000006"}')->>'reason' IS DISTINCT FROM 'invalid_payload' THEN RAISE EXCEPTION 'cross-account write accepted'; END IF;
 IF public.apd_save_free_preferences(u,s||'{"distrito_principal":"STALE"}',s)->>'reason' IS DISTINCT FROM 'conflict' THEN RAISE EXCEPTION 'stale snapshot accepted'; END IF;
END $$;
RESET ROLE;

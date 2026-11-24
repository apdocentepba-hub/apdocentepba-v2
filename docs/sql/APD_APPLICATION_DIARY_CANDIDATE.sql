-- Candidate migration for an isolated database.
BEGIN;
CREATE TABLE public.user_application_diary (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 entries jsonb NOT NULL CHECK (
  CASE WHEN jsonb_typeof(entries)='array' THEN jsonb_array_length(entries)<=100 AND octet_length(entries::text)<=65536 ELSE false END
 ),
 revision integer NOT NULL CHECK (revision>0)
);
ALTER TABLE public.user_application_diary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_application_diary FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.user_application_diary TO service_role;
CREATE FUNCTION public.apd_application_diary_cas(p_user uuid,p_entries jsonb,p_revision integer)
RETURNS TABLE(entries jsonb,revision integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_user IS NULL OR p_entries IS NULL OR p_revision IS NULL OR p_revision<0 OR p_revision>=2147483647 THEN
  RAISE EXCEPTION 'invalid application diary write' USING ERRCODE='22023';
 END IF;
 IF p_revision=0 THEN
  RETURN QUERY INSERT INTO public.user_application_diary AS d(user_id,entries,revision)
   VALUES(p_user,p_entries,1) ON CONFLICT(user_id) DO NOTHING RETURNING d.entries,d.revision;
 ELSE
  RETURN QUERY UPDATE public.user_application_diary AS d SET entries=p_entries,revision=p_revision+1
   WHERE d.user_id=p_user AND d.revision=p_revision RETURNING d.entries,d.revision;
 END IF;
END;$$;
REVOKE ALL ON FUNCTION public.apd_application_diary_cas(uuid,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_application_diary_cas(uuid,jsonb,integer) TO service_role;
COMMIT;

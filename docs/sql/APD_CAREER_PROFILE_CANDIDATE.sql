-- Candidate only. Execute in disposable PostgreSQL before any production migration.
BEGIN;
CREATE TABLE public.user_career_profile (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 profile jsonb NOT NULL,
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 2147483647),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT career_shape CHECK (
  jsonb_typeof(profile)='object' AND octet_length(profile::text)<=65536
  AND profile ?& ARRAY['schema','seniorityYears','positions']
  AND (profile - ARRAY['schema','seniorityYears','positions'])='{}'::jsonb
  AND profile->'schema'='1'::jsonb
  AND jsonb_typeof(profile->'seniorityYears')='number'
  AND CASE WHEN jsonb_typeof(profile->'positions')='array' THEN jsonb_array_length(profile->'positions')<=42 ELSE false END
 )
);
ALTER TABLE public.user_career_profile ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_career_profile FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_career_profile TO service_role;
-- The Worker validates every field; this RPC adds owner-scoped atomic CAS.
CREATE FUNCTION public.apd_career_profile_cas(p_user uuid,p_profile jsonb,p_revision integer)
RETURNS TABLE(profile jsonb,revision integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_user IS NULL OR p_profile IS NULL OR p_revision IS NULL OR p_revision<0 OR p_revision>=2147483647 THEN
  RAISE EXCEPTION 'invalid career write' USING ERRCODE='22023';
 END IF;
 IF p_revision=0 THEN
  RETURN QUERY INSERT INTO public.user_career_profile AS c(user_id,profile,revision)
   VALUES(p_user,p_profile,1) ON CONFLICT(user_id) DO NOTHING RETURNING c.profile,c.revision;
 ELSE
  RETURN QUERY UPDATE public.user_career_profile AS c SET profile=p_profile,revision=p_revision+1,updated_at=now()
   WHERE c.user_id=p_user AND c.revision=p_revision RETURNING c.profile,c.revision;
 END IF;
END;$$;
REVOKE ALL ON FUNCTION public.apd_career_profile_cas(uuid,jsonb,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_career_profile_cas(uuid,jsonb,integer) TO service_role;
COMMIT;
-- No changes to user_module_schedule, no automatic migration of user data.

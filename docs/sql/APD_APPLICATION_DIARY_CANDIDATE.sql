-- Candidate only. Manual entries, never official adjudication evidence.
BEGIN;
CREATE FUNCTION public.apd_valid_application_diary(entries jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE STRICT SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE e jsonb; k text; keys text[]:=ARRAY[]::text[]; stamp text; parsed timestamptz;
BEGIN
 IF jsonb_typeof(entries)<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(entries)>100 THEN RETURN false; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(entries) LOOP
  IF jsonb_typeof(e)<>'object' THEN RETURN false; END IF;
  IF NOT (e ?& ARRAY['key','status','origin','updatedAt']) OR (SELECT count(*) FROM jsonb_object_keys(e))<>4 THEN RETURN false; END IF;
  IF jsonb_typeof(e->'key')<>'string' OR jsonb_typeof(e->'status')<>'string' OR jsonb_typeof(e->'origin')<>'string' OR jsonb_typeof(e->'updatedAt')<>'string' THEN RETURN false; END IF;
  k:=e->>'key';
  IF char_length(k) NOT BETWEEN 1 AND 160 OR k COLLATE "C" ~ '[^A-Za-z0-9_.:|-]' OR k=ANY(keys) THEN RETURN false; END IF;
  IF e->>'origin'<>'self_reported' OR e->>'status' NOT IN ('postulada','en_evaluacion','adjudicada','no_adjudicada','retirada','sin_confirmar') THEN RETURN false; END IF;
  stamp:=e->>'updatedAt';
  IF length(stamp)<>24 OR stamp COLLATE "C" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN RETURN false; END IF;
  BEGIN
   parsed:=stamp::timestamptz;
   IF to_char(parsed AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')<>stamp THEN RETURN false; END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;
  END;
  keys:=array_append(keys,k);
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.apd_valid_application_diary(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.apd_valid_application_diary(jsonb) TO service_role;
CREATE TABLE public.user_application_diary(
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 entries jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(public.apd_valid_application_diary(entries)),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_application_diary ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_application_diary FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.user_application_diary TO service_role;
COMMIT;
-- Keep empty records with their revision; do not reset CAS on removal of last entry.

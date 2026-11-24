-- Offline candidate only; do not apply to production without separate approval.
BEGIN;
CREATE FUNCTION public.apd_valid_favorite_keys(keys text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = pg_catalog
AS $$
 SELECT cardinality(keys)<=50
 AND coalesce(array_ndims(keys),1)=1 AND coalesce(array_lower(keys,1),1)=1
 AND NOT EXISTS (SELECT 1 FROM unnest(keys) AS k(v)
   WHERE v IS NULL OR char_length(v) NOT BETWEEN 1 AND 160 OR v COLLATE "C" ~ '[^A-Za-z0-9_.:|-]')
 AND (SELECT count(DISTINCT v COLLATE "C") FROM unnest(keys) AS k(v))=cardinality(keys)
$$;
REVOKE ALL ON FUNCTION public.apd_valid_favorite_keys(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apd_valid_favorite_keys(text[]) TO service_role;
CREATE TABLE public.user_favorite_offers (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 keys text[] NOT NULL DEFAULT '{}',
 revision bigint NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (public.apd_valid_favorite_keys(keys))
);
ALTER TABLE public.user_favorite_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_favorite_offers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_favorite_offers TO service_role;
COMMIT;
-- Preserve data on rollback. Deleting a user cascades; removing last favorite retains revision.

-- CANDIDATE ONLY. Requires separately validated backend rollout.
BEGIN;
CREATE TABLE public.user_module_schedule (
 user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 modules text[] NOT NULL DEFAULT '{}',
 revision integer NOT NULL CHECK (revision > 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (cardinality(modules) <= 77 AND array_position(modules, NULL) IS NULL),
 CHECK (modules <@ ARRAY[
 'M1-1','M1-2','M1-3','M1-4','M1-5','M1-6','M1-7','M2-1','M2-2','M2-3','M2-4','M2-5','M2-6','M2-7','M3-1','M3-2','M3-3','M3-4','M3-5','M3-6','M3-7','M4-1','M4-2','M4-3','M4-4','M4-5','M4-6','M4-7','M5-1','M5-2','M5-3','M5-4','M5-5','M5-6','M5-7','T0-1','T0-2','T0-3','T0-4','T0-5','T0-6','T0-7','T1-1','T1-2','T1-3','T1-4','T1-5','T1-6','T1-7','T2-1','T2-2','T2-3','T2-4','T2-5','T2-6','T2-7','T3-1','T3-2','T3-3','T3-4','T3-5','T3-6','T3-7','T4-1','T4-2','T4-3','T4-4','T4-5','T4-6','T4-7','T5-1','T5-2','T5-3','T5-4','T5-5','T5-6','T5-7'
 ]::text[])
);
ALTER TABLE public.user_module_schedule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_module_schedule FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_module_schedule TO service_role;
COMMIT;
-- Keep data during rollback. Do not DROP after legitimate user writes.

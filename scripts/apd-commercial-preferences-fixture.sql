CREATE TABLE public.user_preferences(user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,distrito_principal text,otros_distritos text[] NOT NULL DEFAULT '{}',cargos text[] NOT NULL DEFAULT '{}',materias text[] NOT NULL DEFAULT '{}',niveles text[] NOT NULL DEFAULT '{}',turnos text[] NOT NULL DEFAULT '{}',alertas_activas boolean NOT NULL DEFAULT true,alertas_email boolean NOT NULL DEFAULT true,alertas_whatsapp boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),alertas_telegram boolean NOT NULL DEFAULT false);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON public.user_preferences TO service_role;
INSERT INTO public.user_preferences(user_id,distrito_principal,otros_distritos,cargos,alertas_whatsapp,alertas_telegram) VALUES('00000000-0000-4000-8000-000000000005','AVELLANEDA',ARRAY['QUILMES'],ARRAY['MAT','FIS'],true,true);
CREATE TABLE public.apd_pref_qa_snapshot AS SELECT to_jsonb(p) AS snapshot FROM public.user_preferences p WHERE user_id='00000000-0000-4000-8000-000000000005';
GRANT SELECT ON public.apd_pref_qa_snapshot TO service_role;

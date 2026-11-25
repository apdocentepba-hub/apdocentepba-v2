-- Disposable CI database only. Roles are shared with the SQL regression database.
CREATE TABLE public.users (
 id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 nombre text, apellido text, celular text, activo boolean DEFAULT true,
 es_admin boolean DEFAULT false, created_at timestamptz DEFAULT now(), ultimo_login timestamptz
);
CREATE TABLE public.sessions (
 token text PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.users(id),
 metodo text NOT NULL, created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 activo boolean NOT NULL
);
CREATE TABLE public.user_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id),
 plan_code text NOT NULL, status text NOT NULL, source text NOT NULL,
 created_at timestamptz DEFAULT now(), started_at timestamptz DEFAULT now(),
 trial_ends_at timestamptz, current_period_ends_at timestamptz, mercadopago_preapproval_id text
);
GRANT SELECT, UPDATE ON public.users TO service_role;
GRANT SELECT, INSERT ON public.sessions TO service_role;
GRANT SELECT ON public.user_subscriptions TO service_role;

INSERT INTO public.users (id,email,password_hash) VALUES
 ('11111111-1111-4111-8111-111111111111','career-a@example.invalid','career-fixture-a'),
 ('22222222-2222-4222-8222-222222222222','career-b@example.invalid','career-fixture-b');
INSERT INTO public.user_subscriptions (user_id,plan_code,status,source,current_period_ends_at)
 SELECT id,'INSIGNE','ACTIVE','mercadopago_checkout',now()+interval '1 day' FROM public.users;

-- Known offer for the existing deployed diary's indexed identity check.
CREATE TABLE public.apd_ofertas_global_current (
 source_offer_key text PRIMARY KEY, idoferta bigint, iddetalle bigint,
 estado text NOT NULL, finoferta text, escuela text, distrito text, cargo text
);
GRANT SELECT ON public.apd_ofertas_global_current TO service_role;
INSERT INTO public.apd_ofertas_global_current(source_offer_key,idoferta,iddetalle,estado,finoferta,escuela,distrito,cargo)
VALUES ('D_121',121,121,'PUBLICADA',to_char(now()+interval '1 day','YYYY-MM-DD"T"HH24:MI:SS'),'Escuela de ensayo','Distrito de ensayo','Matemática');

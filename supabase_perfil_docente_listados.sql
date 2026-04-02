create extension if not exists pgcrypto;

create table if not exists user_identity_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  dni text not null,
  dni_hash text not null,
  consentimiento_datos boolean not null default false,
  last_sync_at timestamptz,
  sync_status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_identity_profile_user_id on user_identity_profile(user_id);
create index if not exists idx_user_identity_profile_dni_hash on user_identity_profile(dni_hash);

create table if not exists user_listados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  anio integer,
  tipo_listado text,
  distrito text,
  cargo text,
  materia text,
  cargo_materia_normalizado text,
  puntaje numeric(10,2),
  fuente text,
  raw_text text,
  confidence numeric(5,2),
  validado boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_user_listados_user_id on user_listados(user_id);
create index if not exists idx_user_listados_norm on user_listados(user_id, cargo_materia_normalizado);

create table if not exists user_listados_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_type text not null,
  source_name text,
  raw_content text,
  parse_status text default 'pending',
  parse_message text,
  imported_rows integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_user_listados_imports_user_id on user_listados_imports(user_id);

create table if not exists offer_eligibility (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  offer_id text not null,
  compatible boolean default false,
  match_type text,
  puntaje_usuario numeric(10,2),
  tipo_listado_detectado text,
  score_competitividad numeric(5,2),
  confidence_level text,
  strategic_message text,
  computed_at timestamptz default now(),
  unique(user_id, offer_id)
);

create index if not exists idx_offer_eligibility_user_id on offer_eligibility(user_id);
create index if not exists idx_offer_eligibility_offer_id on offer_eligibility(offer_id);

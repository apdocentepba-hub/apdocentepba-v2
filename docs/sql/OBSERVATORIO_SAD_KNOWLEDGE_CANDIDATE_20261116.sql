-- CANDIDATO, NO EJECUTAR EN PRODUCCION SIN APROBAR ESQUEMA, COSTO Y RETENCION.
-- Base de conocimiento pública ABC/SAD: metadatos, texto por página y hechos con evidencia.
-- Sin binarios en Postgres; los originales permanecen en ABC/Drive.
-- Acceso de aplicación solo a través del Worker autenticado. Nunca exponer service_role.

BEGIN;

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  source_type text NOT NULL CHECK (source_type IN (
    'abc_central', 'sad_abc', 'sad_external', 'drive_archive'
  )),
  name text NOT NULL,
  canonical_url text,
  district_code text,
  district_name text,
  officiality text NOT NULL DEFAULT 'candidate' CHECK (
    officiality IN ('confirmed', 'candidate', 'manual')
  ),
  active boolean NOT NULL DEFAULT true,
  poll_interval_minutes integer CHECK (
    poll_interval_minutes IS NULL OR poll_interval_minutes >= 60
  ),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_http_status integer,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE RESTRICT,
  stable_key text NOT NULL,
  version_hash text NOT NULL CHECK (version_hash ~ '^[a-f0-9]{64}$'),
  title text NOT NULL,
  document_type text,
  source_url text,
  drive_file_id text,
  mime_type text,
  district_code text,
  district_name text,
  issuer text,
  issued_at date,
  published_at timestamptz,
  valid_from date,
  valid_until date,
  temporal_status text NOT NULL DEFAULT 'uncertain' CHECK (
    temporal_status IN ('current', 'historical', 'superseded', 'withdrawn', 'uncertain')
  ),
  extraction_status text NOT NULL DEFAULT 'pending' CHECK (
    extraction_status IN ('pending', 'text_ready', 'ocr_required', 'partial', 'failed', 'reviewed')
  ),
  page_count integer CHECK (page_count IS NULL OR page_count > 0),
  supersedes_id uuid REFERENCES public.knowledge_documents(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, stable_key, version_hash)
);

CREATE TABLE IF NOT EXISTS public.knowledge_passages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  page_number integer CHECK (page_number IS NULL OR page_number > 0),
  section_title text,
  passage_text text NOT NULL,
  search_vector tsvector NOT NULL DEFAULT ''::tsvector,
  extraction_confidence numeric(4,3) CHECK (
    extraction_confidence IS NULL OR extraction_confidence BETWEEN 0 AND 1
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, ordinal)
);

CREATE TABLE IF NOT EXISTS public.knowledge_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  fact_key text NOT NULL,
  fact_value jsonb NOT NULL,
  district_code text,
  district_name text,
  valid_from date,
  valid_until date,
  review_status text NOT NULL DEFAULT 'unreviewed' CHECK (
    review_status IN ('unreviewed', 'verified', 'conflicting', 'rejected')
  ),
  evidence_passage_id uuid REFERENCES public.knowledge_passages(id) ON DELETE SET NULL,
  evidence_quote text,
  extraction_confidence numeric(4,3) CHECK (
    extraction_confidence IS NULL OR extraction_confidence BETWEEN 0 AND 1
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  to_document_id uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN (
    'same_notice', 'rectifies', 'supersedes', 'repeats', 'local_variant', 'related'
  )),
  evidence text,
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  reviewed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_document_id, to_document_id, relation_type),
  CHECK (from_document_id <> to_document_id)
);

CREATE INDEX IF NOT EXISTS knowledge_sources_district_active_idx
  ON public.knowledge_sources (district_code, active);
CREATE INDEX IF NOT EXISTS knowledge_documents_temporal_idx
  ON public.knowledge_documents (temporal_status, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS knowledge_documents_district_date_idx
  ON public.knowledge_documents (district_code, published_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_documents_hash_idx
  ON public.knowledge_documents (version_hash);
CREATE INDEX IF NOT EXISTS knowledge_passages_search_gin_idx
  ON public.knowledge_passages USING gin (search_vector);
CREATE INDEX IF NOT EXISTS knowledge_facts_key_idx
  ON public.knowledge_facts (fact_key, district_code, review_status);
CREATE INDEX IF NOT EXISTS knowledge_relations_target_idx
  ON public.knowledge_relations (to_document_id, relation_type);

ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.knowledge_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.knowledge_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.knowledge_passages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.knowledge_facts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.knowledge_relations FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_sources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_passages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_facts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.knowledge_relations TO service_role;

COMMIT;

-- El ingestor debe generar search_vector con configuración Spanish y texto normalizado.
-- No hay vectores semánticos en esta etapa: la extensión vector no está instalada
-- en el proyecto APDocente verificado. Se empieza con full-text y citas de página.
-- Antes de una importación histórica se debe medir el tamaño real del texto extraído,
-- el almacenamiento disponible, el costo y la política de respaldos/retención.

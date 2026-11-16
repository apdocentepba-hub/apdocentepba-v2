-- CANDIDATO, NO EJECUTAR EN PRODUCCION SIN APROBAR ESQUEMA, COSTO Y RETENCION.
-- Base privada de investigación ABC/SAD bajo pedido del titular; no es un feed para todos los usuarios.
-- Este SQL no publica datos ni crea rutas de lectura para usuarios; los originales permanecen en ABC/Drive privado.
-- Sin acceso anon. Lectura autenticada aislada por owner_user_id; escrituras solo service_role.
-- El service_role evita RLS: cualquier ruta backend debe validar y filtrar el owner antes de responder.

BEGIN;

CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_key text NOT NULL,
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
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_http_status integer,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, source_key)
);

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
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

-- Mantiene el vector de búsqueda a partir del texto guardado.
CREATE OR REPLACE FUNCTION public.knowledge_passages_refresh_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  NEW.search_vector :=
    pg_catalog.to_tsvector(
      'pg_catalog.spanish'::pg_catalog.regconfig,
      pg_catalog.concat_ws(' ', NEW.section_title, NEW.passage_text)
    );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS knowledge_passages_refresh_search_vector_trg
  ON public.knowledge_passages;
CREATE TRIGGER knowledge_passages_refresh_search_vector_trg
  BEFORE INSERT OR UPDATE OF section_title, passage_text
  ON public.knowledge_passages
  FOR EACH ROW
  EXECUTE FUNCTION public.knowledge_passages_refresh_search_vector();

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

CREATE INDEX IF NOT EXISTS knowledge_sources_owner_district_active_idx
  ON public.knowledge_sources (owner_user_id, district_code, active);
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

-- Cada usuario solo puede leer su propia biblioteca. Al eliminarse su cuenta, la biblioteca se elimina en cascada. No hay políticas para anon.
CREATE POLICY knowledge_sources_select_owner
  ON public.knowledge_sources FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY knowledge_documents_select_owner
  ON public.knowledge_documents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.knowledge_sources s
    WHERE s.id = source_id AND s.owner_user_id = auth.uid()
  ));

CREATE POLICY knowledge_passages_select_owner
  ON public.knowledge_passages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.knowledge_documents d
    JOIN public.knowledge_sources s ON s.id = d.source_id
    WHERE d.id = document_id AND s.owner_user_id = auth.uid()
  ));

CREATE POLICY knowledge_facts_select_owner
  ON public.knowledge_facts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.knowledge_documents d
    JOIN public.knowledge_sources s ON s.id = d.source_id
    WHERE d.id = document_id AND s.owner_user_id = auth.uid()
  ));

CREATE POLICY knowledge_relations_select_owner
  ON public.knowledge_relations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents d
      JOIN public.knowledge_sources s ON s.id = d.source_id
      WHERE d.id = from_document_id AND s.owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.knowledge_documents d
      JOIN public.knowledge_sources s ON s.id = d.source_id
      WHERE d.id = to_document_id AND s.owner_user_id = auth.uid()
    )
  );

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

-- Lectura autenticada solo dentro de la biblioteca propia, restringida por las políticas anteriores.
GRANT SELECT ON TABLE public.knowledge_sources TO authenticated;
GRANT SELECT ON TABLE public.knowledge_documents TO authenticated;
GRANT SELECT ON TABLE public.knowledge_passages TO authenticated;
GRANT SELECT ON TABLE public.knowledge_facts TO authenticated;
GRANT SELECT ON TABLE public.knowledge_relations TO authenticated;

-- Búsqueda textual bajo RLS: el usuario solo obtiene pasajes de su propia biblioteca.
CREATE OR REPLACE FUNCTION public.search_private_knowledge(
  p_query text,
  p_district_code text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  document_id uuid,
  title text,
  source_url text,
  district_name text,
  issued_at date,
  published_at timestamptz,
  temporal_status text,
  page_number integer,
  section_title text,
  passage_text text,
  relevance real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  SELECT
    d.id,
    d.title,
    d.source_url,
    d.district_name,
    d.issued_at,
    d.published_at,
    d.temporal_status,
    p.page_number,
    p.section_title,
    p.passage_text,
    pg_catalog.ts_rank_cd(
      p.search_vector,
      pg_catalog.websearch_to_tsquery(
        'pg_catalog.spanish'::pg_catalog.regconfig,
        pg_catalog.left(pg_catalog.btrim(COALESCE(p_query, '')), 500)
      )
    ) AS relevance
  FROM public.knowledge_passages p
  JOIN public.knowledge_documents d ON d.id = p.document_id
  WHERE pg_catalog.length(pg_catalog.btrim(COALESCE(p_query, ''))) >= 2
    AND p.search_vector @@ pg_catalog.websearch_to_tsquery(
      'pg_catalog.spanish'::pg_catalog.regconfig,
      pg_catalog.left(pg_catalog.btrim(COALESCE(p_query, '')), 500)
    )
    AND (p_district_code IS NULL OR d.district_code = p_district_code)
  ORDER BY relevance DESC, COALESCE(d.published_at, d.captured_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
$function$;

REVOKE ALL ON FUNCTION public.search_private_knowledge(text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_private_knowledge(text, text, integer)
  TO authenticated;

COMMIT;

-- Un trigger genera search_vector con pg_catalog.spanish al escribir/editar cada pasaje.
-- No hay vectores semánticos en esta etapa: la extensión vector no está instalada
-- en el proyecto APDocente verificado. Se empieza con full-text y citas de página.
-- Antes de una importación histórica se debe medir el tamaño real del texto extraído,
-- el almacenamiento disponible, el costo y la política de respaldos/retención.

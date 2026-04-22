/**
 * PGLite schema — derived from src/schema.sql (K2 Postgres schema).
 *
 * Differences from Postgres:
 * - No RLS block (no role system in embedded PGLite)
 * - No pgcrypto / access_tokens / mcp_request_log (local-only, no remote auth)
 * - No files table (file attachments require Supabase Storage)
 * - No pg_advisory_lock (single connection)
 *
 * Everything else is identical: same tables, same triggers, same indexes,
 * pgvector HNSW, tsvector GIN. Shape contract lives in specs/operations/*.md;
 * see docs/plans/2026-04-21-phase-2b-schema-plumbing.md §D5 for the column-to-spec
 * mapping.
 *
 * DRIFT WARNING: when src/schema.sql changes, update this file to match.
 */

export const PGLITE_SCHEMA_SQL = `
-- GBrain PGLite schema (local embedded Postgres) — K2 shape

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- entities: one row per K2 entity, 1:1 with a wiki markdown file
-- ============================================================
CREATE TABLE IF NOT EXISTS entities (
  id             SERIAL PRIMARY KEY,
  slug           TEXT    NOT NULL UNIQUE,
  type           TEXT    NOT NULL,               -- K2 category enum per K2_SCHEMA.md §Filing Rules
  title          TEXT    NOT NULL,
  compiled_truth TEXT    NOT NULL DEFAULT '',
  struct_hash    TEXT,                           -- nullable: RECOVER phase-4 shells
  aliases        TEXT[]  NOT NULL DEFAULT '{}',  -- dedup + search surface
  tags           TEXT[]  NOT NULL DEFAULT '{}',  -- promoted from legacy \`tags\` table
  frontmatter    JSONB   NOT NULL DEFAULT '{}',
  timeline       TEXT    NOT NULL DEFAULT '',    -- DEPRECATED: kept for rollback; new code MUST NOT write
  content_hash   TEXT,                           -- legacy, kept for back-compat; prefer struct_hash
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_frontmatter ON entities USING GIN(frontmatter);
CREATE INDEX IF NOT EXISTS idx_entities_title_trgm ON entities USING GIN(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_aliases ON entities USING GIN(aliases);
CREATE INDEX IF NOT EXISTS idx_entities_tags ON entities USING GIN(tags);

-- ============================================================
-- sources: raw zone files as first-class DB records
-- Written by register_source / update_source_path / set_source_status.
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id           SERIAL PRIMARY KEY,
  path         TEXT    NOT NULL UNIQUE,          -- vault-relative, under human/** or sources/**
  content_hash TEXT,                             -- null when RECOVER-reconstructed
  status       TEXT    NOT NULL DEFAULT 'active', -- 'active' | 'deleted' (soft-delete)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);

-- ============================================================
-- entity_sources: junction mapping sources to the entities they contributed to
-- Written by link_entity_source / unlink_entity_source.
-- FK cascades on entity_id so delete_entity auto-prunes the junction.
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_sources (
  entity_id  INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_id  INTEGER NOT NULL REFERENCES sources(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_sources_source ON entity_sources(source_id);

-- ============================================================
-- content_chunks: chunked compiled_truth + timeline text with vector embeddings
-- Written by compile_embed (delete-then-insert per entity).
-- ============================================================
CREATE TABLE IF NOT EXISTS content_chunks (
  id            SERIAL PRIMARY KEY,
  entity_id     INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  chunk_text    TEXT    NOT NULL,
  chunk_source  TEXT    NOT NULL DEFAULT 'compiled_truth', -- 'compiled_truth' | 'timeline'
  embedding     vector(1536),
  model         TEXT    NOT NULL DEFAULT 'text-embedding-3-large',
  token_count   INTEGER,
  embedded_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_entity_index ON content_chunks(entity_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_chunks_entity ON content_chunks(entity_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON content_chunks USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- links: typed directed edges between entities
-- Written by add_link (upsert on (from, to, link_type)).
-- \`inferred\` flags structural-inference edges per K2_DESIGN.md §Principle 4.
-- ============================================================
CREATE TABLE IF NOT EXISTS links (
  id             SERIAL PRIMARY KEY,
  from_entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_entity_id   INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  link_type      TEXT    NOT NULL,               -- verb, e.g. 'parent_of'; non-empty enforced upstream
  context        TEXT    NOT NULL DEFAULT '',
  inferred       BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_entity_id, to_entity_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_links_to   ON links(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_links_inferred ON links(inferred) WHERE inferred;

-- ============================================================
-- timeline_entries: append-only event ledger
-- Written by add_timeline_entry. \`source_id\` replaces the pre-K2 \`source TEXT\`.
-- ============================================================
CREATE TABLE IF NOT EXISTS timeline_entries (
  id         SERIAL PRIMARY KEY,
  entity_id  INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  date       DATE    NOT NULL,
  summary    TEXT    NOT NULL,
  detail     TEXT    NOT NULL DEFAULT '',
  source_id  INTEGER NOT NULL REFERENCES sources(id), -- NO cascade: source soft-deletes, row stays
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_entity ON timeline_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_timeline_date   ON timeline_entries(date);
CREATE INDEX IF NOT EXISTS idx_timeline_source ON timeline_entries(source_id);

-- ============================================================
-- entity_versions: snapshot history for compiled_truth (renamed from page_versions)
-- ============================================================
CREATE TABLE IF NOT EXISTS entity_versions (
  id             SERIAL PRIMARY KEY,
  entity_id      INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  compiled_truth TEXT    NOT NULL,
  frontmatter    JSONB   NOT NULL DEFAULT '{}',
  snapshot_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_versions_entity ON entity_versions(entity_id);

-- ============================================================
-- raw_data: sidecar data (replaces .raw/ JSON files)
-- Keyed on entity_id after the rename.
-- ============================================================
CREATE TABLE IF NOT EXISTS raw_data (
  id         SERIAL PRIMARY KEY,
  entity_id  INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source     TEXT    NOT NULL,
  data       JSONB   NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_id, source)
);

CREATE INDEX IF NOT EXISTS idx_raw_data_entity ON raw_data(entity_id);

-- ============================================================
-- ingest_log
-- ============================================================
CREATE TABLE IF NOT EXISTS ingest_log (
  id               SERIAL PRIMARY KEY,
  source_type      TEXT    NOT NULL,
  source_ref       TEXT    NOT NULL,
  entities_updated JSONB   NOT NULL DEFAULT '[]',
  summary          TEXT    NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- config: brain-level settings
-- ============================================================
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO config (key, value) VALUES
  ('version', '2'),                               -- K2 rehaul bumps schema version
  ('engine', 'pglite'),
  ('embedding_model', 'text-embedding-3-large'),
  ('embedding_dimensions', '1536'),
  ('chunk_strategy', 'recursive')                 -- deterministic tier for RECOVER round-trip
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Trigger-based search_vector on entities (spans title + compiled_truth + timeline_entries text)
-- Legacy from pre-K2 keyword search; retained for commands that still rely on it.
-- The K2 \`search\` op uses structured fields (title/aliases/tags via trigram + GIN);
-- the K2 \`query\` op uses \`content_chunks\` + hybrid RRF. This trigger is redundant
-- with those paths but cheap to keep for transitional callers.
-- ============================================================
ALTER TABLE entities ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE INDEX IF NOT EXISTS idx_entities_search ON entities USING GIN(search_vector);

CREATE OR REPLACE FUNCTION update_entity_search_vector() RETURNS trigger AS $$
DECLARE
  timeline_text TEXT;
BEGIN
  SELECT coalesce(string_agg(summary || ' ' || detail, ' '), '')
  INTO   timeline_text
  FROM   timeline_entries
  WHERE  entity_id = NEW.id;

  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')),          'A') ||
    setweight(to_tsvector('english', coalesce(NEW.compiled_truth, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(timeline_text, '')),      'C');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entities_search_vector ON entities;
CREATE TRIGGER trg_entities_search_vector
  BEFORE INSERT OR UPDATE ON entities
  FOR EACH ROW
  EXECUTE FUNCTION update_entity_search_vector();

CREATE OR REPLACE FUNCTION update_entity_search_vector_from_timeline() RETURNS trigger AS $$
BEGIN
  UPDATE entities SET updated_at = now()
  WHERE id = coalesce(NEW.entity_id, OLD.entity_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_timeline_search_vector ON timeline_entries;
CREATE TRIGGER trg_timeline_search_vector
  AFTER INSERT OR UPDATE OR DELETE ON timeline_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_entity_search_vector_from_timeline();
`;

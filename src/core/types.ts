// K2 TypeScript types. Shape contract: specs/operations/*.md + K2_SCHEMA.md.
// Phase 2b Step 4 — renames Page→Entity, adds op-return shapes. See
// docs/plans/2026-04-21-phase-2b-schema-plumbing.md §D1–D6.

// ============================================================
// Entities
// ============================================================

/** K2 page categories per K2_SCHEMA.md §Filing Rules. */
export type EntityType =
  | 'people'
  | 'places'
  | 'projects'
  | 'companies'
  | 'ideas'
  | 'originals'
  | 'concepts'
  | 'how-to'
  | 'media'
  | 'tools'
  | 'meetings'
  | 'decisions'
  | 'household'
  | 'personal'
  | 'org'
  | 'writing';

export const ENTITY_TYPES: readonly EntityType[] = [
  'people', 'places', 'projects', 'companies', 'ideas', 'originals',
  'concepts', 'how-to', 'media', 'tools', 'meetings', 'decisions',
  'household', 'personal', 'org', 'writing',
] as const;

/** Full entity row returned by `get_entity`. Timestamps are ISO-8601 UTC. */
export interface Entity {
  slug: string;
  type: EntityType;
  title: string;
  compiled_truth: string;
  struct_hash: string | null;
  tags: string[];
  aliases: string[];
  frontmatter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Compact summary for `list_entities`; no `compiled_truth`, no `frontmatter`. */
export interface EntitySummary {
  slug: string;
  type: EntityType;
  title: string;
  tags: string[];
  aliases: string[];
  struct_hash: string | null;
  created_at: string;
  updated_at: string;
}

/** Input shape for `compile_put_page`. `struct_hash` is caller-computed. */
export interface EntityInput {
  slug: string;
  type: EntityType;
  title: string;
  compiled_truth: string;
  struct_hash: string;
  tags?: string[];
  aliases?: string[];
  frontmatter?: Record<string, unknown>;
}

export interface EntityFilters {
  type?: EntityType;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface EntityVersion {
  id: number;
  entity_id: number;
  compiled_truth: string;
  frontmatter: Record<string, unknown>;
  snapshot_at: string;
}

// ============================================================
// Sources + entity_sources junction
// ============================================================

export type SourceStatus = 'active' | 'deleted';

export interface Source {
  id: number;
  path: string;
  content_hash: string | null;
  status: SourceStatus;
  created_at: string;
}

export interface EntitySource {
  entity_id: number;
  source_id: number;
  created_at: string;
}

// ============================================================
// Chunks (content_chunks)
// ============================================================

export type ChunkSource = 'compiled_truth' | 'timeline';

export interface Chunk {
  id: number;
  entity_id: number;
  chunk_index: number;
  chunk_text: string;
  chunk_source: ChunkSource;
  embedding: Float32Array | null;
  model: string;
  token_count: number | null;
  embedded_at: string | null;
}

export interface ChunkInput {
  chunk_index: number;
  chunk_text: string;
  chunk_source: ChunkSource;
  embedding?: Float32Array;
  model?: string;
  token_count?: number;
}

// ============================================================
// Links
// ============================================================

export type LinkDirection = 'outbound' | 'inbound' | 'both';

export interface Link {
  from_slug: string;
  to_slug: string;
  link_type: string;
  inferred: boolean;
  context: string;
  created_at: string;
}

export interface LinkInput {
  from_slug: string;
  to_slug: string;
  link_type: string;
  inferred: boolean;
  context?: string;
}

export interface LinkFilters {
  entity_slug: string;
  direction: LinkDirection;
  link_type?: string;
  inferred?: boolean;
}

// ============================================================
// Timeline
// ============================================================

export interface TimelineEntry {
  entry_id: number;
  date: string;        // YYYY-MM-DD
  summary: string;
  detail: string;
  source_path: string; // resolved from sources.id on read
  created_at: string;
}

export interface TimelineInput {
  entity_slug: string;
  date: string;
  summary: string;
  source_path: string;
  detail?: string;
}

export interface TimelineFilters {
  entity_slug: string;
  since?: string;
  until?: string;
}

// ============================================================
// Search (identity fields: title + aliases + tags)
// ============================================================

export type SearchMatchedField = 'title' | 'alias' | 'tag' | 'mixed';

export interface SearchResult {
  slug: string;
  type: EntityType;
  title: string;
  tags: string[];
  aliases: string[];
  score: number;
  matched_field: SearchMatchedField;
}

export interface SearchOpts {
  type?: EntityType;
  tag?: string;
  min_score?: number;
  limit?: number;
  offset?: number;
}

export interface SearchEnvelope {
  items: SearchResult[];
  total: number;
  offset: number;
  limit: number;
}

// ============================================================
// Query (hybrid content-chunk retrieval)
// ============================================================

export interface QueryResult {
  entity_slug: string;
  entity_title: string;
  entity_type: EntityType;
  chunk_text: string;
  chunk_source: ChunkSource;
  score: number;
  vector_score: number | null;
  keyword_score: number | null;
}

export interface QueryOpts {
  type?: EntityType;
  tag?: string;
  chunk_source?: ChunkSource;
  min_score?: number;
  limit?: number;
  offset?: number;
}

export interface QueryEnvelope {
  items: QueryResult[];
  total: number;
  offset: number;
  limit: number;
}

// ============================================================
// Graph traversal (get_graph)
// ============================================================

export type GraphDirection = LinkDirection;

export interface GraphNode {
  slug: string;
  type: EntityType;
  title: string;
  min_depth: number;
}

export interface GraphEdge {
  from_slug: string;
  to_slug: string;
  link_type: string;
  inferred: boolean;
  context: string;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  depth_reached: number;
}

export interface GraphOpts {
  entity_slug: string;
  direction: GraphDirection;
  depth: number;
  link_type?: string;
  inferred?: boolean;
  max_nodes?: number;
}

// ============================================================
// Op return shapes (per specs/operations/*.md)
// ============================================================

export interface PutEntityResult {
  slug: string;
  status: 'created' | 'updated' | 'noop';
  prior_struct_hash: string | null;
}

export interface AddLinkResult {
  link_id: number;
  status: 'created' | 'updated' | 'noop';
  prior: {
    inferred: boolean;
    context: string;
  } | null;
}

export interface DeleteLinkResult {
  link_id: number;
  action: 'deleted' | 'noop';
  prior: {
    from_slug: string | null;
    to_slug: string | null;
    link_type: string;
    inferred: boolean;
    context: string;
  } | null;
}

export interface AddTimelineEntryResult {
  entry_id: number;
  entity_slug: string;
  date: string;
}

export interface RegisterSourceResult {
  source_id: number;
  path: string;
  status: 'active';
}

export interface UpdateSourcePathResult {
  source_id: number;
  old_path: string;
  new_path: string;
}

export interface SetSourceStatusResult {
  source_id: number;
  path: string;
  prior_status: SourceStatus;
  new_status: SourceStatus;
  action: 'updated' | 'noop';
}

export interface LinkEntitySourceResult {
  entity_slug: string;
  source_path: string;
  status: 'created' | 'noop';
}

export interface UnlinkEntitySourceResult {
  entity_slug: string;
  source_path: string;
  action: 'deleted' | 'noop';
}

export interface DeleteEntityResult {
  entity_slug: string;
  action: 'deleted' | 'noop';
  rows_removed: {
    entities: number;
    links: number;
    timeline_entries: number;
    entity_sources: number;
    content_chunks: number;
  };
  wiki_file_status: 'removed' | 'not_found' | 'delete_failed' | 'preserved';
}

export interface CompileRenderResult {
  path: string;
  action: 'created' | 'overwritten' | 'unchanged' | 'dry_run';
  content?: string;
}

export interface CompileEmbedResult {
  entity_slug: string;
  chunks_written: number;
  chunks_removed: number;
  tokens_encoded: number;
  model: string;
}

export interface ListEntitiesResult {
  items: EntitySummary[];
  total: number;
  offset: number;
  limit: number | null;
}

// ============================================================
// Sidecar / ancillary types
// ============================================================

export interface RawData {
  source: string;
  data: Record<string, unknown>;
  fetched_at: string;
}

export interface BrainStats {
  entity_count: number;
  chunk_count: number;
  embedded_count: number;
  link_count: number;
  tag_count: number;
  timeline_entry_count: number;
  entities_by_type: Record<string, number>;
}

export interface BrainHealth {
  entity_count: number;
  embed_coverage: number;
  stale_entities: number;
  orphan_entities: number;
  dead_links: number;
  missing_embeddings: number;
  brain_score: number;
}

export interface IngestLogEntry {
  id: number;
  source_type: string;
  source_ref: string;
  entities_updated: string[];
  summary: string;
  created_at: string;
}

export interface IngestLogInput {
  source_type: string;
  source_ref: string;
  entities_updated: string[];
  summary: string;
}

// ============================================================
// Engine config + errors
// ============================================================

export interface EngineConfig {
  database_url?: string;
  database_path?: string;
  engine?: 'postgres' | 'pglite';
}

export class GBrainError extends Error {
  constructor(
    public problem: string,
    public cause_description: string,
    public fix: string,
    public docs_url?: string,
  ) {
    super(`${problem}: ${cause_description}. Fix: ${fix}`);
    this.name = 'GBrainError';
  }
}

// K2 BrainEngine interface. Method set is derived from specs/operations/*.md;
// each op in that directory maps to exactly one method here. Infrastructure
// methods (lifecycle, config, migration, fuzzy slug resolution) are grouped
// at the top; K2 op methods follow, ordered by write-then-read within each
// primitive (entities → sources → links → timeline → search → graph → compile).
//
// Phase 2b step 5 of docs/plans/2026-04-21-phase-2b-schema-plumbing.md.
// Steps 6 (pglite-engine.ts) and 7 (postgres-engine.ts) port the impls.

import type {
  // entities
  Entity, EntityInput, EntityFilters, EntityVersion,
  ListEntitiesResult, PutEntityResult, DeleteEntityResult,
  // sources
  Source, SourceStatus,
  RegisterSourceResult, UpdateSourcePathResult, SetSourceStatusResult,
  LinkEntitySourceResult, UnlinkEntitySourceResult,
  // links
  Link, LinkInput, LinkFilters,
  AddLinkResult, DeleteLinkResult,
  // timeline
  TimelineEntry, TimelineInput, TimelineFilters,
  AddTimelineEntryResult,
  // chunks
  Chunk, ChunkInput,
  // search + query
  SearchOpts, SearchEnvelope,
  QueryOpts, QueryEnvelope,
  // graph
  GraphOpts, GraphResult,
  // compile
  CompileRenderResult, CompileEmbedResult,
  // ancillary (retained for transitional commands; pruned in step 11)
  RawData,
  BrainStats, BrainHealth,
  IngestLogEntry, IngestLogInput,
  // config
  EngineConfig,
} from './types.ts';

/** Maximum results returned by user-facing retrieval ops (search, query). */
export const MAX_SEARCH_LIMIT = 100;

/**
 * Clamp a user-provided search limit to a safe range. Search/query ops
 * default to 20; `list_entities` callers may pass through unclamped.
 */
export function clampSearchLimit(limit: number | undefined, defaultLimit = 20, cap = MAX_SEARCH_LIMIT): number {
  if (limit === undefined || limit === null || !Number.isFinite(limit) || Number.isNaN(limit)) return defaultLimit;
  if (limit <= 0) return defaultLimit;
  return Math.min(Math.floor(limit), cap);
}

export interface BrainEngine {
  // ============================================================
  // Lifecycle + infrastructure
  // ============================================================

  connect(config: EngineConfig): Promise<void>;
  disconnect(): Promise<void>;
  initSchema(): Promise<void>;
  transaction<T>(fn: (engine: BrainEngine) => Promise<T>): Promise<T>;

  /** Canonical-slug fuzzy resolution (CLI + ASK lookups). */
  resolveSlugs(partial: string): Promise<string[]>;

  /** Key/value helpers for the `config` table. */
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;

  /** Raw SQL migration runner; see `src/core/migrate.ts`. */
  runMigration(version: number, sql: string): Promise<void>;

  // ============================================================
  // Entity Registry (compile_put_page, get_entity, list_entities, delete_entity)
  // ============================================================

  /**
   * Structured upsert — the sole write path for `entities`. See
   * specs/operations/compile_put_page.md.
   */
  compilePutPage(input: EntityInput): Promise<PutEntityResult>;

  /** Fetch one entity row by slug. Returns null when absent. */
  getEntity(slug: string): Promise<Entity | null>;

  /**
   * Paginated list with optional type/tag filters. See
   * specs/operations/list_entities.md.
   */
  listEntities(filters?: EntityFilters): Promise<ListEntitiesResult>;

  /**
   * Cascade-delete one entity plus its junction rows and (optionally)
   * its rendered wiki file. See specs/operations/delete_entity.md.
   */
  deleteEntity(input: {
    entity_slug: string;
    preserve_wiki_file?: boolean;
  }): Promise<DeleteEntityResult>;

  // ============================================================
  // Source Registry (register_source, update_source_path, set_source_status)
  // ============================================================

  registerSource(input: {
    path: string;
    content_hash: string | null;
  }): Promise<RegisterSourceResult>;

  updateSourcePath(input: {
    old_path: string;
    new_path: string;
  }): Promise<UpdateSourcePathResult>;

  setSourceStatus(input: {
    path: string;
    new_status: SourceStatus;
  }): Promise<SetSourceStatusResult>;

  /** Read one source by path. Internal helper for ops that resolve source_id. */
  getSourceByPath(path: string): Promise<Source | null>;

  // ============================================================
  // Source ↔ Entity Map (link_entity_source, unlink_entity_source)
  // ============================================================

  linkEntitySource(input: {
    entity_slug: string;
    source_path: string;
  }): Promise<LinkEntitySourceResult>;

  unlinkEntitySource(input: {
    entity_slug: string;
    source_path: string;
  }): Promise<UnlinkEntitySourceResult>;

  // ============================================================
  // Relationship Graph (add_link, get_links, delete_link, get_graph)
  // ============================================================

  addLink(input: LinkInput): Promise<AddLinkResult>;

  getLinks(filters: LinkFilters): Promise<Link[]>;

  deleteLink(linkId: number): Promise<DeleteLinkResult>;

  getGraph(opts: GraphOpts): Promise<GraphResult>;

  // ============================================================
  // Event Ledger (add_timeline_entry, get_timeline)
  // ============================================================

  addTimelineEntry(input: TimelineInput): Promise<AddTimelineEntryResult>;

  getTimeline(filters: TimelineFilters): Promise<TimelineEntry[]>;

  // ============================================================
  // Search (entity-metadata) + Query (chunk hybrid)
  // ============================================================

  /**
   * Exact / trigram match against title, aliases, and tags. See
   * specs/operations/search.md.
   */
  search(q: string, opts?: SearchOpts): Promise<SearchEnvelope>;

  /**
   * Hybrid vector + keyword retrieval over `content_chunks`, fused
   * via RRF. See specs/operations/query.md.
   */
  query(q: string, opts?: QueryOpts): Promise<QueryEnvelope>;

  // ============================================================
  // Compile pipeline (compile_render, compile_embed)
  // ============================================================

  /**
   * Render one entity's wiki markdown from structured state. See
   * specs/operations/compile_render.md.
   */
  compileRender(input: {
    entity_slug: string;
    dry_run?: boolean;
  }): Promise<CompileRenderResult>;

  /**
   * Chunk + embed one entity's compiled_truth + timeline text,
   * replacing any prior `content_chunks` rows. See
   * specs/operations/compile_embed.md.
   */
  compileEmbed(input: {
    entity_slug: string;
  }): Promise<CompileEmbedResult>;

  // ============================================================
  // Chunk primitives (internal to compileEmbed + query, exposed for
  // import-file.ts and the search-eval harness until those callers
  // migrate in step 11).
  // ============================================================

  upsertChunks(slug: string, chunks: ChunkInput[]): Promise<void>;
  getChunks(slug: string): Promise<Chunk[]>;
  getChunksWithEmbeddings(slug: string): Promise<Chunk[]>;
  deleteChunks(slug: string): Promise<void>;
  getEmbeddingsByChunkIds(ids: number[]): Promise<Map<number, Float32Array>>;

  // ============================================================
  // Ancillary (retained for commands that haven't migrated; the
  // operations.ts layer does not register these as K2 ops).
  // ============================================================

  /** entity_versions snapshot helpers. */
  createVersion(slug: string): Promise<EntityVersion>;
  getVersions(slug: string): Promise<EntityVersion[]>;

  /** raw_data sidecar (import / enrichment callers). */
  putRawData(slug: string, source: string, data: object): Promise<void>;
  getRawData(slug: string, source?: string): Promise<RawData[]>;

  /** ingest_log helpers. */
  logIngest(entry: IngestLogInput): Promise<void>;
  getIngestLog(opts?: { limit?: number }): Promise<IngestLogEntry[]>;

  /** Sync-path slug maintenance; step 11 decides whether to keep. */
  updateSlug(oldSlug: string, newSlug: string): Promise<void>;
  rewriteLinks(oldSlug: string, newSlug: string): Promise<void>;

  /** Aggregate counters for doctor/stats commands. */
  getStats(): Promise<BrainStats>;
  getHealth(): Promise<BrainHealth>;
}

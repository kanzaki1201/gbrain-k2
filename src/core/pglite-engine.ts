// K2 PGLite engine — implements BrainEngine against the K2 schema.
// Phase 2b Step 6: each method targets the renamed/K2-era tables
// (entities, sources, entity_sources, links with `inferred`, timeline_entries
// with `source_id`, content_chunks keyed on entity_id).
//
// The op-level trust boundary (`ctx.remote === true`) is NOT enforced here —
// engine methods are primitives. operations.ts wraps them with the remote gate.

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { mkdir, writeFile, readFile, rename, unlink } from 'fs/promises';
import { dirname, join } from 'path';

import type { BrainEngine } from './engine.ts';
import { MAX_SEARCH_LIMIT, clampSearchLimit } from './engine.ts';
import { runMigrations } from './migrate.ts';
import { PGLITE_SCHEMA_SQL } from './pglite-schema.ts';
import { acquireLock, releaseLock, type LockHandle } from './pglite-lock.ts';
import { chunkText } from './chunkers/recursive.ts';
import { embedBatch } from './embedding.ts';
import type {
  Entity, EntityInput, EntityFilters, EntitySummary, EntityType, EntityVersion,
  ListEntitiesResult, PutEntityResult, DeleteEntityResult,
  Source, SourceStatus,
  RegisterSourceResult, UpdateSourcePathResult, SetSourceStatusResult,
  LinkEntitySourceResult, UnlinkEntitySourceResult,
  Link, LinkInput, LinkFilters, LinkDirection,
  AddLinkResult, DeleteLinkResult,
  TimelineEntry, TimelineInput, TimelineFilters,
  AddTimelineEntryResult,
  Chunk, ChunkInput,
  SearchOpts, SearchEnvelope, SearchResult, SearchMatchedField,
  QueryOpts, QueryEnvelope, QueryResult,
  GraphOpts, GraphResult, GraphNode, GraphEdge,
  CompileRenderResult, CompileEmbedResult,
  RawData,
  BrainStats, BrainHealth,
  IngestLogEntry, IngestLogInput,
  EngineConfig,
} from './types.ts';
import { ENTITY_TYPES } from './types.ts';

type PGLiteDB = PGlite;

// ============================================================
// Validation helpers (shared across ops)
// ============================================================

const SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function assertSlug(slug: unknown, code = 'invalid_slug'): string {
  if (typeof slug !== 'string' || !slug || !SLUG_RE.test(slug)) {
    throw new Error(`${code}: "${String(slug)}" is not a valid canonical slug`);
  }
  return slug;
}

function assertRawPath(path: unknown, code = 'invalid_path'): string {
  if (typeof path !== 'string' || !path) throw new Error(`${code}: path must be a non-empty string`);
  if (path.startsWith('/')) throw new Error(`${code}: path must be vault-relative, got "${path}"`);
  if (path.includes('\\')) throw new Error(`${code}: path must use forward slashes, got "${path}"`);
  if (path.endsWith('/')) throw new Error(`${code}: path must not end with a slash, got "${path}"`);
  if (path.split('/').some(seg => seg === '..' || seg === '.' || seg === '')) {
    throw new Error(`${code}: path contains invalid segment, got "${path}"`);
  }
  return path;
}

function assertRawZone(path: string): string {
  if (!path.startsWith('human/') && !path.startsWith('sources/')) {
    throw new Error(`path_outside_raw_zone: "${path}" is not under human/** or sources/**`);
  }
  return path;
}

function assertContentHash(hash: string | null): string | null {
  if (hash === null) return null;
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error(`invalid_content_hash: "${hash}" must be 64-char lowercase hex or null`);
  }
  return hash;
}

function assertEntityType(type: unknown): EntityType {
  if (typeof type !== 'string' || !(ENTITY_TYPES as readonly string[]).includes(type)) {
    throw new Error(`invalid_type: "${String(type)}" is not a K2 entity type`);
  }
  return type as EntityType;
}

function assertTag(tag: unknown): string {
  if (typeof tag !== 'string' || !tag) throw new Error(`invalid_tag: tag must be non-empty`);
  if (tag !== tag.toLowerCase() || /\s/.test(tag)) {
    throw new Error(`invalid_tag: "${tag}" must be lowercase with no whitespace`);
  }
  return tag;
}

function assertLinkType(lt: unknown): string {
  if (typeof lt !== 'string' || !lt) throw new Error(`invalid_link_type: must be non-empty`);
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(lt)) {
    throw new Error(`invalid_link_type: "${lt}" must be lowercase snake_case`);
  }
  return lt;
}

function assertDate(d: unknown, code = 'invalid_date'): string {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error(`${code}: "${String(d)}" is not YYYY-MM-DD`);
  }
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== day) {
    throw new Error(`${code}: "${d}" is not a real calendar day`);
  }
  return d;
}

function assertDirection(dir: unknown): LinkDirection {
  if (dir !== 'outbound' && dir !== 'inbound' && dir !== 'both') {
    throw new Error(`invalid_direction: "${String(dir)}"`);
  }
  return dir;
}

function toISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return new Date(v).toISOString();
  return new Date(String(v)).toISOString();
}

function toDateOnly(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    return new Date(v).toISOString().slice(0, 10);
  }
  return new Date(String(v)).toISOString().slice(0, 10);
}

function sortStringsCI(arr: string[]): string[] {
  return [...arr].sort((a, b) => {
    const la = a.toLowerCase(), lb = b.toLowerCase();
    if (la < lb) return -1;
    if (la > lb) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function setEqualCI(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = new Set(a.map(s => s.toLowerCase()));
  for (const x of b) if (!as.has(x.toLowerCase())) return false;
  return true;
}

function deepEqualJSON(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

function canonicalize(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(canonicalize);
  const keys = Object.keys(v as Record<string, unknown>).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = canonicalize((v as Record<string, unknown>)[k]);
  return out;
}

// Row mappers ----------------------------------------------------------------

function rowToEntity(r: Record<string, unknown>): Entity {
  return {
    slug: r.slug as string,
    type: r.type as EntityType,
    title: r.title as string,
    compiled_truth: (r.compiled_truth as string) ?? '',
    struct_hash: (r.struct_hash as string) ?? null,
    tags: sortStringsCI(asStringArray(r.tags)),
    aliases: sortStringsCI(asStringArray(r.aliases)),
    frontmatter: asJSON(r.frontmatter),
    created_at: toISO(r.created_at),
    updated_at: toISO(r.updated_at),
  };
}

function rowToEntitySummary(r: Record<string, unknown>): EntitySummary {
  return {
    slug: r.slug as string,
    type: r.type as EntityType,
    title: r.title as string,
    tags: sortStringsCI(asStringArray(r.tags)),
    aliases: sortStringsCI(asStringArray(r.aliases)),
    struct_hash: (r.struct_hash as string) ?? null,
    created_at: toISO(r.created_at),
    updated_at: toISO(r.updated_at),
  };
}

function rowToSource(r: Record<string, unknown>): Source {
  return {
    id: r.id as number,
    path: r.path as string,
    content_hash: (r.content_hash as string) ?? null,
    status: r.status as SourceStatus,
    created_at: toISO(r.created_at),
  };
}

function rowToChunk(r: Record<string, unknown>, includeEmbedding = false): Chunk {
  return {
    id: r.id as number,
    entity_id: r.entity_id as number,
    chunk_index: r.chunk_index as number,
    chunk_text: r.chunk_text as string,
    chunk_source: r.chunk_source as 'compiled_truth' | 'timeline',
    embedding: includeEmbedding && r.embedding ? parseEmbedding(r.embedding) : null,
    model: r.model as string,
    token_count: (r.token_count as number | null) ?? null,
    embedded_at: r.embedded_at ? toISO(r.embedded_at) : null,
  };
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') {
    // PGLite sometimes hands arrays back as JSON strings.
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* fall through */ }
    // Or in Postgres array-literal form `{a,b,c}` (rare for PGLite).
    if (v.startsWith('{') && v.endsWith('}')) {
      const inner = v.slice(1, -1);
      if (!inner) return [];
      return inner.split(',').map(s => s.replace(/^"|"$/g, ''));
    }
  }
  return [];
}

function asJSON(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch { /* fall through */ }
  }
  return {};
}

function parseEmbedding(v: unknown): Float32Array {
  if (v instanceof Float32Array) return v;
  if (Array.isArray(v)) return new Float32Array(v as number[]);
  if (typeof v === 'string') {
    // pgvector text form: "[0.1,0.2,...]"
    const inner = v.trim().replace(/^\[|\]$/g, '');
    if (!inner) return new Float32Array(0);
    return new Float32Array(inner.split(',').map(Number));
  }
  return new Float32Array(0);
}

function embeddingLiteral(emb: Float32Array): string {
  return '[' + Array.from(emb).join(',') + ']';
}

// ============================================================
// Engine
// ============================================================

export class PGLiteEngine implements BrainEngine {
  private _db: PGLiteDB | null = null;
  private _lock: LockHandle | null = null;
  private _dataDir: string | undefined;

  get db(): PGLiteDB {
    if (!this._db) throw new Error('PGLite not connected. Call connect() first.');
    return this._db;
  }

  // --------------------------------------------------------
  // Lifecycle + infra
  // --------------------------------------------------------

  async connect(config: EngineConfig): Promise<void> {
    this._dataDir = config.database_path || undefined;
    this._lock = await acquireLock(this._dataDir);
    if (!this._lock.acquired) {
      throw new Error('Could not acquire PGLite lock. Another gbrain process is using the database.');
    }
    this._db = await PGlite.create({
      dataDir: this._dataDir,
      extensions: { vector, pg_trgm },
    });
  }

  async disconnect(): Promise<void> {
    if (this._db) {
      await this._db.close();
      this._db = null;
    }
    if (this._lock?.acquired) {
      await releaseLock(this._lock);
      this._lock = null;
    }
  }

  async initSchema(): Promise<void> {
    await this.db.exec(PGLITE_SCHEMA_SQL);
    const { applied } = await runMigrations(this);
    if (applied > 0) {
      console.log(`  ${applied} migration(s) applied`);
    }
  }

  async transaction<T>(fn: (engine: BrainEngine) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const txEngine = Object.create(this) as PGLiteEngine;
      Object.defineProperty(txEngine, 'db', { get: () => tx });
      return fn(txEngine);
    });
  }

  async resolveSlugs(partial: string): Promise<string[]> {
    const exact = await this.db.query<{ slug: string }>(
      'SELECT slug FROM entities WHERE slug = $1',
      [partial],
    );
    if (exact.rows.length > 0) return [exact.rows[0].slug];

    const { rows } = await this.db.query<{ slug: string }>(
      `SELECT slug, similarity(title, $1) AS sim
         FROM entities
        WHERE title % $1 OR slug ILIKE $2
        ORDER BY sim DESC
        LIMIT 5`,
      [partial, '%' + partial + '%'],
    );
    return rows.map(r => r.slug);
  }

  async getConfig(key: string): Promise<string | null> {
    const { rows } = await this.db.query<{ value: string }>(
      'SELECT value FROM config WHERE key = $1',
      [key],
    );
    return rows.length > 0 ? rows[0].value : null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.db.query(
      `INSERT INTO config (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }

  async runMigration(_version: number, sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  // --------------------------------------------------------
  // Entity Registry
  // --------------------------------------------------------

  async compilePutPage(input: EntityInput): Promise<PutEntityResult> {
    const slug = assertSlug(input.slug);
    const type = assertEntityType(input.type);
    if (!input.title || typeof input.title !== 'string') {
      throw new Error('invalid_title: title must be non-empty');
    }
    if (typeof input.compiled_truth !== 'string') {
      throw new Error('invalid_compiled_truth: compiled_truth must be a string');
    }
    if (!input.struct_hash || typeof input.struct_hash !== 'string' || !/^[0-9a-f]{16,128}$/.test(input.struct_hash)) {
      throw new Error('struct_hash_missing: struct_hash must be a non-empty hex string');
    }

    const tags = (input.tags ?? []).map(assertTag);
    const aliases = (input.aliases ?? []).map(a => {
      if (typeof a !== 'string' || !a) throw new Error('invalid_alias: aliases must be non-empty strings');
      return a;
    });
    const frontmatter = input.frontmatter ?? {};

    const { rows: priorRows } = await this.db.query<Record<string, unknown>>(
      `SELECT type, title, compiled_truth, struct_hash, tags, aliases, frontmatter
         FROM entities WHERE slug = $1`,
      [slug],
    );

    if (priorRows.length > 0) {
      const prior = priorRows[0];
      const priorType = prior.type as string;
      if (priorType !== type) {
        throw new Error(
          `slug_collision_different_type: entity "${slug}" exists as "${priorType}", caller passed "${type}"`,
        );
      }

      const priorHash = (prior.struct_hash as string | null) ?? null;
      const priorTags = asStringArray(prior.tags);
      const priorAliases = asStringArray(prior.aliases);
      const priorFrontmatter = asJSON(prior.frontmatter);

      const sameType = priorType === type;
      const sameTitle = prior.title === input.title;
      const sameBody = prior.compiled_truth === input.compiled_truth;
      const sameHash = priorHash === input.struct_hash;
      const sameTags = setEqualCI(priorTags, tags);
      const sameAliases = setEqualCI(priorAliases, aliases);
      const sameFM = deepEqualJSON(priorFrontmatter, frontmatter);

      if (sameType && sameTitle && sameBody && sameHash && sameTags && sameAliases && sameFM) {
        return { slug, status: 'noop', prior_struct_hash: priorHash };
      }

      await this.db.query(
        `UPDATE entities
            SET type           = $2,
                title          = $3,
                compiled_truth = $4,
                struct_hash    = $5,
                tags           = $6::text[],
                aliases        = $7::text[],
                frontmatter    = $8::jsonb,
                updated_at     = now()
          WHERE slug = $1`,
        [slug, type, input.title, input.compiled_truth, input.struct_hash, tags, aliases, JSON.stringify(frontmatter)],
      );
      return { slug, status: 'updated', prior_struct_hash: priorHash };
    }

    await this.db.query(
      `INSERT INTO entities (slug, type, title, compiled_truth, struct_hash, tags, aliases, frontmatter)
         VALUES ($1, $2, $3, $4, $5, $6::text[], $7::text[], $8::jsonb)`,
      [slug, type, input.title, input.compiled_truth, input.struct_hash, tags, aliases, JSON.stringify(frontmatter)],
    );
    return { slug, status: 'created', prior_struct_hash: null };
  }

  async getEntity(slug: string): Promise<Entity | null> {
    assertSlug(slug);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT slug, type, title, compiled_truth, struct_hash, tags, aliases, frontmatter, created_at, updated_at
         FROM entities WHERE slug = $1`,
      [slug],
    );
    if (rows.length === 0) return null;
    return rowToEntity(rows[0]);
  }

  async listEntities(filters?: EntityFilters): Promise<ListEntitiesResult> {
    const type = filters?.type !== undefined ? assertEntityType(filters.type) : undefined;
    const tag = filters?.tag !== undefined ? assertTag(filters.tag) : undefined;
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit;
    if (offset < 0 || !Number.isInteger(offset)) throw new Error('invalid_offset');
    if (limit !== undefined && (limit < 0 || !Number.isInteger(limit))) throw new Error('invalid_limit');

    const where: string[] = [];
    const params: unknown[] = [];
    if (type) { params.push(type); where.push(`type = $${params.length}`); }
    if (tag) { params.push(tag); where.push(`$${params.length} = ANY(tags)`); }
    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await this.db.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM entities ${whereSQL}`,
      params,
    );
    const total = Number(countRes.rows[0]?.c ?? 0);

    // Pagination: offset + optional limit. slug-sort ascending for determinism.
    const pageParams = [...params];
    let limitClause = '';
    if (limit !== undefined) {
      pageParams.push(limit);
      limitClause = `LIMIT $${pageParams.length}`;
    }
    pageParams.push(offset);
    const offsetClause = `OFFSET $${pageParams.length}`;

    const itemsRes = await this.db.query<Record<string, unknown>>(
      `SELECT slug, type, title, tags, aliases, struct_hash, created_at, updated_at
         FROM entities ${whereSQL}
        ORDER BY slug ASC
        ${limitClause} ${offsetClause}`,
      pageParams,
    );
    const items = itemsRes.rows.map(rowToEntitySummary);

    return {
      items,
      total,
      offset,
      limit: limit ?? null,
    };
  }

  async deleteEntity(input: { entity_slug: string; preserve_wiki_file?: boolean }): Promise<DeleteEntityResult> {
    const slug = assertSlug(input.entity_slug);
    const preserve = input.preserve_wiki_file ?? false;

    const { rows } = await this.db.query<{ id: number; type: string }>(
      'SELECT id, type FROM entities WHERE slug = $1',
      [slug],
    );
    if (rows.length === 0) {
      return {
        entity_slug: slug,
        action: 'noop',
        rows_removed: { entities: 0, links: 0, timeline_entries: 0, entity_sources: 0, content_chunks: 0 },
        wiki_file_status: preserve ? 'preserved' : 'not_found',
      };
    }
    const entityId = rows[0].id;
    const entityType = rows[0].type;

    // Pre-count dependent rows so we can report the cascade counts.
    const countQ = async (sql: string, p: unknown[]) => {
      const r = await this.db.query<{ c: number }>(sql, p);
      return Number(r.rows[0]?.c ?? 0);
    };
    const linkCount = await countQ(
      'SELECT count(*)::int AS c FROM links WHERE from_entity_id = $1 OR to_entity_id = $1',
      [entityId],
    );
    const tlCount = await countQ(
      'SELECT count(*)::int AS c FROM timeline_entries WHERE entity_id = $1',
      [entityId],
    );
    const esCount = await countQ(
      'SELECT count(*)::int AS c FROM entity_sources WHERE entity_id = $1',
      [entityId],
    );
    const ccCount = await countQ(
      'SELECT count(*)::int AS c FROM content_chunks WHERE entity_id = $1',
      [entityId],
    );

    await this.db.query('DELETE FROM entities WHERE id = $1', [entityId]);

    let wikiStatus: DeleteEntityResult['wiki_file_status'] = preserve ? 'preserved' : 'not_found';
    if (!preserve) {
      const vaultRoot = await this.getConfig('vault_root');
      if (vaultRoot) {
        const path = join(vaultRoot, entityType, `${slug}.md`);
        try {
          await unlink(path);
          wikiStatus = 'removed';
        } catch (e) {
          const err = e as NodeJS.ErrnoException;
          wikiStatus = err.code === 'ENOENT' ? 'not_found' : 'delete_failed';
        }
      }
    }

    return {
      entity_slug: slug,
      action: 'deleted',
      rows_removed: {
        entities: 1,
        links: linkCount,
        timeline_entries: tlCount,
        entity_sources: esCount,
        content_chunks: ccCount,
      },
      wiki_file_status: wikiStatus,
    };
  }

  // --------------------------------------------------------
  // Source Registry
  // --------------------------------------------------------

  async registerSource(input: { path: string; content_hash: string | null }): Promise<RegisterSourceResult> {
    const path = assertRawZone(assertRawPath(input.path));
    const hash = assertContentHash(input.content_hash);

    const existing = await this.db.query<{ id: number }>(
      'SELECT id FROM sources WHERE path = $1',
      [path],
    );
    if (existing.rows.length > 0) {
      throw new Error(`path_already_registered: source "${path}" is already in the registry`);
    }

    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO sources (path, content_hash, status) VALUES ($1, $2, 'active') RETURNING id`,
      [path, hash],
    );
    return { source_id: rows[0].id, path, status: 'active' };
  }

  async updateSourcePath(input: { old_path: string; new_path: string }): Promise<UpdateSourcePathResult> {
    const oldPath = assertRawZone(assertRawPath(input.old_path));
    const newPath = assertRawZone(assertRawPath(input.new_path));
    if (oldPath === newPath) throw new Error('paths_identical');

    const cur = await this.db.query<{ id: number; status: string }>(
      'SELECT id, status FROM sources WHERE path = $1',
      [oldPath],
    );
    if (cur.rows.length === 0) throw new Error(`source_not_found: "${oldPath}"`);
    if (cur.rows[0].status !== 'active') throw new Error(`source_not_active: "${oldPath}"`);

    const occ = await this.db.query<{ id: number }>(
      'SELECT id FROM sources WHERE path = $1',
      [newPath],
    );
    if (occ.rows.length > 0) throw new Error(`destination_occupied: "${newPath}"`);

    await this.db.query('UPDATE sources SET path = $2 WHERE id = $1', [cur.rows[0].id, newPath]);
    return { source_id: cur.rows[0].id, old_path: oldPath, new_path: newPath };
  }

  async setSourceStatus(input: { path: string; new_status: SourceStatus }): Promise<SetSourceStatusResult> {
    const path = assertRawZone(assertRawPath(input.path));
    if (input.new_status !== 'active' && input.new_status !== 'deleted') {
      throw new Error(`invalid_status: "${String(input.new_status)}"`);
    }

    const { rows } = await this.db.query<{ id: number; status: SourceStatus }>(
      'SELECT id, status FROM sources WHERE path = $1',
      [path],
    );
    if (rows.length === 0) throw new Error(`source_not_found: "${path}"`);

    const priorStatus = rows[0].status;
    if (priorStatus === input.new_status) {
      return {
        source_id: rows[0].id,
        path,
        prior_status: priorStatus,
        new_status: input.new_status,
        action: 'noop',
      };
    }
    await this.db.query('UPDATE sources SET status = $2 WHERE id = $1', [rows[0].id, input.new_status]);
    return {
      source_id: rows[0].id,
      path,
      prior_status: priorStatus,
      new_status: input.new_status,
      action: 'updated',
    };
  }

  async getSourceByPath(path: string): Promise<Source | null> {
    assertRawPath(path);
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT id, path, content_hash, status, created_at FROM sources WHERE path = $1',
      [path],
    );
    if (rows.length === 0) return null;
    return rowToSource(rows[0]);
  }

  // --------------------------------------------------------
  // Source ↔ Entity junction
  // --------------------------------------------------------

  async linkEntitySource(input: { entity_slug: string; source_path: string }): Promise<LinkEntitySourceResult> {
    const slug = assertSlug(input.entity_slug);
    const path = assertRawZone(assertRawPath(input.source_path));

    const e = await this.db.query<{ id: number }>('SELECT id FROM entities WHERE slug = $1', [slug]);
    if (e.rows.length === 0) throw new Error(`entity_not_found: "${slug}"`);

    const s = await this.db.query<{ id: number; status: string }>(
      'SELECT id, status FROM sources WHERE path = $1',
      [path],
    );
    if (s.rows.length === 0) throw new Error(`source_not_found: "${path}"`);
    if (s.rows[0].status !== 'active') throw new Error(`source_not_active: "${path}"`);

    const already = await this.db.query<{ entity_id: number }>(
      'SELECT entity_id FROM entity_sources WHERE entity_id = $1 AND source_id = $2',
      [e.rows[0].id, s.rows[0].id],
    );
    if (already.rows.length > 0) {
      return { entity_slug: slug, source_path: path, status: 'noop' };
    }

    await this.db.query(
      'INSERT INTO entity_sources (entity_id, source_id) VALUES ($1, $2)',
      [e.rows[0].id, s.rows[0].id],
    );
    return { entity_slug: slug, source_path: path, status: 'created' };
  }

  async unlinkEntitySource(input: { entity_slug: string; source_path: string }): Promise<UnlinkEntitySourceResult> {
    const slug = assertSlug(input.entity_slug);
    const path = assertRawZone(assertRawPath(input.source_path));

    const e = await this.db.query<{ id: number }>('SELECT id FROM entities WHERE slug = $1', [slug]);
    if (e.rows.length === 0) throw new Error(`entity_not_found: "${slug}"`);

    const s = await this.db.query<{ id: number }>('SELECT id FROM sources WHERE path = $1', [path]);
    if (s.rows.length === 0) throw new Error(`source_not_found: "${path}"`);

    const del = await this.db.query(
      'DELETE FROM entity_sources WHERE entity_id = $1 AND source_id = $2',
      [e.rows[0].id, s.rows[0].id],
    );
    const deleted = (del as { affectedRows?: number }).affectedRows ?? 0;
    return {
      entity_slug: slug,
      source_path: path,
      action: deleted > 0 ? 'deleted' : 'noop',
    };
  }

  // --------------------------------------------------------
  // Relationship graph
  // --------------------------------------------------------

  async addLink(input: LinkInput): Promise<AddLinkResult> {
    const fromSlug = assertSlug(input.from_slug);
    const toSlug = assertSlug(input.to_slug);
    if (fromSlug === toSlug) throw new Error('self_loop_forbidden');
    const linkType = assertLinkType(input.link_type);
    if (typeof input.inferred !== 'boolean') throw new Error('invalid_inferred: must be boolean');
    const context = input.context ?? '';
    if (input.inferred && !context) {
      throw new Error('context_required_for_inferred: inferred edges must carry a non-empty context');
    }

    const endpoints = await this.db.query<{ slug: string; id: number }>(
      'SELECT slug, id FROM entities WHERE slug = ANY($1::text[])',
      [[fromSlug, toSlug]],
    );
    const byslug = new Map(endpoints.rows.map(r => [r.slug, r.id]));
    const fromId = byslug.get(fromSlug);
    const toId = byslug.get(toSlug);
    if (fromId === undefined) throw new Error(`entity_not_found: "${fromSlug}"`);
    if (toId === undefined) throw new Error(`entity_not_found: "${toSlug}"`);

    const prior = await this.db.query<{ id: number; inferred: boolean; context: string }>(
      `SELECT id, inferred, context FROM links
        WHERE from_entity_id = $1 AND to_entity_id = $2 AND link_type = $3`,
      [fromId, toId, linkType],
    );

    if (prior.rows.length > 0) {
      const p = prior.rows[0];
      if (p.inferred === input.inferred && p.context === context) {
        return { link_id: p.id, status: 'noop', prior: { inferred: p.inferred, context: p.context } };
      }
      await this.db.query(
        'UPDATE links SET inferred = $2, context = $3 WHERE id = $1',
        [p.id, input.inferred, context],
      );
      return { link_id: p.id, status: 'updated', prior: { inferred: p.inferred, context: p.context } };
    }

    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO links (from_entity_id, to_entity_id, link_type, context, inferred)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [fromId, toId, linkType, context, input.inferred],
    );
    return { link_id: rows[0].id, status: 'created', prior: null };
  }

  async getLinks(filters: LinkFilters): Promise<Link[]> {
    const slug = assertSlug(filters.entity_slug);
    const direction = assertDirection(filters.direction);
    const linkType = filters.link_type !== undefined ? assertLinkType(filters.link_type) : undefined;
    const inferred = filters.inferred;

    const e = await this.db.query<{ id: number }>('SELECT id FROM entities WHERE slug = $1', [slug]);
    if (e.rows.length === 0) return [];
    const id = e.rows[0].id;

    const where: string[] = [];
    const params: unknown[] = [];
    if (direction === 'outbound') {
      params.push(id); where.push(`l.from_entity_id = $${params.length}`);
    } else if (direction === 'inbound') {
      params.push(id); where.push(`l.to_entity_id = $${params.length}`);
    } else {
      params.push(id); where.push(`(l.from_entity_id = $${params.length} OR l.to_entity_id = $${params.length})`);
    }
    if (linkType !== undefined) { params.push(linkType); where.push(`l.link_type = $${params.length}`); }
    if (inferred !== undefined) { params.push(inferred); where.push(`l.inferred = $${params.length}`); }

    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT f.slug AS from_slug, t.slug AS to_slug, l.link_type, l.inferred, l.context, l.created_at
         FROM links l
         JOIN entities f ON f.id = l.from_entity_id
         JOIN entities t ON t.id = l.to_entity_id
        WHERE ${where.join(' AND ')}
        ORDER BY f.slug ASC, t.slug ASC, l.link_type ASC, l.created_at ASC`,
      params,
    );
    return rows.map(r => ({
      from_slug: r.from_slug as string,
      to_slug: r.to_slug as string,
      link_type: r.link_type as string,
      inferred: Boolean(r.inferred),
      context: (r.context as string) ?? '',
      created_at: toISO(r.created_at),
    }));
  }

  async deleteLink(linkId: number): Promise<DeleteLinkResult> {
    if (!Number.isInteger(linkId) || linkId <= 0) throw new Error('invalid_link_id');

    const prior = await this.db.query<Record<string, unknown>>(
      `SELECT l.id, f.slug AS from_slug, t.slug AS to_slug,
              l.link_type, l.inferred, l.context
         FROM links l
         LEFT JOIN entities f ON f.id = l.from_entity_id
         LEFT JOIN entities t ON t.id = l.to_entity_id
        WHERE l.id = $1`,
      [linkId],
    );
    if (prior.rows.length === 0) {
      return { link_id: linkId, action: 'noop', prior: null };
    }

    await this.db.query('DELETE FROM links WHERE id = $1', [linkId]);
    const r = prior.rows[0];
    return {
      link_id: linkId,
      action: 'deleted',
      prior: {
        from_slug: (r.from_slug as string | null) ?? null,
        to_slug: (r.to_slug as string | null) ?? null,
        link_type: r.link_type as string,
        inferred: Boolean(r.inferred),
        context: (r.context as string) ?? '',
      },
    };
  }

  async getGraph(opts: GraphOpts): Promise<GraphResult> {
    const seed = assertSlug(opts.entity_slug);
    const direction = assertDirection(opts.direction);
    if (!Number.isInteger(opts.depth) || opts.depth < 0 || opts.depth > 10) {
      throw new Error('invalid_depth: must be integer in [0, 10]');
    }
    const linkType = opts.link_type !== undefined ? assertLinkType(opts.link_type) : undefined;
    const inferred = opts.inferred;
    const maxNodes = opts.max_nodes;
    if (maxNodes !== undefined && (!Number.isInteger(maxNodes) || maxNodes <= 0)) {
      throw new Error('invalid_max_nodes');
    }

    const seedRes = await this.db.query<{ id: number; type: string; title: string }>(
      'SELECT id, type, title FROM entities WHERE slug = $1',
      [seed],
    );
    if (seedRes.rows.length === 0) {
      return { nodes: [], edges: [], truncated: false, depth_reached: 0 };
    }

    // BFS in app space — simpler and deterministic than a parameterized CTE with filters.
    const nodeBySlug = new Map<string, GraphNode>();
    nodeBySlug.set(seed, {
      slug: seed,
      type: seedRes.rows[0].type as EntityType,
      title: seedRes.rows[0].title,
      min_depth: 0,
    });

    let frontier = [seed];
    let depthReached = 0;
    let truncated = false;

    for (let d = 0; d < opts.depth && frontier.length > 0; d++) {
      if (maxNodes !== undefined && nodeBySlug.size >= maxNodes) {
        truncated = true;
        break;
      }

      const params: unknown[] = [frontier];
      let where = '';
      if (direction === 'outbound') where = 'f.slug = ANY($1::text[])';
      else if (direction === 'inbound') where = 't.slug = ANY($1::text[])';
      else where = '(f.slug = ANY($1::text[]) OR t.slug = ANY($1::text[]))';

      if (linkType !== undefined) { params.push(linkType); where += ` AND l.link_type = $${params.length}`; }
      if (inferred !== undefined) { params.push(inferred); where += ` AND l.inferred = $${params.length}`; }

      const { rows } = await this.db.query<Record<string, unknown>>(
        `SELECT f.slug AS from_slug, f.type AS from_type, f.title AS from_title,
                t.slug AS to_slug,   t.type AS to_type,   t.title AS to_title
           FROM links l
           JOIN entities f ON f.id = l.from_entity_id
           JOIN entities t ON t.id = l.to_entity_id
          WHERE ${where}`,
        params,
      );

      const nextLayer = new Set<string>();
      for (const r of rows) {
        const from = r.from_slug as string;
        const to = r.to_slug as string;
        const candidates: [string, string, string][] = [];
        if (direction === 'outbound' && frontier.includes(from)) {
          candidates.push([to, r.to_type as string, r.to_title as string]);
        } else if (direction === 'inbound' && frontier.includes(to)) {
          candidates.push([from, r.from_type as string, r.from_title as string]);
        } else if (direction === 'both') {
          if (frontier.includes(from)) candidates.push([to, r.to_type as string, r.to_title as string]);
          if (frontier.includes(to)) candidates.push([from, r.from_type as string, r.from_title as string]);
        }
        for (const [s, ty, ti] of candidates) {
          if (!nodeBySlug.has(s)) nextLayer.add(s + '\x00' + ty + '\x00' + ti);
        }
      }

      const nextSlugs: string[] = [];
      const sorted = Array.from(nextLayer).sort();
      for (const packed of sorted) {
        if (maxNodes !== undefined && nodeBySlug.size >= maxNodes) { truncated = true; break; }
        const [slug, type, title] = packed.split('\x00');
        nodeBySlug.set(slug, { slug, type: type as EntityType, title, min_depth: d + 1 });
        nextSlugs.push(slug);
      }
      if (nextSlugs.length > 0) depthReached = d + 1;
      frontier = nextSlugs;
    }

    // Emit every edge among the returned nodes (reachable-subgraph semantics).
    const slugList = Array.from(nodeBySlug.keys());
    const edgeParams: unknown[] = [slugList];
    let edgeWhere = 'f.slug = ANY($1::text[]) AND t.slug = ANY($1::text[])';
    if (linkType !== undefined) { edgeParams.push(linkType); edgeWhere += ` AND l.link_type = $${edgeParams.length}`; }
    if (inferred !== undefined) { edgeParams.push(inferred); edgeWhere += ` AND l.inferred = $${edgeParams.length}`; }

    const edgeRes = slugList.length === 0 ? { rows: [] as Record<string, unknown>[] } : await this.db.query<Record<string, unknown>>(
      `SELECT f.slug AS from_slug, t.slug AS to_slug, l.link_type, l.inferred, l.context
         FROM links l
         JOIN entities f ON f.id = l.from_entity_id
         JOIN entities t ON t.id = l.to_entity_id
        WHERE ${edgeWhere}
        ORDER BY f.slug ASC, t.slug ASC, l.link_type ASC`,
      edgeParams,
    );
    const edges: GraphEdge[] = edgeRes.rows.map(r => ({
      from_slug: r.from_slug as string,
      to_slug: r.to_slug as string,
      link_type: r.link_type as string,
      inferred: Boolean(r.inferred),
      context: (r.context as string) ?? '',
    }));

    const nodes = Array.from(nodeBySlug.values()).sort((a, b) => {
      if (a.min_depth !== b.min_depth) return a.min_depth - b.min_depth;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });

    return { nodes, edges, truncated, depth_reached: depthReached };
  }

  // --------------------------------------------------------
  // Timeline
  // --------------------------------------------------------

  async addTimelineEntry(input: TimelineInput): Promise<AddTimelineEntryResult> {
    const slug = assertSlug(input.entity_slug);
    const date = assertDate(input.date);
    const path = assertRawZone(assertRawPath(input.source_path));

    if (typeof input.summary !== 'string' || !input.summary.trim() || /[\r\n]/.test(input.summary)) {
      throw new Error('invalid_summary: must be non-empty and single-line');
    }
    const detail = input.detail ?? '';

    const e = await this.db.query<{ id: number }>('SELECT id FROM entities WHERE slug = $1', [slug]);
    if (e.rows.length === 0) throw new Error(`entity_not_found: "${slug}"`);

    const s = await this.db.query<{ id: number }>('SELECT id FROM sources WHERE path = $1', [path]);
    if (s.rows.length === 0) throw new Error(`source_not_found: "${path}"`);

    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO timeline_entries (entity_id, date, summary, detail, source_id)
         VALUES ($1, $2::date, $3, $4, $5) RETURNING id`,
      [e.rows[0].id, date, input.summary, detail, s.rows[0].id],
    );
    return { entry_id: rows[0].id, entity_slug: slug, date };
  }

  async getTimeline(filters: TimelineFilters): Promise<TimelineEntry[]> {
    const slug = assertSlug(filters.entity_slug);
    const since = filters.since !== undefined ? assertDate(filters.since) : undefined;
    const until = filters.until !== undefined ? assertDate(filters.until) : undefined;
    if (since !== undefined && until !== undefined && since > until) {
      throw new Error('invalid_date_range');
    }

    const e = await this.db.query<{ id: number }>('SELECT id FROM entities WHERE slug = $1', [slug]);
    if (e.rows.length === 0) return [];

    const params: unknown[] = [e.rows[0].id];
    const where = ['te.entity_id = $1'];
    if (since !== undefined) { params.push(since); where.push(`te.date >= $${params.length}::date`); }
    if (until !== undefined) { params.push(until); where.push(`te.date <= $${params.length}::date`); }

    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT te.id AS entry_id, te.date, te.summary, te.detail, s.path AS source_path, te.created_at
         FROM timeline_entries te
         JOIN sources s ON s.id = te.source_id
        WHERE ${where.join(' AND ')}
        ORDER BY te.date ASC, te.created_at ASC`,
      params,
    );
    return rows.map(r => ({
      entry_id: r.entry_id as number,
      date: toDateOnly(r.date),
      summary: r.summary as string,
      detail: (r.detail as string) ?? '',
      source_path: r.source_path as string,
      created_at: toISO(r.created_at),
    }));
  }

  // --------------------------------------------------------
  // Search (identity-field) + Query (hybrid chunk)
  // --------------------------------------------------------

  async search(q: string, opts?: SearchOpts): Promise<SearchEnvelope> {
    if (typeof q !== 'string' || !q.trim()) throw new Error('invalid_query: q is empty');
    const query = q.trim();
    const type = opts?.type !== undefined ? assertEntityType(opts.type) : undefined;
    const tag = opts?.tag !== undefined ? assertTag(opts.tag) : undefined;
    const minScore = opts?.min_score;
    if (minScore !== undefined && (minScore < 0 || minScore > 1)) throw new Error('invalid_min_score');
    const limit = clampSearchLimit(opts?.limit, 20, MAX_SEARCH_LIMIT);
    const offset = opts?.offset ?? 0;
    if (offset < 0 || !Number.isInteger(offset)) throw new Error('invalid_offset');

    const filterSQL: string[] = [];
    const params: unknown[] = [query];
    if (type !== undefined) { params.push(type); filterSQL.push(`e.type = $${params.length}`); }
    if (tag !== undefined) { params.push(tag); filterSQL.push(`$${params.length} = ANY(e.tags)`); }
    const filterWhere = filterSQL.length ? `AND ${filterSQL.join(' AND ')}` : '';

    // Score surfaces:
    //   - exact case-insensitive title/alias match: 1.0
    //   - trigram similarity on title or alias: similarity(...)
    //   - tag contains the query substring: 0.3 baseline
    const { rows } = await this.db.query<Record<string, unknown>>(
      `WITH scored AS (
         SELECT
           e.slug, e.type, e.title, e.tags, e.aliases,
           GREATEST(
             CASE WHEN lower(e.title) = lower($1) THEN 1.0 ELSE 0.0 END,
             CASE WHEN EXISTS (SELECT 1 FROM unnest(e.aliases) a WHERE lower(a) = lower($1)) THEN 1.0 ELSE 0.0 END,
             similarity(e.title, $1),
             COALESCE((SELECT MAX(similarity(a, $1)) FROM unnest(e.aliases) a), 0.0),
             CASE WHEN EXISTS (SELECT 1 FROM unnest(e.tags) t WHERE t ILIKE '%' || $1 || '%') THEN 0.3 ELSE 0.0 END
           ) AS raw_score,
           (CASE WHEN lower(e.title) = lower($1) OR similarity(e.title, $1) > 0 THEN 1 ELSE 0 END) AS title_hit,
           (CASE WHEN EXISTS (SELECT 1 FROM unnest(e.aliases) a WHERE lower(a) = lower($1) OR similarity(a, $1) > 0) THEN 1 ELSE 0 END) AS alias_hit,
           (CASE WHEN EXISTS (SELECT 1 FROM unnest(e.tags) t WHERE t ILIKE '%' || $1 || '%') THEN 1 ELSE 0 END) AS tag_hit
         FROM entities e
         WHERE TRUE ${filterWhere}
       )
       SELECT slug, type, title, tags, aliases, raw_score, title_hit, alias_hit, tag_hit
         FROM scored
        WHERE raw_score > 0
        ORDER BY raw_score DESC, slug ASC`,
      params,
    );

    // Normalize per-query so the top item is exactly 1.0.
    const topRaw = Math.max(...rows.map(r => Number(r.raw_score)), 0);
    const scored: SearchResult[] = rows
      .map(r => {
        const raw = Number(r.raw_score);
        const score = topRaw > 0 ? Math.min(raw / topRaw, 1) : 0;
        const titleHit = Number(r.title_hit) > 0;
        const aliasHit = Number(r.alias_hit) > 0;
        const tagHit = Number(r.tag_hit) > 0;
        let matched: SearchMatchedField;
        const contributors = (titleHit ? 1 : 0) + (aliasHit ? 1 : 0) + (tagHit ? 1 : 0);
        if (contributors > 1) matched = 'mixed';
        else if (titleHit) matched = 'title';
        else if (aliasHit) matched = 'alias';
        else matched = 'tag';
        return {
          slug: r.slug as string,
          type: r.type as EntityType,
          title: r.title as string,
          tags: sortStringsCI(asStringArray(r.tags)),
          aliases: sortStringsCI(asStringArray(r.aliases)),
          score,
          matched_field: matched,
        };
      })
      .filter(r => minScore === undefined || r.score >= minScore);

    const total = scored.length;
    const items = scored.slice(offset, offset + limit);
    return { items, total, offset, limit };
  }

  async query(q: string, opts?: QueryOpts): Promise<QueryEnvelope> {
    if (typeof q !== 'string' || !q.trim()) throw new Error('invalid_query: q is empty');
    const query = q.trim();
    const type = opts?.type !== undefined ? assertEntityType(opts.type) : undefined;
    const tag = opts?.tag !== undefined ? assertTag(opts.tag) : undefined;
    const chunkSource = opts?.chunk_source;
    if (chunkSource !== undefined && chunkSource !== 'compiled_truth' && chunkSource !== 'timeline') {
      throw new Error('invalid_chunk_source');
    }
    const minScore = opts?.min_score;
    if (minScore !== undefined && (minScore < 0 || minScore > 1)) throw new Error('invalid_min_score');
    const limit = clampSearchLimit(opts?.limit, 10, MAX_SEARCH_LIMIT);
    const offset = opts?.offset ?? 0;
    if (offset < 0 || !Number.isInteger(offset)) throw new Error('invalid_offset');

    // Encode query once for the vector pass. Keyword pass needs no encoding.
    let qEmbedding: Float32Array | null = null;
    try {
      const [vec] = await embedBatch([query]);
      qEmbedding = vec;
    } catch {
      // Vector pass becomes a no-op; keyword results alone still count as hybrid.
      qEmbedding = null;
    }

    const filters: string[] = [];
    const params: unknown[] = [];
    if (type !== undefined) { params.push(type); filters.push(`e.type = $${params.length}`); }
    if (tag !== undefined) { params.push(tag); filters.push(`$${params.length} = ANY(e.tags)`); }
    if (chunkSource !== undefined) { params.push(chunkSource); filters.push(`cc.chunk_source = $${params.length}`); }
    const filterClause = filters.length ? `AND ${filters.join(' AND ')}` : '';

    // Keyword pass: trigram similarity on chunk_text, top-K.
    const kwParams = [...params, query, MAX_SEARCH_LIMIT * 4];
    const kwLimitIdx = kwParams.length;
    const kwQueryIdx = kwParams.length - 1;
    const keyword = await this.db.query<Record<string, unknown>>(
      `SELECT cc.id, cc.entity_id, cc.chunk_index, cc.chunk_text, cc.chunk_source,
              e.slug, e.type, e.title,
              similarity(cc.chunk_text, $${kwQueryIdx}) AS raw_score
         FROM content_chunks cc
         JOIN entities e ON e.id = cc.entity_id
        WHERE similarity(cc.chunk_text, $${kwQueryIdx}) > 0 ${filterClause}
        ORDER BY raw_score DESC
        LIMIT $${kwLimitIdx}`,
      kwParams,
    );

    // Vector pass: cosine similarity, top-K. Skipped when embedding unavailable.
    let vectorRows: Record<string, unknown>[] = [];
    if (qEmbedding && qEmbedding.length > 0) {
      const vecLit = embeddingLiteral(qEmbedding);
      const vParams = [...params, vecLit, MAX_SEARCH_LIMIT * 4];
      const vVecIdx = vParams.length - 1;
      const vLimIdx = vParams.length;
      const v = await this.db.query<Record<string, unknown>>(
        `SELECT cc.id, cc.entity_id, cc.chunk_index, cc.chunk_text, cc.chunk_source,
                e.slug, e.type, e.title,
                1 - (cc.embedding <=> $${vVecIdx}::vector) AS raw_score
           FROM content_chunks cc
           JOIN entities e ON e.id = cc.entity_id
          WHERE cc.embedding IS NOT NULL ${filterClause}
          ORDER BY cc.embedding <=> $${vVecIdx}::vector ASC
          LIMIT $${vLimIdx}`,
        vParams,
      );
      vectorRows = v.rows;
    }

    // RRF fusion: score = sum over passes(1 / (k + rank)).
    const K = 60;
    type Contribution = { row: Record<string, unknown>; vector: number | null; keyword: number | null };
    const byId = new Map<number, Contribution>();

    vectorRows.forEach((row, i) => {
      const id = row.id as number;
      const rr = 1 / (K + i + 1);
      const existing = byId.get(id);
      if (existing) existing.vector = rr;
      else byId.set(id, { row, vector: rr, keyword: null });
    });
    keyword.rows.forEach((row, i) => {
      const id = row.id as number;
      const rr = 1 / (K + i + 1);
      const existing = byId.get(id);
      if (existing) existing.keyword = rr;
      else byId.set(id, { row, vector: null, keyword: rr });
    });

    const fused = Array.from(byId.values()).map(c => {
      const raw = (c.vector ?? 0) + (c.keyword ?? 0);
      return {
        row: c.row,
        raw,
        vector: c.vector,
        keyword: c.keyword,
      };
    });
    const topRaw = fused.reduce((m, f) => Math.max(m, f.raw), 0);

    // Per-pass normalization so vector_score / keyword_score are in [0,1].
    const vTop = Math.max(...fused.map(f => f.vector ?? 0), 0);
    const kTop = Math.max(...fused.map(f => f.keyword ?? 0), 0);

    const items: QueryResult[] = fused
      .map(f => ({
        entity_slug: f.row.slug as string,
        entity_title: f.row.title as string,
        entity_type: f.row.type as EntityType,
        chunk_text: f.row.chunk_text as string,
        chunk_source: f.row.chunk_source as 'compiled_truth' | 'timeline',
        score: topRaw > 0 ? Math.min(f.raw / topRaw, 1) : 0,
        vector_score: f.vector === null ? null : (vTop > 0 ? f.vector / vTop : 0),
        keyword_score: f.keyword === null ? null : (kTop > 0 ? f.keyword / kTop : 0),
      }))
      .filter(r => minScore === undefined || r.score >= minScore)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.entity_slug !== b.entity_slug) return a.entity_slug < b.entity_slug ? -1 : 1;
        return a.chunk_text < b.chunk_text ? -1 : a.chunk_text > b.chunk_text ? 1 : 0;
      });

    const total = items.length;
    return { items: items.slice(offset, offset + limit), total, offset, limit };
  }

  // --------------------------------------------------------
  // Compile pipeline
  // --------------------------------------------------------

  async compileRender(input: { entity_slug: string; dry_run?: boolean }): Promise<CompileRenderResult> {
    const slug = assertSlug(input.entity_slug);
    const dryRun = input.dry_run ?? false;

    const entity = await this.getEntity(slug);
    if (!entity) throw new Error(`entity_not_found: "${slug}"`);

    const timeline = await this.getTimeline({ entity_slug: slug });
    const inferredLinks = await this.getLinks({ entity_slug: slug, direction: 'outbound', inferred: true });

    const content = renderEntityMarkdown(entity, timeline, inferredLinks);
    const relPath = `${entity.type}/${slug}.md`;

    if (dryRun) {
      return { path: relPath, action: 'dry_run', content };
    }

    const vaultRoot = await this.getConfig('vault_root');
    if (!vaultRoot) throw new Error('invalid_vault_root: vault_root not set in config');

    const absPath = join(vaultRoot, relPath);
    let existing: string | null = null;
    try {
      existing = await readFile(absPath, 'utf8');
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') throw new Error(`render_write_failed: ${err.message}`);
    }

    if (existing === content) {
      return { path: relPath, action: 'unchanged', content };
    }

    const action = existing === null ? 'created' : 'overwritten';
    try {
      await mkdir(dirname(absPath), { recursive: true });
      const tmp = `${absPath}.tmp-${process.pid}-${Date.now()}`;
      await writeFile(tmp, content, 'utf8');
      await rename(tmp, absPath);
    } catch (e) {
      const err = e as Error;
      throw new Error(`render_write_failed: ${err.message}`);
    }

    return { path: relPath, action, content };
  }

  async compileEmbed(input: { entity_slug: string }): Promise<CompileEmbedResult> {
    const slug = assertSlug(input.entity_slug);
    const e = await this.db.query<{ id: number; compiled_truth: string }>(
      'SELECT id, compiled_truth FROM entities WHERE slug = $1',
      [slug],
    );
    if (e.rows.length === 0) throw new Error(`entity_not_found: "${slug}"`);
    const entityId = e.rows[0].id;
    const compiledTruth = e.rows[0].compiled_truth ?? '';

    const timeline = await this.getTimeline({ entity_slug: slug });
    const timelineText = timeline
      .map(t => `- **${t.date}** | ${t.summary}${t.detail ? `\n  ${t.detail}` : ''}`)
      .join('\n\n');

    const bodyChunks = chunkText(compiledTruth);
    const tlChunks = chunkText(timelineText);

    type StagedChunk = { text: string; source: 'compiled_truth' | 'timeline' };
    const staged: StagedChunk[] = [
      ...bodyChunks.map(c => ({ text: c.text, source: 'compiled_truth' as const })),
      ...tlChunks.map(c => ({ text: c.text, source: 'timeline' as const })),
    ];

    const model = (await this.getConfig('embedding_model')) ?? 'text-embedding-3-large';

    // Count prior chunks before mutation for reporting.
    const priorCount = await this.db.query<{ c: number }>(
      'SELECT count(*)::int AS c FROM content_chunks WHERE entity_id = $1',
      [entityId],
    );
    const priorN = Number(priorCount.rows[0]?.c ?? 0);

    if (staged.length === 0) {
      await this.db.query('DELETE FROM content_chunks WHERE entity_id = $1', [entityId]);
      return {
        entity_slug: slug,
        chunks_written: 0,
        chunks_removed: priorN,
        tokens_encoded: 0,
        model,
      };
    }

    let embeddings: Float32Array[];
    try {
      embeddings = await embedBatch(staged.map(s => s.text));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`embedding_provider_unavailable: ${msg}`);
    }
    if (embeddings.length !== staged.length) {
      throw new Error('embedding_provider_invalid_input: embedding count mismatch');
    }

    // Atomic delete + insert. embedding succeeded before any DB mutation.
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM content_chunks WHERE entity_id = $1', [entityId]);

      const cols = '(entity_id, chunk_index, chunk_text, chunk_source, embedding, model, token_count, embedded_at)';
      const rowParts: string[] = [];
      const insertParams: unknown[] = [];
      let p = 1;
      for (let i = 0; i < staged.length; i++) {
        const s = staged[i];
        const emb = embeddings[i];
        const tokenCount = Math.ceil(s.text.length / 4);
        rowParts.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}::vector, $${p++}, $${p++}, now())`,
        );
        insertParams.push(
          entityId,
          i,
          s.text,
          s.source,
          embeddingLiteral(emb),
          model,
          tokenCount,
        );
      }
      await tx.query(
        `INSERT INTO content_chunks ${cols} VALUES ${rowParts.join(', ')}`,
        insertParams,
      );
    });

    const tokensEncoded = staged.reduce((sum, s) => sum + Math.ceil(s.text.length / 4), 0);

    return {
      entity_slug: slug,
      chunks_written: staged.length,
      chunks_removed: priorN,
      tokens_encoded: tokensEncoded,
      model,
    };
  }

  // --------------------------------------------------------
  // Chunk primitives (used by compileEmbed + transitional callers)
  // --------------------------------------------------------

  async upsertChunks(slug: string, chunks: ChunkInput[]): Promise<void> {
    assertSlug(slug);
    const e = await this.db.query<{ id: number }>('SELECT id FROM entities WHERE slug = $1', [slug]);
    if (e.rows.length === 0) throw new Error(`entity_not_found: "${slug}"`);
    const entityId = e.rows[0].id;

    const newIndices = chunks.map(c => c.chunk_index);
    if (newIndices.length === 0) {
      await this.db.query('DELETE FROM content_chunks WHERE entity_id = $1', [entityId]);
      return;
    }
    await this.db.query(
      'DELETE FROM content_chunks WHERE entity_id = $1 AND chunk_index != ALL($2::int[])',
      [entityId, newIndices],
    );

    const cols = '(entity_id, chunk_index, chunk_text, chunk_source, embedding, model, token_count, embedded_at)';
    const rowParts: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const chunk of chunks) {
      const embLit = chunk.embedding ? embeddingLiteral(chunk.embedding) : null;
      const model = chunk.model ?? 'text-embedding-3-large';
      const tokenCount = chunk.token_count ?? null;
      if (embLit) {
        rowParts.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}::vector, $${p++}, $${p++}, now())`,
        );
        params.push(entityId, chunk.chunk_index, chunk.chunk_text, chunk.chunk_source, embLit, model, tokenCount);
      } else {
        rowParts.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, NULL, $${p++}, $${p++}, NULL)`,
        );
        params.push(entityId, chunk.chunk_index, chunk.chunk_text, chunk.chunk_source, model, tokenCount);
      }
    }

    await this.db.query(
      `INSERT INTO content_chunks ${cols} VALUES ${rowParts.join(', ')}
         ON CONFLICT (entity_id, chunk_index) DO UPDATE SET
           chunk_text   = EXCLUDED.chunk_text,
           chunk_source = EXCLUDED.chunk_source,
           embedding    = CASE WHEN EXCLUDED.chunk_text != content_chunks.chunk_text
                               THEN EXCLUDED.embedding
                               ELSE COALESCE(EXCLUDED.embedding, content_chunks.embedding) END,
           model        = COALESCE(EXCLUDED.model, content_chunks.model),
           token_count  = EXCLUDED.token_count,
           embedded_at  = COALESCE(EXCLUDED.embedded_at, content_chunks.embedded_at)`,
      params,
    );
  }

  async getChunks(slug: string): Promise<Chunk[]> {
    assertSlug(slug);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT cc.* FROM content_chunks cc
         JOIN entities e ON e.id = cc.entity_id
        WHERE e.slug = $1
        ORDER BY cc.chunk_index`,
      [slug],
    );
    return rows.map(r => rowToChunk(r));
  }

  async getChunksWithEmbeddings(slug: string): Promise<Chunk[]> {
    assertSlug(slug);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT cc.* FROM content_chunks cc
         JOIN entities e ON e.id = cc.entity_id
        WHERE e.slug = $1
        ORDER BY cc.chunk_index`,
      [slug],
    );
    return rows.map(r => rowToChunk(r, true));
  }

  async deleteChunks(slug: string): Promise<void> {
    assertSlug(slug);
    await this.db.query(
      `DELETE FROM content_chunks
        WHERE entity_id = (SELECT id FROM entities WHERE slug = $1)`,
      [slug],
    );
  }

  async getEmbeddingsByChunkIds(ids: number[]): Promise<Map<number, Float32Array>> {
    if (ids.length === 0) return new Map();
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT id, embedding FROM content_chunks WHERE id = ANY($1::int[]) AND embedding IS NOT NULL',
      [ids],
    );
    const result = new Map<number, Float32Array>();
    for (const row of rows) {
      if (row.embedding) result.set(row.id as number, parseEmbedding(row.embedding));
    }
    return result;
  }

  // --------------------------------------------------------
  // Ancillary (transitional; operations.ts does NOT register these)
  // --------------------------------------------------------

  async createVersion(slug: string): Promise<EntityVersion> {
    assertSlug(slug);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `INSERT INTO entity_versions (entity_id, compiled_truth, frontmatter)
         SELECT id, compiled_truth, frontmatter FROM entities WHERE slug = $1
         RETURNING id, entity_id, compiled_truth, frontmatter, snapshot_at`,
      [slug],
    );
    if (rows.length === 0) throw new Error(`entity_not_found: "${slug}"`);
    const r = rows[0];
    return {
      id: r.id as number,
      entity_id: r.entity_id as number,
      compiled_truth: r.compiled_truth as string,
      frontmatter: asJSON(r.frontmatter),
      snapshot_at: toISO(r.snapshot_at),
    };
  }

  async getVersions(slug: string): Promise<EntityVersion[]> {
    assertSlug(slug);
    const { rows } = await this.db.query<Record<string, unknown>>(
      `SELECT ev.id, ev.entity_id, ev.compiled_truth, ev.frontmatter, ev.snapshot_at
         FROM entity_versions ev
         JOIN entities e ON e.id = ev.entity_id
        WHERE e.slug = $1
        ORDER BY ev.snapshot_at DESC`,
      [slug],
    );
    return rows.map(r => ({
      id: r.id as number,
      entity_id: r.entity_id as number,
      compiled_truth: r.compiled_truth as string,
      frontmatter: asJSON(r.frontmatter),
      snapshot_at: toISO(r.snapshot_at),
    }));
  }

  async putRawData(slug: string, source: string, data: object): Promise<void> {
    assertSlug(slug);
    await this.db.query(
      `INSERT INTO raw_data (entity_id, source, data)
         SELECT id, $2, $3::jsonb FROM entities WHERE slug = $1
         ON CONFLICT (entity_id, source) DO UPDATE SET
           data       = EXCLUDED.data,
           fetched_at = now()`,
      [slug, source, JSON.stringify(data)],
    );
  }

  async getRawData(slug: string, source?: string): Promise<RawData[]> {
    assertSlug(slug);
    let result;
    if (source) {
      result = await this.db.query<Record<string, unknown>>(
        `SELECT rd.source, rd.data, rd.fetched_at FROM raw_data rd
           JOIN entities e ON e.id = rd.entity_id
          WHERE e.slug = $1 AND rd.source = $2`,
        [slug, source],
      );
    } else {
      result = await this.db.query<Record<string, unknown>>(
        `SELECT rd.source, rd.data, rd.fetched_at FROM raw_data rd
           JOIN entities e ON e.id = rd.entity_id
          WHERE e.slug = $1`,
        [slug],
      );
    }
    return result.rows.map(r => ({
      source: r.source as string,
      data: asJSON(r.data),
      fetched_at: toISO(r.fetched_at),
    }));
  }

  async logIngest(entry: IngestLogInput): Promise<void> {
    await this.db.query(
      `INSERT INTO ingest_log (source_type, source_ref, entities_updated, summary)
         VALUES ($1, $2, $3::jsonb, $4)`,
      [entry.source_type, entry.source_ref, JSON.stringify(entry.entities_updated), entry.summary],
    );
  }

  async getIngestLog(opts?: { limit?: number }): Promise<IngestLogEntry[]> {
    const limit = opts?.limit ?? 50;
    const { rows } = await this.db.query<Record<string, unknown>>(
      'SELECT * FROM ingest_log ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return rows.map(r => ({
      id: r.id as number,
      source_type: r.source_type as string,
      source_ref: r.source_ref as string,
      entities_updated: (() => {
        const v = r.entities_updated;
        if (Array.isArray(v)) return v.map(String);
        if (typeof v === 'string') {
          try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : []; }
          catch { return []; }
        }
        return [];
      })(),
      summary: (r.summary as string) ?? '',
      created_at: toISO(r.created_at),
    }));
  }

  async updateSlug(oldSlug: string, newSlug: string): Promise<void> {
    assertSlug(oldSlug);
    assertSlug(newSlug);
    await this.db.query(
      'UPDATE entities SET slug = $1, updated_at = now() WHERE slug = $2',
      [newSlug, oldSlug],
    );
  }

  async rewriteLinks(_oldSlug: string, _newSlug: string): Promise<void> {
    // Links key on integer entity_id FKs; updateSlug keeps them correct.
  }

  async getStats(): Promise<BrainStats> {
    const { rows: [stats] } = await this.db.query<Record<string, unknown>>(`
      SELECT
        (SELECT count(*) FROM entities) AS entity_count,
        (SELECT count(*) FROM content_chunks) AS chunk_count,
        (SELECT count(*) FROM content_chunks WHERE embedded_at IS NOT NULL) AS embedded_count,
        (SELECT count(*) FROM links) AS link_count,
        (SELECT count(*) FROM (SELECT DISTINCT unnest(tags) FROM entities) t) AS tag_count,
        (SELECT count(*) FROM timeline_entries) AS timeline_entry_count
    `);

    const { rows: types } = await this.db.query<{ type: string; count: number }>(
      'SELECT type, count(*)::int AS count FROM entities GROUP BY type ORDER BY count DESC',
    );
    const entities_by_type: Record<string, number> = {};
    for (const t of types) entities_by_type[t.type] = Number(t.count);

    const s = stats as Record<string, unknown>;
    return {
      entity_count: Number(s.entity_count),
      chunk_count: Number(s.chunk_count),
      embedded_count: Number(s.embedded_count),
      link_count: Number(s.link_count),
      tag_count: Number(s.tag_count),
      timeline_entry_count: Number(s.timeline_entry_count),
      entities_by_type,
    };
  }

  async getHealth(): Promise<BrainHealth> {
    const { rows: [h] } = await this.db.query<Record<string, unknown>>(`
      SELECT
        (SELECT count(*) FROM entities) AS entity_count,
        (SELECT count(*) FROM content_chunks WHERE embedded_at IS NOT NULL)::float /
          GREATEST((SELECT count(*) FROM content_chunks), 1)::float AS embed_coverage,
        (SELECT count(*) FROM entities e
           WHERE e.updated_at < (SELECT MAX(te.created_at) FROM timeline_entries te WHERE te.entity_id = e.id)
        ) AS stale_entities,
        (SELECT count(*) FROM entities e
           WHERE NOT EXISTS (SELECT 1 FROM links l WHERE l.to_entity_id = e.id)
             AND NOT EXISTS (SELECT 1 FROM links l WHERE l.from_entity_id = e.id)
        ) AS orphan_entities,
        (SELECT count(*) FROM links l
           WHERE NOT EXISTS (SELECT 1 FROM entities e WHERE e.id = l.to_entity_id)
        ) AS dead_links,
        (SELECT count(*) FROM content_chunks WHERE embedded_at IS NULL) AS missing_embeddings,
        (SELECT count(*) FROM links) AS link_count,
        (SELECT count(DISTINCT entity_id) FROM timeline_entries) AS entities_with_timeline
    `);

    const entityCount = Number(h.entity_count);
    const embedCoverage = Number(h.embed_coverage);
    const orphan = Number(h.orphan_entities);
    const dead = Number(h.dead_links);
    const linkCount = Number(h.link_count);
    const entitiesWithTimeline = Number(h.entities_with_timeline);

    const linkDensity = entityCount > 0 ? Math.min(linkCount / entityCount, 1) : 0;
    const timelineCoverage = entityCount > 0 ? Math.min(entitiesWithTimeline / entityCount, 1) : 0;
    const noOrphans = entityCount > 0 ? 1 - orphan / entityCount : 1;
    const noDead = entityCount > 0 ? 1 - Math.min(dead / entityCount, 1) : 1;
    const brainScore = entityCount === 0 ? 0 : Math.round(
      (embedCoverage * 0.35 + linkDensity * 0.25 + timelineCoverage * 0.15 +
       noOrphans * 0.15 + noDead * 0.10) * 100,
    );

    return {
      entity_count: entityCount,
      embed_coverage: embedCoverage,
      stale_entities: Number(h.stale_entities),
      orphan_entities: orphan,
      dead_links: dead,
      missing_embeddings: Number(h.missing_embeddings),
      brain_score: brainScore,
    };
  }
}

// ============================================================
// Render helpers (used by compileRender)
// ============================================================

function renderEntityMarkdown(entity: Entity, timeline: TimelineEntry[], inferred: Link[]): string {
  const fm = renderFrontmatter(entity);

  const tlDesc = [...timeline].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });

  const timelineLines = tlDesc.map(t => {
    const display = sourceDisplayName(t.source_path);
    const rel = `../${t.source_path}`;
    return `- **${t.date}** | ${t.summary} ^[[${display}](${rel}), ${t.date}]`;
  });

  const inferredSorted = [...inferred].sort((a, b) => a.to_slug < b.to_slug ? -1 : a.to_slug > b.to_slug ? 1 : 0);

  const parts: string[] = [];
  parts.push('---');
  parts.push(fm);
  parts.push('---');
  parts.push('');
  parts.push(`# ${entity.title}`);
  parts.push('');
  if (entity.compiled_truth) {
    parts.push(entity.compiled_truth.replace(/\n+$/, ''));
    parts.push('');
  }
  parts.push('---');
  parts.push('');
  parts.push('## Timeline');
  parts.push('');
  if (timelineLines.length > 0) {
    parts.push(timelineLines.join('\n'));
    parts.push('');
  }
  if (inferredSorted.length > 0) {
    parts.push('---');
    parts.push('');
    parts.push('## Inferred Connections');
    parts.push('');
    for (const link of inferredSorted) {
      const rel = `../${inferredLinkPath(link.to_slug)}`;
      parts.push(`- [${link.to_slug}](${rel}) — \`${link.link_type}\` (${link.context})`);
    }
    parts.push('');
  }

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '') + '\n';
}

function renderFrontmatter(entity: Entity): string {
  const lines: string[] = [];
  lines.push(`title: ${yamlScalar(entity.title)}`);
  lines.push(`type: ${entity.type}`);
  lines.push(`aliases: ${yamlStringList(entity.aliases)}`);
  lines.push(`tags: ${yamlStringList(entity.tags)}`);

  const createdFromFM = entity.frontmatter?.['created'];
  const updatedFromFM = entity.frontmatter?.['updated'];
  lines.push(`created: ${typeof createdFromFM === 'string' ? createdFromFM : entity.created_at.slice(0, 10)}`);
  lines.push(`updated: ${typeof updatedFromFM === 'string' ? updatedFromFM : entity.updated_at.slice(0, 10)}`);

  const reserved = new Set(['title', 'type', 'aliases', 'tags', 'created', 'updated']);
  const extras = Object.keys(entity.frontmatter ?? {}).filter(k => !reserved.has(k)).sort();
  for (const k of extras) {
    lines.push(`${k}: ${yamlScalar(entity.frontmatter[k])}`);
  }
  return lines.join('\n');
}

function yamlStringList(arr: string[]): string {
  if (arr.length === 0) return '[]';
  return '[' + arr.map(s => yamlScalar(s)).join(', ') + ']';
}

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  // Quote when the value could be misread.
  if (/^[\s]|[\s]$|[:#"'{}\[\],&*!|>%@`]/.test(s) || s === '' || /^(true|false|null|~|yes|no)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

function sourceDisplayName(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

function inferredLinkPath(targetSlug: string): string {
  // Target category is unknown at render time without a second query; caller's
  // wiki renders links by slug alone. compile_render parenthetical already
  // describes the relationship; the path is best-effort relative.
  return `${targetSlug}.md`;
}

# Phase 2b: Schema + src plumbing

**Status:** planned (pending review)
**Date:** 2026-04-21
**Sequences:** the concrete code steps that turn `specs/operations/*.md` into
a working engine + CLI + MCP stack.
**Supersedes (partially):** §Phase 2 of
`docs/plans/2026-04-20-k2-implementation.md`. That plan sketched the work at a
high level; this plan decomposes it into ordered commits informed by the full
Phase 2a spec set.

---

## Context

Phase 2a drafted 19 operation contracts in `specs/operations/` (see
`specs/README.md` index). Every write op and every read op is now spec'd, so
the schema migration can be designed against a complete set of column and
FK requirements — no "what if we also need X?" surprises mid-migration.

This plan lands the K2 schema, updates the `BrainEngine` interface and both
engines (PGLite + Postgres), wires the 19 ops into `src/core/operations.ts`,
and exposes them via CLI + MCP per each op's trust boundary.

The deliverable of Phase 2b is: a gbrain-k2 build that passes unit tests on
the new schema, can round-trip `compile_put_page` → `get_entity`, and leaves
Phase 2a's contracts implementable (not necessarily wired through COMPILE —
that is Phase 3's test-vault work).

---

## Decisions to land in this phase

### D1. Rename `pages` → `entities`

**Decision:** rename.

Specs uniformly use `entities`. Current schema uses `pages`. Keeping the old
name in the schema while specs reference `entities` would force every future
reader to mentally translate. Since Phase 2b is already touching every file
that names the table, the rename is amortized against the other work.

Scope of the rename:
- Table name: `pages` → `entities`
- Column: `links.from_page_id`, `links.to_page_id` → `from_entity_id`,
  `to_entity_id`
- Column: `content_chunks.page_id` → `entity_id`
- Column: `timeline_entries.page_id` → `entity_id`
- Column: `tags.page_id` → `entity_id`
- Column: `raw_data.page_id` → `entity_id`
- Column: `page_versions.page_id` → `entity_id`
- Indexes keyed on these columns follow the rename.
- TypeScript types: `Page`, `PageInput`, `PageFilters`, `PageType`,
  `PageVersion` → `Entity`, `EntityInput`, `EntityFilters`, `EntityType`,
  `EntityVersion`.
- `BrainEngine` methods: `getPage`/`putPage`/`deletePage`/`listPages` →
  `getEntity`/`putEntity`/`deleteEntity`/`listEntities`. The new
  `compile_put_page` stays separately named for the structured-write path
  (per §Phase 2 original plan §Confirmed decisions).

Migration: destructive schema change. The existing `pages` data does not
need backwards compatibility — no shipped users. See §Migration path for
how this lands.

### D2. `PageType` → `EntityType` with K2 categories

**Decision:** replace the enum with K2_SCHEMA.md categories.

`EntityType` = `'people' | 'places' | 'projects' | 'companies' | 'ideas' |
'originals' | 'concepts' | 'how-to' | 'media' | 'tools' | 'meetings' |
'decisions' | 'household' | 'personal' | 'org' | 'writing'`.

The legacy `PageType` enum in `src/core/types.ts` is replaced. Any code
branching on `type === 'person'` etc. is updated to the K2 names.

### D3. Keep `pages.timeline` column, stop writing

**Decision:** matches original plan §Confirmed decisions.

Rename the column to `entities.timeline` along with the table rename, but
mark it deprecated. New code MUST NOT write it. Drop-column is Phase 4 or
later cleanup.

### D4. Remove `pages.source_paths TEXT[]`

**Decision:** remove. Replaced entirely by `sources` + `entity_sources`.

### D5. New columns / tables to add

From §Phase 2a spec requirements (cross-referenced per op):

| Column / table | Op references | Notes |
|----------------|---------------|-------|
| `entities.struct_hash TEXT` (nullable) | `compile_put_page`, `get_entity`, `list_entities` | Null supported for RECOVER phase-4 shells. |
| `entities.aliases TEXT[]` | `compile_put_page`, `get_entity`, `list_entities`, `search` | Replaces scattered alias tracking; sorted on read. |
| `entities.tags TEXT[]` | many — promoted from `tags` join table | Decision: store as array column on `entities`, retire the `tags` table. Simplifies reads. See §D6. |
| `links.inferred BOOLEAN DEFAULT false` | `add_link`, `get_links`, `get_graph` | K2 principle 4 — structural inference flag. |
| `links` uniqueness | `add_link` | Change from `UNIQUE(from_page_id, to_page_id)` to `UNIQUE(from_entity_id, to_entity_id, link_type)` per `add_link` §Signature. |
| `timeline_entries.source_id INTEGER` FK | `add_timeline_entry`, `get_timeline` | FK to `sources(id)`. Replaces current `source TEXT` string. |
| `sources` table | `register_source`, `set_source_status`, `update_source_path` | See below. |
| `entity_sources` junction | `link_entity_source`, `unlink_entity_source` | See below. |
| `content_chunks.chunk_source` enum values | `compile_embed`, `query` | Values: `'compiled_truth' | 'timeline'`. Already present; keep. |

`sources` schema:
```
CREATE TABLE sources (
  id           SERIAL PRIMARY KEY,
  path         TEXT UNIQUE NOT NULL,
  content_hash TEXT,
  status       TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'deleted'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sources_status ON sources(status);
```

`entity_sources` schema:
```
CREATE TABLE entity_sources (
  entity_id  INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  source_id  INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, source_id)
);
CREATE INDEX idx_entity_sources_source ON entity_sources(source_id);
```

FK cascade on `entity_id` matches `delete_entity` §CRUD class contract.

### D6. Promote `tags` to `entities.tags TEXT[]`, retire `tags` table

**Decision:** retire the separate `tags` table.

`get_entity` returns `tags: string[]` sorted; `list_entities` filters by
`tag: string`. A dedicated `tags` table forces a join on every read. With
an array column + GIN index, reads are one query. Writes are array set
operations inside `compile_put_page`.

Migration: read `tags` rows, populate `entities.tags` array, drop the
table. No shipped user data to preserve.

### D7. Deferred open questions

The following Phase 2a-inherited open questions are NOT resolved in
Phase 2b. Implementation picks pragmatic defaults; the questions stay
open for later tightening:

- Canonical `struct_hash` serialization — temporary choice: SHA-256 over
  a JSON-canonicalized representation of `{ type, sorted tags, sorted
  aliases, sorted entity_source_ids, sorted links_with_inferred, sorted
  timeline_entry_ids }`. Callers get a stable enough hash to exercise
  `compile_put_page` `noop` semantics.
- Transaction boundaries across COMPILE phases — default to
  per-entity transactions (match `delete_entity` §Atomicity).
- Chunker tier selection — config-driven. Phase 2b picks recursive
  (deterministic) as the default for RECOVER compatibility.

---

## Execution sequence

Ordered commits. Each commit is independent enough to review in isolation;
each leaves the build passing. Numbering is suggested loop order — one
commit per Ralph loop where possible.

### Step 1. Draft schema migration (this plan's sibling file)

**Task:** `specs/operations/` set is already complete. Write a compact
data-migration doc that the engine's `initSchema` will execute on fresh
DBs. No migration of existing data (no shipped users).

**Files:** `docs/plans/2026-04-21-schema-migration.md` OR inline into this
plan's §D5. Deliverable is the exact SQL DDL.

**Commit:** "plans: schema DDL for Phase 2b"

### Step 2. Rewrite `src/schema.sql`

**Task:** replace the entire legacy schema with the K2 schema. Rename
tables, add new tables, drop `source_paths` and `tags` tables, change
link uniqueness key.

**Files:** `src/schema.sql`.

**Test:** `bun run build:schema` regenerates `src/core/schema-embedded.ts`
without error.

**Commit:** "schema: K2 rehaul — entities, sources, entity_sources,
struct_hash, inferred"

### Step 3. Update `src/core/pglite-schema.ts`

**Task:** keep in sync with `schema.sql`. PGLite-specific DDL (no
pg_trgm, different vector extension, etc.).

**Files:** `src/core/pglite-schema.ts`.

**Test:** PGLite engine init on a fresh temp DB succeeds.

**Commit:** "pglite: schema parity with K2 rehaul"

### Step 4. Update `src/core/types.ts`

**Task:** `Page` → `Entity`, `PageType` → `EntityType` (with K2
categories), etc. Add types for new ops: `Entity`, `EntitySummary`,
`Source`, `EntitySource`, `Link` with `inferred`, `TimelineEntry`
with `source_id`.

**Files:** `src/core/types.ts`.

**Test:** TypeScript compile passes.

**Commit:** "types: rename Page → Entity, add K2 op types"

### Step 5. Update `src/core/engine.ts` interface

**Task:** rename methods (`getPage` → `getEntity`, etc.), add new
method signatures for the 19 K2 ops. Keep the legacy names for ops
that already exist but change their signatures (e.g., `addLink`
now takes `inferred`).

**Files:** `src/core/engine.ts`.

**Test:** TypeScript compile. Both engine impls will fail — that's
expected; next step fixes them.

**Commit:** "engine: K2 interface shape"

### Step 6. Port `pglite-engine.ts` to K2 schema

**Task:** rewrite each method to target the new schema. Implement the
new ops per each spec's contract. Preserve the hnsw index + vector
search behavior.

**Files:** `src/core/pglite-engine.ts`.

**Test:** existing unit tests pass where applicable; new unit tests
for each new op (per Phase 2b §Test strategy).

**Commit:** "pglite: implement K2 ops"

### Step 7. Port `postgres-engine.ts` to K2 schema

**Task:** mirror step 6 for Postgres. Use recursive CTE for
`get_graph`, pg_trgm for `search`, hybrid RRF for `query`.

**Files:** `src/core/postgres-engine.ts`.

**Test:** E2E tests against Postgres on port 5433.

**Commit:** "postgres: implement K2 ops"

### Step 8. Wire `src/core/operations.ts`

**Task:** every op gets a corresponding `Operation` entry. Param
validators match the spec's preconditions. `remote` gate applied to
write ops per each spec's §Trust boundary.

**Files:** `src/core/operations.ts`.

**Test:** `bun test` unit pass.

**Commit:** "operations: register K2 op set"

### Step 9. Update `src/core/migrate.ts`

**Task:** clear the legacy `MIGRATIONS` list and drop the destructive
migration runner (no existing users). Replace with an `initSchema`
idempotent runner that creates tables from `schema.sql`.

Alternative: keep the migration framework but start with migration
`001` that creates the K2 schema.

**Files:** `src/core/migrate.ts`.

**Commit:** "migrate: reset to K2 init"

### Step 10. Update `src/cli.ts` and `src/mcp/server.ts`

**Task:** the operations register is the source of truth. CLI and
MCP auto-generate dispatch; this step is mostly audit.

**Files:** `src/cli.ts`, `src/mcp/server.ts`.

**Test:** CLI help lists all 19 K2 ops. MCP server exposes only the
read ops + MCP-safe ops per each spec's §Trust boundary.

**Commit:** "cli+mcp: expose K2 ops per trust boundaries"

### Step 11. Prune legacy callers in `src/commands/`

**Task:** commands that referenced `pages.timeline` or
`source_paths TEXT[]` must be updated or quarantined. Per the
original plan's §Deferred: "Legacy command pruning (call, autopilot,
features, serve, auth, publish)" — some commands will be deleted
outright.

**Files:** `src/commands/*.ts`.

**Test:** `bun test` unit pass; E2E Tier 1 mechanical pass.

**Commit:** "commands: prune legacy, migrate active to K2 ops"

### Step 12. Update unit tests

**Task:** per-op unit tests. Each op has a smoke test that exercises
the `created | updated | noop` or `deleted | noop` or
`nodes/edges/truncated` return shape on a seeded DB.

**Files:** `test/*.test.ts`.

**Commit:** "tests: K2 op smoke tests"

### Step 13. Update E2E Tier 1

**Task:** `test/e2e/` mechanical sweep — every op called at least
once end-to-end against a real Postgres. No API keys required.

**Files:** `test/e2e/*.test.ts`.

**Commit:** "e2e: K2 op mechanical sweep"

---

## Per-file change summary

| File | Change | Step |
|------|--------|------|
| `src/schema.sql` | Rewrite | 2 |
| `src/core/pglite-schema.ts` | Rewrite | 3 |
| `src/core/schema-embedded.ts` | Regenerate (auto) | 2 |
| `src/core/types.ts` | Rename + add types | 4 |
| `src/core/engine.ts` | New interface | 5 |
| `src/core/pglite-engine.ts` | Implement K2 ops | 6 |
| `src/core/postgres-engine.ts` | Implement K2 ops | 7 |
| `src/core/operations.ts` | Register 19 K2 ops | 8 |
| `src/core/migrate.ts` | Reset migrations | 9 |
| `src/cli.ts` | Audit op exposure | 10 |
| `src/mcp/server.ts` | Audit trust boundaries | 10 |
| `src/commands/*.ts` | Prune legacy | 11 |
| `test/**.test.ts` | Add per-op tests | 12, 13 |

---

## Migration path

No shipped users. No production brains depend on the current schema.

**For development brains:** destructive drop. Operators with a local
gbrain DB rerun `gbrain init`. No backfill, no data preservation.

If a user in the field has an older schema (from before the feat/k2
branch), their brain continues to work on the old gbrain binary —
they upgrade when they choose to, at which point they re-init. This
is acceptable for a pre-1.0 rehaul.

**Documentation:** call out the destructive reset in CHANGELOG.md once
the Phase 2b branch lands.

---

## Test strategy

### Unit (per op)

Each op gets a smoke test covering:
- Happy path (the documented success shape).
- One error per `Errors` table that is reproducible without complex
  setup (e.g., `invalid_slug`, `entity_not_found`).
- Idempotency check where the spec claims one (e.g.,
  `unlink_entity_source` twice returns `deleted` then `noop`).

Tests mock the engine at the spec-return-shape level where possible,
hitting real engines only for query-structure validation.

### Integration (per op set)

A few cross-op sequences test the phase-5 composition contract:
- `register_source` → `compile_put_page` → `link_entity_source` →
  `add_link` → `add_timeline_entry` → `compile_put_page` (with
  struct_hash).
- Cascade: `set_source_status('deleted')` →
  `unlink_entity_source` → (`entity_sources.count === 0`) →
  `add_timeline_entry` (drop-link) → `delete_entity`.

These catch orchestration bugs the spec discipline cannot.

### E2E Tier 1

Real Postgres, no API keys. Every op called via CLI at least once.
Extends existing `test/e2e/` harness.

### Embedding tests (Tier 2)

`compile_embed` + `query` need a real embedding provider.
Tier 2 tests stay opt-in with `OPENAI_API_KEY` gate, matching the
existing `skills.test.ts` pattern.

---

## Risks

- **Table rename has long blast radius.** Every test, every command,
  every engine method touches it. Step 4 (`types.ts`) and step 5
  (`engine.ts`) are likely the biggest diff. A single-commit rename is
  cleaner than a multi-commit staged rename, so steps 4–9 should land
  close together.
- **Link uniqueness change** (`(from, to)` → `(from, to, link_type)`)
  is a real semantic change. Existing dev DBs with duplicate
  `(from, to, link_type)` rows are impossible (since old constraint
  was strict on `(from, to)`), so the new constraint is always more
  permissive — no row gets rejected on migration.
- **`source_id` FK on `timeline_entries`** is a shape change from the
  old `source TEXT` string. Old rows need either migration (convert
  path string → source row lookup) or discard. Since no shipped users,
  the reset path wins.
- **PGLite vs Postgres drift on vector behavior.** Score normalization
  per `search` / `query` specs requires both engines to return
  `[0, 1]` — PGLite may need a post-query normalization wrapper.
  Budget engineering time for the cross-engine parity tests.
- **Chunker determinism in RECOVER.** If the recursive tier isn't
  byte-stable, RECOVER invariant 5 fails. Flagged as Open Question in
  specs, but the Phase 2b unit tests should pin it with a golden
  fixture.

---

## Follow-ups (Phase 3 and later)

Phase 3 is the test vault exercise. Before that:
- `scan_dead_links` read op (dependency from `delete_link` spec).
- `get_links` variant that exposes `link_id` (additive).
- `struct_hash` canonicalization decision formalized.
- Transaction-boundary policy per COMPILE phase.

These are Phase 2a follow-ups that Phase 3 might surface.

---

## Queue mirror for `fix_plan.md`

The ordered steps above map to Phase 2b rows in `fix_plan.md`:

| # | Task | Step | Status |
|---|------|------|--------|
| 20 | Phase 2b plan | 1 | done (this loop) |
| 21 | Rewrite `src/schema.sql` | 2 | todo |
| 22 | Update `src/core/pglite-schema.ts` | 3 | todo |
| 23 | Update `src/core/types.ts` | 4 | todo |
| 24 | Update `src/core/engine.ts` interface | 5 | todo |
| 25 | Port `pglite-engine.ts` to K2 | 6 | todo |
| 26 | Port `postgres-engine.ts` to K2 | 7 | todo |
| 27 | Register K2 ops in `operations.ts` | 8 | todo |
| 28 | Reset `migrate.ts` for K2 init | 9 | todo |
| 29 | Audit CLI + MCP op exposure | 10 | todo |
| 30 | Prune legacy commands | 11 | todo |
| 31 | Unit tests per op | 12 | todo |
| 32 | E2E Tier 1 sweep | 13 | todo |

Ralph picks one per loop; later loops may fuse closely-related steps
(e.g., 4+5 rename work) if scope feels unit-of-review-sized.

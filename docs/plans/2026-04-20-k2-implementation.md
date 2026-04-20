<!-- /autoplan restore point: /home/k/.gstack/projects/kanzaki1201-gbrain-k2/feat-k2-schema-design-rehaul-autoplan-restore-20260420-024236.md -->

# K2 Implementation Plan

## Context

gbrain-k2 realignment to K2_DESIGN.md. The 4 operations (INGEST, COMPILE,
MAINTAIN, RECOVER) are agent skills. gbrain CLI is the DB interface. Agent
does LLM work, CLI does DB work. Database is Postgres only.

## Confirmed decisions (autoplan review)

- **Separate compile_put_page**, deprecate old put_page (no backward compat needed)
- **Deprecate pages.timeline**, don't drop yet. Stop writing to it, remove later.
- **Skills first, code second**. Compile skill is the contract. Write it, then
  implement the operations it calls.

## Phase 1: Write K2 skills (contract-first)

Write the compile skill first. It defines what the agent needs from the CLI.
The skill IS the spec for Phase 2.

**skills/compile/SKILL.md** — the core engine
- User triggers manually (or cron later)
- Step by step: detect changes (checkpoint) → read raw files → extract
  entities via LLM → search existing pages (notability gate, dedup) →
  call compile_put_page for each entity → call add_link with source +
  inferred flag → call add_timeline_entry → compute struct_hash →
  call compile_render for changed pages → call compile_embed
- Cross-entity propagation, citation format, filing rules

**skills/ingest/SKILL.md** — content enters raw zone
**skills/maintain/SKILL.md** — quality enforcement
**skills/recover/SKILL.md** — wiki → DB reconstruction
**skills/query/SKILL.md** — answering questions using the brain

## Phase 2: Schema + new operations

### Schema additions (additive only)
- `pages.source_paths TEXT[]`
- `pages.struct_hash TEXT`
- `links.inferred BOOLEAN DEFAULT false`
- `pages.timeline` — KEEP but stop writing to it. Deprecate.

Files: schema.sql, pglite-schema.ts, schema-embedded.ts, types.ts,
engine.ts, pglite-engine.ts, postgres-engine.ts, migrate.ts, operations.ts

### New operation: compile_put_page
- Input: slug, type, title, compiled_truth, source_paths, struct_hash,
  frontmatter (tags, aliases, etc.)
- Structured write — no markdown parsing, no importFromContent()
- Upsert page record, update compiled_truth cache
- Old put_page stays but is deprecated (still used by import/sync)

### New operation: compile_render
- Input: slug (or "all changed" — pages where struct_hash differs)
- DB → markdown: read page + links + timeline_entries, format as K2
  page (frontmatter + compiled truth + --- + timeline), write to
  vault path per K2_SCHEMA.md filing rules

### New operation: compile_embed
- Input: slug (or "all changed")
- Chunk compiled_truth + timeline text, embed, store
- Reuse existing chunker + embedding pipeline

### Update existing operations
- `add_link` — add `inferred` boolean param, add `source` param
- `add_timeline_entry` — verify source field works correctly

Files to create: src/core/compile.ts
Files to modify: operations.ts, engine.ts, both engines, cli.ts, mcp/server.ts

## Phase 3: Test vault

**Directory:** `~/test-small-brain/`

Category dirs at vault root per K2_SCHEMA.md (no wiki/ container):
```
~/test-small-brain/
├── K2_SCHEMA.md
├── sources/
│   ├── imports/
│   │   ├── obsidian-journals/  # 29 .md journals
│   │   └── logseq-pages/      # subset of Logseq-md pages
│   └── Clippings/              # 13 clippings
├── people/                      # compile populates these
├── tools/
├── concepts/
├── inbox/
└── human/zettel/
```

**Database:** Postgres on localhost:5433, db: k2_test_brain (created)

**Test workflow:**
1. gbrain init with Postgres
2. gbrain sync to INGEST raw files
3. Agent follows compile skill: extract entities from a few files,
   call compile_put_page / add_link / add_timeline_entry,
   call compile_render, call compile_embed
4. Verify wiki output matches K2_SCHEMA.md
5. Agent follows maintain skill: health checks
6. Delete DB, agent follows recover skill: parse wiki, rebuild
7. Verify structural equivalence

## Phase 4: CLAUDE.md + README update

After implementation stabilizes.

## Execution order

Phase 1 first — skills define the contract.
Phase 2 next — implement what the skills call.
Phase 3 after — test with real data.
Phase 4 last — docs reflect final state.

## Deferred

- Drop pages.timeline column (after compile is proven)
- PGLite engine removal or update
- Legacy command pruning (call, autopilot, features, serve, auth, publish)
- Legacy core pruning (enrichment-service, data-research, fail-improve, etc.)
- PageType enum update for K2 categories
- Compile checkpoint storage (config table key)
- Canonical struct_hash serialization definition
- Page identity/merge policy
- Deletion semantics (what removes stale facts/pages/links)
- Transaction boundaries across compile operations

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|---------------|-----------|-----------|
| 1 | CEO | Separate compile_put_page | User override | User choice | User prefers clean separation, deprecate old put_page |
| 2 | CEO | Deprecate timeline, don't drop | Mechanical | P3 pragmatic | ~30 files touched, zero user benefit, high regression risk |
| 3 | CEO | Skills first, code second | Mechanical | P5 explicit | Skill IS the contract. Matches contract-first pattern |
| 4 | CEO | Render format = public schema | Taste | P1 completeness | RECOVER parses rendered markdown, so format matters |

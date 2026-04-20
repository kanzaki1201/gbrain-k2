<!-- /autoplan restore point: /home/k/.gstack/projects/kanzaki1201-gbrain-k2/feat-k2-schema-design-rehaul-autoplan-restore-20260420-024236.md -->

# K2 Implementation Plan

## Context

gbrain-k2 realignment to K2_DESIGN.md. The 4 operations (INGEST, COMPILE,
MAINTAIN, RECOVER) are agent skills. gbrain CLI is the DB interface. Agent
does LLM work, CLI does DB work. Database is Postgres only.

INGEST is for interactive use only: user gives content to the agent, agent
writes it to the raw zone. Files already in the raw zone (imports,
clippings, human zettel) are NOT ingested. COMPILE picks them up directly.

## Confirmed decisions (autoplan review)

- **Separate compile_put_page**, deprecate old put_page
- **Deprecate pages.timeline**, don't drop yet. Remove later.
- **Skills first, code second**. Compile skill is the contract.

---

## Phase 1: Write K2 skills (contract-first)

Write the compile skill first — it defines what the agent needs from
the CLI. The skill IS the spec for Phase 2.

### skills/compile/SKILL.md

The core engine. User triggers manually (or cron later).

1. Detect changes in raw zone since checkpoint (new, modified, deleted, moved files)
2. For new/modified files: read raw content, extract entities via LLM
3. Search existing pages before creating new (notability gate, dedup)
4. Call `compile_put_page` for each entity
5. Call `add_link` with source + inferred flag
6. Call `add_timeline_entry`
7. Compute struct_hash
8. Call `compile_render` for changed pages
9. Call `compile_embed`
10. For deleted/moved files: update source_paths on affected pages,
    re-render, remove pages that lost all sources

Cross-entity propagation, citation format, filing rules per K2_SCHEMA.md.

### skills/ingest/SKILL.md

Interactive use: user gives content to agent → agent writes to raw zone
(sources/ingested/ per K2_SCHEMA.md). Does NOT process into DB. That is
compile's job.

### skills/maintain/SKILL.md

Quality enforcement. Health checks per K2_DESIGN.md.

### skills/recover/SKILL.md

Wiki → DB reconstruction. Parse rendered markdown, rebuild via
compile_put_page + add_link + add_timeline_entry.

### skills/query/SKILL.md

Answer questions using the brain. Brain-first lookup, citation propagation.

---

## Phase 2: Schema + new operations

### Schema changes

- Add `pages.source_paths TEXT[]`
- Add `pages.struct_hash TEXT`
- Add `links.inferred BOOLEAN DEFAULT false`
- Deprecate `pages.timeline` (stop writing, keep column for now)

Files: `src/schema.sql`, `src/core/pglite-schema.ts`, `src/core/schema-embedded.ts`,
`src/core/types.ts`, `src/core/engine.ts`, `src/core/pglite-engine.ts`,
`src/core/postgres-engine.ts`, `src/core/migrate.ts`, `src/core/operations.ts`

### New operation: compile_put_page

- Input: slug, type, title, compiled_truth, source_paths, struct_hash,
  frontmatter (tags, aliases, etc.)
- Structured write — no markdown parsing, no importFromContent()
- Upsert page record, update compiled_truth cache
- Old put_page deprecated (still used by legacy import path)

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

Files to create: `src/core/compile.ts`
Files to modify: `src/core/operations.ts`, `src/core/engine.ts`, both engines,
`src/cli.ts`, `src/mcp/server.ts`

---

## Phase 3: Test vault

**Directory:** `~/test-small-brain/`

Category dirs at vault root per K2_SCHEMA.md (no wiki/ container):

```
~/test-small-brain/
├── K2_SCHEMA.md
├── sources/
│   ├── imports/
│   │   ├── obsidian-journals/   # 29 .md journals
│   │   └── logseq-pages/       # subset of Logseq-md pages
│   └── Clippings/               # 13 clippings
├── people/                       # compile populates these
├── tools/
├── concepts/
├── inbox/
└── human/
    └── zettel/
```

**Database:** Postgres on localhost:5433, db: k2_test_brain (created)

### Test workflow

1. Set up vault directory, copy test data from brain-vault
2. `gbrain init` with Postgres engine
3. Agent follows **compile skill**: detect raw zone files, extract
   entities, call compile_put_page / add_link / add_timeline_entry,
   call compile_render, call compile_embed
4. Verify wiki output matches K2_SCHEMA.md page format
5. Agent follows **maintain skill**: run health checks
6. **Test deletion:** human deletes a raw file → run compile again →
   verify affected pages are updated (source_paths shrink, pages with
   no remaining sources are handled)
7. **Test move:** human moves a raw file → run compile → verify
   source_paths updated, no orphaned references
8. **Test ingest:** user gives agent new content → agent writes to
   sources/ingested/ → run compile → verify new entities extracted
9. Delete DB, agent follows **recover skill**: parse wiki markdown,
   rebuild DB → verify structural equivalence

---

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
- Transaction boundaries across compile operations

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|---------------|-----------|-----------|
| 1 | CEO | Separate compile_put_page | User override | User choice | Clean separation, deprecate old put_page |
| 2 | CEO | Deprecate timeline, don't drop | Mechanical | P3 pragmatic | ~30 files, high risk, zero user benefit |
| 3 | CEO | Skills first, code second | Mechanical | P5 explicit | Skill IS the contract |
| 4 | CEO | Render format = public schema | Taste | P1 completeness | RECOVER parses rendered markdown |

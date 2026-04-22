# fix_plan.md — K2 rehaul task queue

Ralph reads this to pick the next task. ONE task per loop.

Authoritative plan: [docs/plans/2026-04-20-k2-implementation.md](docs/plans/2026-04-20-k2-implementation.md).
This file is the rolling queue — the plan is the strategy.

## Working agreement

- Specs before code. Every new op lands as `specs/operations/<op>.md` first,
  then `src/core/operations.ts` plumbing, then engine impls, then tests.
- Cite by filename — skill specs, op specs, and this queue cross-link by
  relative path.
- When a task is done, mark it `done` with the commit SHA and move on.
  Don't delete completed rows — they are the audit trail until we ship.
- When a task's contract isn't clear, block it and open an Open Questions
  entry instead of inventing the answer.

## Phase 2a — operation specs (in order of referential fanout)

The operations listed below all appear in at least one drafted skill spec
(see `specs/skills/*.md` §Dependencies → CLI ops used). Rank is rough —
pick the next `todo` that's not blocked, unless you have a stronger read.

| # | Op | Primary caller(s) | Blocks | Status |
|---|----|-------------------|--------|--------|
| 1 | `compile_put_page` | compile, recover | every downstream write | done (5040663) |
| 2 | `add_timeline_entry` | compile, recover, maintain | timeline round-trip (recover) | done (2c7ee9a) |
| 3 | `add_link` | compile, recover, maintain | render of `## Inferred Connections`, back-link create | done (b756aa8) |
| 4 | `register_source` | compile, recover | source trail invariant | done (3c1ca1f) |
| 5 | `link_entity_source` | compile, recover | source trail invariant | done (6069ea7) |
| 6 | `update_source_path` | compile | git-rename handling (phase 2) | done (c1e0303) |
| 7 | `set_source_status` | compile | soft-delete cascade | done (102e6a3) |
| 8 | `unlink_entity_source` | compile, maintain | cascade bookkeeping | done (1be8c5e) |
| 9 | `get_entity` | all | dedup + struct_hash read | done (92a5e62) |
| 10 | `get_links` | compile, ask, maintain | cross-entity propagation, back-link check | done (9fe5ec7) |
| 11 | `get_timeline` | compile, ask, maintain | cascade accounting | done (577a4b7) |
| 12 | `list_entities` | ask, maintain, recover (selective) | iteration surface | done (b86203e) |
| 13 | `search` | compile (dedup), ask, maintain | keyword lookup | done (444d7b2) |
| 14 | `query` | compile (dedup), ask, maintain | hybrid lookup | done (fba7c30) |
| 15 | `get_graph` | ask | multi-hop relational answers | done (f3399bd) |
| 16 | `compile_render` | compile, maintain, recover | wiki-file writes | done (43f27d2) |
| 17 | `compile_embed` | compile, maintain, recover | chunks + embeddings | done (e6ea135) |
| 18 | `delete_entity` | compile (cascade), maintain | cascade termination | done (8d28b64) |
| 19 | `delete_link` | maintain | dead-link auto-fix (MAINTAIN §Auto fixes) | done (6b0486e — scope resolved as MAINTAIN-only primitive per option (a)) |

## Open questions inherited from skill specs

Track here so downstream ops don't invent answers.

- **Canonical `struct_hash` serialization** (compile.md §Open questions).
  Blocks `compile_put_page` edge cases around equality; noted in the spec.
- **Transaction boundaries across compile phases** (compile.md §Open questions).
  Blocks the atomicity note in every write op.
- **LLM extraction error handling policy** (compile.md §Open questions).
  Not a blocker for op specs — lives in the COMPILE skill contract.
- **Notability signal source** (compile.md §Open questions).
  Affects `search`/`query` callers; op specs stay neutral.
- **ASK existence-check response shape** (compile.md §Open questions).
  Blocks the ASK internal-call path; needs resolution before `ask.md`'s
  dedup contract is finalised.

## Phase 2b — schema + src plumbing (active)

Detailed plan: [docs/plans/2026-04-21-phase-2b-schema-plumbing.md](docs/plans/2026-04-21-phase-2b-schema-plumbing.md).
Phase 2a closed all 19 op contracts; Phase 2b turns them into code. One
commit per step where possible; the plan's §Execution sequence is the
per-loop ordering.

| # | Task | Step | Status |
|---|------|------|--------|
| 20 | Phase 2b plan | 1 | done (3789c9b) |
| 21 | Rewrite `src/schema.sql` | 2 | done (016a276) |
| 22 | Update `src/core/pglite-schema.ts` | 3 | done (dc9bd3a) |
| 23 | Update `src/core/types.ts` | 4 | done (a6a7306) |
| 24 | Update `src/core/engine.ts` interface | 5 | done (852159e) |
| 25 | Port `pglite-engine.ts` to K2 | 6 | done (340e604) |
| 26 | Port `postgres-engine.ts` to K2 | 7 | todo |
| 27 | Register K2 ops in `operations.ts` | 8 | todo |
| 28 | Reset `migrate.ts` for K2 init | 9 | todo |
| 29 | Audit CLI + MCP op exposure | 10 | todo |
| 30 | Prune legacy commands | 11 | todo |
| 31 | Unit tests per op | 12 | todo |
| 32 | E2E Tier 1 sweep | 13 | todo |

Major decisions resolved in the plan:
- `pages` table renamed to `entities` (schema + all TypeScript types).
- `PageType` replaced by `EntityType` with K2 categories.
- `tags` join table retired; `entities.tags TEXT[]` takes over.
- Links uniqueness changes from `(from, to)` to `(from, to, link_type)`.
- No migration path for existing DBs — destructive reset, no shipped users.

## Phase 3 — test vault

Deferred until Phase 2 ops are plumbed. See docs/plans/ for the vault layout.

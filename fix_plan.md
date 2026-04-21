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
| 5 | `link_entity_source` | compile, recover | source trail invariant | todo |
| 6 | `update_source_path` | compile | git-rename handling (phase 2) | todo |
| 7 | `set_source_status` | compile | soft-delete cascade | todo |
| 8 | `unlink_entity_source` | compile, maintain | cascade bookkeeping | todo |
| 9 | `get_entity` | all | dedup + struct_hash read | todo |
| 10 | `get_links` | compile, ask, maintain | cross-entity propagation, back-link check | todo |
| 11 | `get_timeline` | compile, ask, maintain | cascade accounting | todo |
| 12 | `list_entities` | ask, maintain, recover (selective) | iteration surface | todo |
| 13 | `search` | compile (dedup), ask, maintain | keyword lookup | todo |
| 14 | `query` | compile (dedup), ask, maintain | hybrid lookup | todo |
| 15 | `get_graph` | ask | multi-hop relational answers | todo |
| 16 | `compile_render` | compile, maintain, recover | wiki-file writes | todo |
| 17 | `compile_embed` | compile, maintain, recover | chunks + embeddings | todo |
| 18 | `delete_entity` | compile (cascade), maintain | cascade termination | todo |
| 19 | `delete_link` | maintain | dead-link auto-fix (MAINTAIN §Auto fixes) | todo — op NOT YET listed in COMPILE's deps; spec should resolve whether it lives in MAINTAIN alone |

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

## Phase 2b — schema + src plumbing (later)

Per [docs/plans/2026-04-20-k2-implementation.md](docs/plans/2026-04-20-k2-implementation.md)
§Phase 2. Do NOT start until Phase 2a covers at least the "write" ops
(1–8) — the schema change PR depends on knowing every column we need.

- Add `entities.struct_hash TEXT`
- Add `links.inferred BOOLEAN DEFAULT false`
- Add `sources` table
- Add `entity_sources` junction
- Deprecate `pages.timeline` (stop writing, keep column)
- Remove `pages.source_paths TEXT[]`

## Phase 3 — test vault

Deferred until Phase 2 ops are plumbed. See docs/plans/ for the vault layout.

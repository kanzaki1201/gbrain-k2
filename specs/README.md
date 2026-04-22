# K2 Specs

This directory holds durable contracts between design and implementation.
Specs derive from `K2_DESIGN.md`; they feed `docs/plans/` and the eventual
runnable skills in `skills/<name>/SKILL.md`.

## Layering

```
K2_DESIGN.md        — principles, 5 skills, CRUD-by-layer map
K2_SCHEMA.md        — vault structure, page types, frontmatter
       │
       ▼
specs/              — contracts
  ├── skills/       — per-skill contracts (one per INGEST/COMPILE/ASK/MAINTAIN/RECOVER)
  └── operations/   — per-CLI-op contracts
       │
       ▼
docs/plans/         — phased implementation plans (cite specs by filename)
       │
       ▼
src/**              — implementation
skills/<name>/      — runnable agent skills (derive from specs/skills/<name>.md)
```

## Spec vs SKILL.md

| `specs/skills/<name>.md` | `skills/<name>/SKILL.md` |
|--------------------------|--------------------------|
| Durable contract | Runnable agent instructions |
| Framework-agnostic | Claude Code frontmatter + narrative |
| Declares invariants, CRUD reach, dependencies | Concrete step-by-step, example invocations |
| Rewritten rarely | Can be rewritten per agent framework |
| `gbrain_ops` listed in prose | `gbrain_ops:` frontmatter field |

Specs are the source of truth. If a SKILL.md contradicts its spec, the spec
wins and the SKILL.md is updated.

## Three-layer CRUD model

Every skill and every CLI op has a footprint across three layers:

- **Raw zone** — source files in `sources/**` (clippings, zettel, ingested agent chats)
- **DB layer** — `entities`, `links`, `timeline_entries`, `sources`, `entity_sources`, `content_chunks`
- **Wiki layer** — rendered markdown files (1:1 with `entities`) at category dirs per K2_SCHEMA.md

Specs MUST declare which layers they touch and with what CRUD class. This
is how we enforce the one-writer invariant (COMPILE) and the read-only
invariant (ASK).

## Skill spec template

Every file in `specs/skills/` follows this structure:

```markdown
# <Skill name>

One-sentence purpose.

## Layer reach

| Layer    | Access |
|----------|--------|
| Raw zone | <C/R/U/D/—> |
| DB       | <C/R/U/D/—> |
| Wiki     | <C/R/U/D/—> |

**Writes:** <tables/files this skill mutates, or "none">
**Reads:** <what it consumes>
**Does NOT touch:** <explicit exclusions — enforces separation of concerns>

## Contract

Invariants the skill guarantees to callers (agent frameworks, other skills).
Each invariant should be testable.

## Dependencies

### CLI ops used
List by name with one-line purpose. These become entries in
`specs/operations/`. Example:
- `search` — keyword search over entities
- `get_entity` — fetch entity by slug

### Other skills called
If this skill invokes another (e.g., COMPILE calls ASK for dedup), name it.

## Phases

Step-by-step workflow. Each phase should name:
- Input it consumes
- Output it produces
- Which CLI ops it calls
- What state changes (if any)

## Anti-patterns

What the skill must NOT do. Explicit to prevent drift when SKILL.md is
written later.

## Edge cases

Situations the contract must handle. Each item should say what the skill
does in that case.

## Open questions

Unresolved design questions that block implementation. Track these here
until resolved; then move the decision into the relevant section.
```

## Operation spec template

Every file in `specs/operations/` follows this structure:

```markdown
# <op_name>

One-sentence purpose.

## Signature

```ts
op_name(ctx: OperationContext, input: { ... }): Promise<{ ... }>
```

## CRUD class

**<C/R/U/D/CRUD/…>** on `<table_or_layer>`.

Writes: <tables mutated>
Reads: <tables consumed>

## Preconditions

What must be true before calling. Failing a precondition is a caller bug,
not a runtime error.

## Postconditions

What is true after a successful call. This is the contract.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| ... | ... | ... |

## Idempotency

Is calling twice with same inputs safe? What constitutes "same inputs"?
(e.g., `put_entity` is idempotent when struct_hash matches.)

## Trust boundary

If the op is security-sensitive, note how `OperationContext.remote`
changes behavior.

## Callers

Which skill specs reference this op. Keeps the dependency graph visible.
```

## Conventions

- **Filenames:** lowercase with underscores for ops (`compile_put_page.md`),
  lowercase one-word for skills (`compile.md`, `ask.md`).
- **`gbrain_ops:` frontmatter** lives in `skills/<name>/SKILL.md`, NOT in
  specs. Specs declare dependencies in prose.
- **Cross-references:** link by relative path — `[compile_put_page](../operations/compile_put_page.md)`.
- **No code.** Specs describe behavior, not implementation. Types and
  signatures belong in `src/core/operations.ts`; specs cite them.
- **Open questions stay open.** Don't invent answers. Block them in the
  Open Questions section and resolve in planning.

## Index

Updated as specs land.

### Skills

| Skill | File | Status |
|-------|------|--------|
| INGEST | [ingest.md](skills/ingest.md) | drafted |
| COMPILE | [compile.md](skills/compile.md) | drafted |
| ASK | [ask.md](skills/ask.md) | drafted |
| MAINTAIN | [maintain.md](skills/maintain.md) | drafted |
| RECOVER | [recover.md](skills/recover.md) | drafted |

### Operations

Listed here as each skill spec names its dependencies. No pre-enumeration.

| Op | File | Callers | Status |
|----|------|---------|--------|
| `compile_put_page` | [compile_put_page.md](operations/compile_put_page.md) | compile, recover | drafted |
| `add_timeline_entry` | [add_timeline_entry.md](operations/add_timeline_entry.md) | compile, recover, maintain | drafted |
| `add_link` | [add_link.md](operations/add_link.md) | compile, recover, maintain | drafted |
| `register_source` | [register_source.md](operations/register_source.md) | compile, recover | drafted |
| `link_entity_source` | [link_entity_source.md](operations/link_entity_source.md) | compile, recover | drafted |
| `update_source_path` | [update_source_path.md](operations/update_source_path.md) | compile | drafted |
| `set_source_status` | [set_source_status.md](operations/set_source_status.md) | compile, recover | drafted |
| `unlink_entity_source` | [unlink_entity_source.md](operations/unlink_entity_source.md) | compile, recover, maintain | drafted |
| `get_entity` | [get_entity.md](operations/get_entity.md) | ask, compile, maintain, recover | drafted |
| `get_links` | [get_links.md](operations/get_links.md) | ask, compile, maintain | drafted |
| `get_timeline` | [get_timeline.md](operations/get_timeline.md) | ask, compile, maintain | drafted |
| `list_entities` | [list_entities.md](operations/list_entities.md) | ask, maintain, recover | drafted |
| `search` | [search.md](operations/search.md) | ask, compile, maintain | drafted |
| `query` | [query.md](operations/query.md) | ask, compile, maintain | drafted |
| `get_graph` | [get_graph.md](operations/get_graph.md) | ask | drafted |

# compile_put_page

Structured upsert of one entity row. The sole write path for
`entities` under the K2 design.

## Signature

```ts
compile_put_page(
  ctx: OperationContext,
  input: {
    slug: string;                           // stable identity, unique across all entities
    type: EntityType;                       // one of the K2 category types per K2_SCHEMA.md
    title: string;
    compiled_truth: string;                 // synthesized body, may be empty on pre-render insert
    struct_hash: string;                    // caller-computed per K2_DESIGN.md §Structural Hash
    tags?: string[];                        // indexed tag column
    aliases?: string[];                     // dedup surface
    frontmatter?: Record<string, unknown>;  // per-category YAML remainder
  },
): Promise<{
  slug: string;
  status: 'created' | 'updated' | 'noop';
  prior_struct_hash: string | null;         // the hash stored before this call; null on create
}>
```

`EntityType` is the K2 page-category enum (people, places, projects,
companies, ideas, originals, concepts, how-to, media, tools, meetings,
decisions, household, personal, org, writing). It replaces the legacy
`PageType` enum in `src/core/types.ts`.

## CRUD class

**C / U** on `entities`.

Writes: `entities` (one row).
Reads: `entities` (the existing row for the given slug, to decide
create vs. update vs. noop and to return `prior_struct_hash`).

Does NOT touch: `links`, `timeline_entries`, `sources`,
`entity_sources`, `content_chunks`, wiki files. Embedding belongs to
`compile_embed`; render belongs to `compile_render`; link and
timeline writes belong to `add_link` and `add_timeline_entry`.

## Preconditions

These are caller contract. Failing any is a caller bug, not a
runtime error the caller should catch.

- `slug` is non-empty, URL-safe, and follows K2_SCHEMA.md §Entity
  Identity canonical-slug rules (lowercase, hyphen-separated, no
  leading digit).
- `type` is a member of `EntityType`.
- `title` is non-empty.
- `compiled_truth` is a string (may be `""` — callers during RECOVER's
  two-pass rebuild may insert the row before the body is synthesized).
- `struct_hash` is a non-empty hex string of the length produced by
  the chosen hash function (SHA-256 → 64 chars). The op does not
  recompute it; whatever the caller provides is stored verbatim.
- `aliases` entries, if present, are distinct from `slug` and from one
  another (case-insensitive).
- `tags` entries are lowercase, whitespace-trimmed, distinct.

## Postconditions

After a successful call:

- `entities` has a row keyed by `slug` with:
  - `type`, `title`, `compiled_truth`, `struct_hash`, `tags`,
    `aliases`, `frontmatter` all equal to the values in `input`.
  - `created_at` set on insert, preserved on update.
  - `updated_at` set to "now" on insert or on any field change.
    Unchanged on `noop`.
- No other table has been mutated.
- The returned `prior_struct_hash` is the value stored **before** this
  call landed (useful for COMPILE §Phase 6 struct_hash comparison
  without a second round-trip).
- `status` reflects the outcome:
  - `created` — no row existed for this slug; one was inserted.
  - `updated` — a row existed and at least one field differed; it was
    overwritten.
  - `noop` — a row existed and every field (including
    `struct_hash`) already matched the input; nothing was written.
    `updated_at` is preserved.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `slug_collision_different_type` | A row exists for `slug` with a different `type` (e.g., existing `alice` is `people`; caller passes `type='projects'`). | COMPILE disambiguates and retries with a type-prefixed slug (see `specs/skills/compile.md` §Edge cases — slug collision across types). |
| `invalid_slug` | `slug` violates K2_SCHEMA.md canonical-slug format. | Caller bug; fix the slug derivation. |
| `invalid_type` | `type` is not a member of `EntityType`. | Caller bug; map to a valid K2 category. |
| `struct_hash_missing` | `struct_hash` is empty or obviously malformed. | Caller bug; callers MUST compute struct_hash before calling. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE/RECOVER running locally. |

Runtime DB errors (connection loss, constraint violations other than
the above) surface as `OperationError` with the engine's diagnostic
intact; they are not pre-enumerated here.

## Idempotency

Calling twice with **identical inputs** is safe and cheap. The second
call returns `{ status: 'noop', prior_struct_hash: <the same hash> }`
and makes no DB mutation.

"Identical" is compared field-by-field against the stored row:

- `type`, `title`, `struct_hash` — exact equality.
- `compiled_truth` — exact string equality. Prose can vary between
  LLM runs, so if the caller regenerates the body without changing
  structure, the op still treats it as `updated` even when
  `struct_hash` matches. This is intentional: the struct_hash guards
  re-render/re-embed; the row always reflects the latest synthesized
  prose.
- `tags`, `aliases` — as sets (order-insensitive).
- `frontmatter` — deep-equal per JSON canonicalisation.

**Same struct_hash, different compiled_truth:** `updated`, not
`noop`. The structural state is unchanged (so downstream render/embed
skip still applies when the caller checks `prior_struct_hash`), but
the prose and `updated_at` move forward.

**Same everything except struct_hash:** `updated` and the new hash is
stored. This is the normal "structure changed" path.

## Trust boundary

This op is **local-only**. `ctx.remote === true` (set by
`src/mcp/server.ts`) rejects with `remote_caller_denied`. Only
`src/cli.ts` (COMPILE and RECOVER entry points) may call this op.

Rationale: letting an MCP caller overwrite arbitrary `entities` rows
would bypass the notability gate (COMPILE §Phase 4) and the
source-trail invariant (COMPILE §Contract — every DB write has a
source trail). The legacy `put_page` op stays MCP-exposed for the
import path, but it runs the full parse → embed pipeline and goes
through the trusted content flow, not the raw upsert path.

## Callers

- `specs/skills/compile.md` §Phase 5 — structured writes.
- `specs/skills/recover.md` §Phases 3 and 4 — insert reconstructed
  entity rows during wiki-to-DB rebuild.

## Notes

- **No `delete_page` relationship.** Deletion is `delete_entity`,
  spec'd separately (referenced by COMPILE §Phase 9 and MAINTAIN's
  cascade step).
- **No markdown parsing.** If a caller wants to go "markdown → DB",
  that is the legacy `put_page` path (content → `importFromContent`
  → chunk/embed/upsert-in-one). The compile pipeline is explicitly
  structured-in, so COMPILE owns parsing before calling this op.
- **`created_at` preservation on RECOVER.** RECOVER parses the
  `created:` YAML field from rendered markdown and threads it through
  `frontmatter`. The engine-level `created_at` column is set to the
  insert wall-clock, not the frontmatter date; the canonical
  "created" date for user-facing views is the frontmatter field,
  which round-trips through the YAML block.

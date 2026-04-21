# get_entity

Fetch one entity row by slug. Read-only. Returns the full row or
`null` when no entity exists under the given slug.

## Signature

```ts
get_entity(
  ctx: OperationContext,
  input: {
    slug: string;                            // stable entity identifier
  },
): Promise<Entity | null>

type Entity = {
  slug: string;                              // stable identity
  type: EntityType;                          // K2 category enum
  title: string;
  compiled_truth: string;                    // may be '' for shell rows pre-render
  struct_hash: string | null;                // null only for RECOVER phase-4 shells
  tags: string[];                            // sorted on return for determinism
  aliases: string[];                         // sorted on return
  frontmatter: Record<string, unknown>;
  created_at: string;                        // ISO-8601 UTC
  updated_at: string;                        // ISO-8601 UTC
};
```

`EntityType` is the K2 page-category enum (people, places, projects,
companies, ideas, originals, concepts, how-to, media, tools,
meetings, decisions, household, personal, org, writing). Same
reference as `compile_put_page`.

## CRUD class

**R** on `entities` (one row, or zero).

Reads: `entities` only. Does not join any other table. Does not touch
`links`, `timeline_entries`, `entity_sources`, `content_chunks`,
`sources`, raw files, or wiki files.

Callers that need the timeline, link graph, or source attributions
for the entity use `get_timeline`, `get_links`, and a source-registry
read op respectively. Bundling those into this op would bloat the
return shape for lookups that don't need them (ASK's chunk-first
discipline in particular).

## Preconditions

- `slug` is a non-empty string that follows `K2_SCHEMA.md` §Entity
  Identity canonical-slug rules (lowercase, hyphen-separated, no
  leading digit). Violations return `invalid_slug` rather than a
  silent null — malformed slugs indicate caller bugs, not "just a
  missing entity."

## Postconditions

After a successful call:

- If a row exists at `slug`: the returned `Entity` object holds every
  column verbatim, with `tags` and `aliases` returned sorted (case-
  insensitive, tie-broken by codepoint) for caller determinism.
- If no row exists at `slug`: the call returns `null`. No write, no
  side effect.

The op does not mutate any table. Calling it is free of observable
state change. In particular, `updated_at` is NOT touched on the row.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_slug` | `slug` is empty or violates the canonical-slug format. | Caller bug — normalize or validate upstream before calling. |

Runtime DB errors (connection loss, query cancellation) surface as
`OperationError` with engine diagnostics intact; they are not
pre-enumerated here.

No `entity_not_found` error. A missing entity is a null return, not
an exception.

## Not-found handling

Returning `null` instead of throwing is deliberate. The three canonical
callers all treat absence as the expected case, not the exceptional
one:

- **ASK §Phase 2 lookup** — the slug may come from the user's natural
  language, so "no such entity" is a legitimate answer surface; ASK
  reports the gap and recommends a grep.
- **COMPILE §Phase 4 dedup confirmation** — a search hit may point to
  a slug that was just cascade-deleted concurrently. Null lets the
  caller treat it as "not a dedup candidate" without exception
  plumbing.
- **MAINTAIN §Check iteration** — a `list_entities` result may race
  with a cascade; the follow-up `get_entity` returning null means
  "gone since the list was taken", which MAINTAIN absorbs.

Only `invalid_slug` throws — that covers caller bugs, not missing
state.

## MCP exposure

This op is **MCP-exposed**. It is read-only, returns no raw-zone
content (citations are stored as paths, not file bodies), and is ASK's
primary lookup surface when ASK runs under the MCP server. No
`remote_caller_denied` branch here.

The trust boundary that matters for writes — `ctx.remote === true`
gating destructive changes — does not apply to read ops. The one
caveat is that some `frontmatter` values may carry user-private
fields (e.g., `birthday`, `notes` on a `people` page). Those are
authored by the human in the raw zone, flow through COMPILE, and
reach `get_entity`; exposing them over MCP is the same exposure
model as rendering them into the wiki. If a future filter is needed
(redact certain frontmatter keys when `ctx.remote === true`), it
belongs here — see Open questions.

## Field semantics

- **`compiled_truth`** — the synthesized prose body, may be the
  empty string if the entity row was inserted pre-render (RECOVER
  phase 4 shell row, or a COMPILE phase-5 new entity before
  `compile_render` runs). Callers that need rendered markdown should
  use `compile_render` output, not assume `compiled_truth` is
  renderable as-is.
- **`struct_hash`** — may be null. RECOVER phase 4 inserts an
  entities row before it has enough structural data to compute the
  hash; phase 8 backfills. COMPILE does not produce null hashes
  under normal operation, but a caller that uses this op during
  RECOVER must tolerate the null (typically by skipping
  struct_hash-dependent checks until phase 8 lands).
- **`tags`**, **`aliases`** — returned sorted (case-insensitive,
  codepoint tie-break). Stored order is not guaranteed by the engine
  layer; sorting happens here to give callers byte-deterministic
  equality comparisons without each caller re-sorting.
- **`frontmatter`** — deep-copied JSON structure. The caller owns it;
  mutations in-memory do not feed back to the DB.
- **`created_at` / `updated_at`** — returned as ISO-8601 UTC strings.
  The engine may store them as native TIMESTAMPTZ, but the op
  normalizes on read for cross-engine parity (PGLite vs. Postgres).

No `source_paths` or `entity_sources` count on the returned shape;
those live behind their own ops to keep this one minimal.

## Idempotency

Trivially idempotent — repeat calls with the same `slug` return
byte-equivalent data (subject to concurrent writers). No write, no
side effect. Callers MAY retry freely.

## Trust boundary

Read-only; safe to expose to `ctx.remote === true`. See §MCP exposure
for the caveat on potentially sensitive frontmatter.

## Callers

- **ASK §Phase 2** — direct lookup when the slug is known, or
  follow-up after `search` narrows a candidate. ASK's anti-pattern
  list warns against calling this when a chunk already answers, so
  the callsites are deliberately sparse.
- **COMPILE §Phase 4** — strong-match confirmation during the
  dedup gate. When `search`/`query` returns a high-confidence
  candidate, the caller fetches the row for title, tags, and
  alias comparison.
- **COMPILE §Phase 6** — read the prior `struct_hash` when not
  held in memory from phase 5. The call pattern is read-once,
  compare, forget.
- **MAINTAIN §Check** — per-entity fetch for `struct_hash`,
  `frontmatter`, and `tags` during stale-page detection,
  duplicate-candidate scoring, and filing-violation checks.
- **RECOVER §Selective mode** — diff the currently-stored row
  against the parsed wiki for reconciliation in selective mode.

## Notes

- **No batch form.** Callers that need N entities issue N calls.
  List-then-fetch patterns should lean on `list_entities` to get
  metadata in a single query, then use this op sparingly for the
  entities whose body matters. A `get_entities({ slugs: [...] })`
  batch could land later if profiling justifies, but stays out of
  this primitive.
- **No field selector.** The return shape is fixed. Callers that
  want only `struct_hash` pay for the row; the overhead is trivial
  on a single row and a field-selector API would force every
  caller to branch on the returned shape.
- **No join.** Timeline, links, and source attributions stay in
  their own ops.
- **Sorting is normative.** `tags` and `aliases` MUST be returned
  sorted. Callers may rely on this for deterministic comparison.
- **ISO-8601 timestamps are normative** regardless of engine
  storage format. The op is responsible for the conversion.

## Edge cases

- **Entity exists but `struct_hash` is null.** Return it with the
  null. Callers that need the hash for comparison branch on null.
- **Entity exists but `compiled_truth` is empty.** Return it with
  the empty string. Do not substitute a placeholder.
- **Slug case.** Canonical slugs are lowercase. `slug = 'Alice'`
  errors `invalid_slug` rather than lowercasing; the op does not
  canonicalize input.
- **Concurrent cascade deletion.** A caller that fetched a slug
  from a prior list and calls `get_entity` during a cascade may get
  null. Treat as "already gone"; no retry needed for read ops.
- **Entity with massive `compiled_truth`.** No size limit at the op
  layer. The engine may impose one; if relevant, the op surfaces
  the engine's error via `OperationError`. No truncation.

## Open questions

None specific to this op. Inherited:

- **Frontmatter redaction for MCP callers.** See §MCP exposure. If
  we later decide `remote=true` should filter certain frontmatter
  keys (e.g., birth dates, phone numbers on `people` pages), the
  filter lives here. Not in scope for the current spec; no
  redaction today.
- **Canonical slug format evolution.** The `invalid_slug` rule
  references `K2_SCHEMA.md` §Entity Identity. Any change to the
  slug rules (hyphen style, Unicode support, length limit) affects
  this op's validation. Tracked upstream in `K2_SCHEMA.md`, not here.

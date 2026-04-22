# list_entities

Enumerate entity rows, filtered by structured attributes, paginated.
Returns summary rows — callers that need the full entity chain a
`get_entity` call per summary. Read-only.

## Signature

```ts
list_entities(
  ctx: OperationContext,
  input: {
    type?: EntityType;     // exact-match category filter
    tag?: string;          // exact-match tag filter
    limit?: number;        // max items to return; default = no limit
    offset?: number;       // skip this many items; default = 0
  },
): Promise<{
  items: EntitySummary[];
  total: number;           // items matching filters, pre-pagination
  offset: number;          // echoed for caller convenience
  limit: number | null;    // echoed; null means "no limit"
}>

type EntitySummary = {
  slug: string;                    // stable identifier
  type: EntityType;                // K2 category
  title: string;
  tags: string[];                  // sorted, case-insensitive
  aliases: string[];               // sorted, case-insensitive
  struct_hash: string | null;      // null for RECOVER shell rows only
  created_at: string;              // ISO-8601 UTC
  updated_at: string;              // ISO-8601 UTC
};
```

No `compiled_truth`, no `frontmatter`. Those live on `get_entity`.
The summary carries what callers need to decide whether to fetch the
full row.

## CRUD class

**R** on `entities` (zero or more rows).

Reads: `entities`. No join with any other table — tags and aliases
are stored as array columns on `entities` per `K2_DESIGN.md`
§Logical schema. Does NOT touch any other table; no writes.

## Preconditions

- `type`, if provided, is a member of `EntityType`. Empty string or
  unknown values error `invalid_type`.
- `tag`, if provided, is lowercase, whitespace-trimmed, non-empty.
  Same shape `compile_put_page` enforces on write; empty-string tag
  filter errors `invalid_tag` to disambiguate "filter by empty tag"
  (nonsensical) from "no filter".
- `limit`, if provided, is a non-negative integer. A `limit` of 0
  means "return zero items" (useful for getting `total` without
  payload). A negative `limit` errors `invalid_limit`.
- `offset`, if provided, is a non-negative integer. A negative
  `offset` errors `invalid_offset`.

## Postconditions

- Returns an envelope:
  - `items`: an array of matching `EntitySummary` records, sorted
    by `slug` ascending (codepoint), sliced to `[offset, offset +
    limit)`.
  - `total`: count of rows matching the filters, BEFORE pagination.
    Useful for caller-side progress bars and "more pages" checks.
  - `offset`, `limit`: echoed as received (`limit: null` if omitted).
- No table is mutated. Repeat calls with the same args return
  byte-equivalent envelopes subject to concurrent writers.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_type` | `type` provided and not a member of `EntityType`. | Caller bug — use the enum. |
| `invalid_tag` | `tag` provided and empty, not-lowercase, or contains whitespace. | Caller bug — normalize before calling. |
| `invalid_limit` | `limit` provided and negative (or non-integer). | Caller bug. |
| `invalid_offset` | `offset` provided and negative (or non-integer). | Caller bug. |

Runtime DB errors (connection loss, query cancellation) surface as
`OperationError` with engine diagnostics intact; not pre-enumerated.

No "entity-set empty" error. `items: []` with `total: 0` is a valid,
non-exceptional result.

## Filter composition

All filters are AND-combined:

- `type='people'` alone → every people entity.
- `tag='friend'` alone → every entity carrying the `friend` tag,
  regardless of type.
- `type='people', tag='friend'` → people tagged `friend`.

No disjunction (`type IN (...)`), no negation (`NOT tag`), no
substring or fuzzy match on any field. A caller wanting "people OR
projects" issues two calls and merges; a caller wanting "title
contains 'Bob'" uses `search`.

## Sort order

Returned items are sorted by `slug` ascending (codepoint), which is:

- **Stable under concurrent writes** — slug is an immutable,
  unique identifier (once written, never mutated per `compile_put_page`
  §Idempotency).
- **Cross-engine deterministic** — no collation-dependent tiebreaks;
  codepoint compare is byte-for-byte consistent between PGLite and
  Postgres.
- **Pagination-safe** — a caller that has page 3 and later requests
  page 4 (with the same filters) sees no duplicated or skipped rows
  unless a concurrent write changed the qualifying set. For perfect
  stability under concurrent writes, callers use
  cursor-based iteration (not yet spec'd; see Open questions), but
  slug-sort + offset is good enough for V1.

Within `tags` and `aliases` on each item, the sort rule is the same
as `get_entity`: case-insensitive ascending, codepoint tiebreak.
Callers may rely on both orderings for deterministic comparison.

## Pagination semantics

- `limit: undefined` → no limit. All matching rows are returned.
  Appropriate for small-vault iterate-everything patterns; risky
  for large vaults (MAINTAIN full-vault scan) — see §Performance.
- `limit: N >= 0`, `offset: 0` → first N matches.
- `limit: N`, `offset: M` → matches `[M, M + N)`.
- `offset` beyond `total` → `items: []`, `total` accurate.
- `total` is always the full filter-matched count, independent of
  `limit`/`offset`. Computing it costs one extra query but makes
  client paging trivial.

Pagination is stable under slug-sort. A row inserted between two
paged calls with a slug that lexicographically falls into an
already-returned page is invisible to the next page (the offset
passes it). Callers that need "see every row at least once" under
concurrent writes should rescan from offset 0 after a write quiesce,
or move to cursor-based iteration when it lands.

## MCP exposure

This op is **MCP-exposed**. Read-only, returns only summary fields
(no `compiled_truth`, no `frontmatter`) — the frontmatter-redaction
concern from `get_entity` §MCP exposure does not apply here.

ASK's existence-check path
(`specs/skills/ask.md` §Phase 2 — Existence check) uses this op over
MCP for structured enumeration of candidate entities by type and
tag.

## Field semantics

Same as `get_entity` for shared fields. Differences from `get_entity`:

- **No `compiled_truth`.** Excluded for payload efficiency. Callers
  needing the body fetch via `get_entity` per slug.
- **No `frontmatter`.** Excluded for payload efficiency and because
  frontmatter carries many fields; most MAINTAIN checks don't need
  the full map.
- **`struct_hash` may be null** — same reasoning as `get_entity`.

Same normative sorting on `tags` and `aliases`. Same ISO-8601 UTC
rule on timestamps.

## Performance considerations

Wholesale scans (no filters, no limit) return every entity row in
the vault. For typical K2 brains (thousands of entities) that is
fine. For very large brains, consider:

- **Always pass `limit` when iterating.** MAINTAIN's check phase
  can iterate in pages of 500 with increasing `offset`.
- **Filter first when possible.** `type='people'` cuts the result
  set when only people entities are needed.
- **Don't re-list per iteration.** If the caller is doing a
  single pass, list once and iterate in memory rather than paging.

The op does not enforce these — they're caller guidance. Future
additive options for cursor-based iteration are tracked in
§Open questions.

## Idempotency

Trivially idempotent — read-only, no write.

## Trust boundary

Read-only; safe under `ctx.remote === true`.

## Callers

- **ASK §Phase 2 Existence check** — structured alias/type
  enumeration during COMPILE's dedup request. Called with type
  and/or tag filters plus a small `limit` to bound the candidate
  set.
- **MAINTAIN §Check (all sub-checks)** — canonical iteration
  entry point. MAINTAIN's full-vault scan walks every entity once,
  calling per-check ops like `get_entity`, `get_links`,
  `get_timeline` on each.
- **RECOVER §Selective mode** — when RECOVER rebuilds a subset,
  it uses this op to diff the current DB against parsed wiki
  entity slugs. The comparison drives phase-3 pre-write cleanup
  (`delete_entity` on orphaned DB rows).

No COMPILE caller currently. COMPILE's phase-3 cross-entity
propagation walks `get_links` from extracted candidates outward,
not `list_entities`. If a future COMPILE phase needs whole-vault
iteration (e.g., for duplicate detection across all entities), it
becomes a caller.

## Notes

- **No `name_contains` / `alias_contains` filter.** Substring and
  fuzzy match are `search`'s responsibility. Keeping the filter
  surface exact-match preserves a clean separation between
  structured enumeration and textual retrieval.
- **No `source_path` filter.** Entity-by-source is expressible as
  a junction-side query (e.g., a future `list_entities_for_source`
  ancillary op) but would bloat this primitive. Not in scope.
- **No `struct_hash is null` filter.** Useful for RECOVER
  post-phase-4 backfill accounting but not general enough to
  warrant a parameter. The caller can filter client-side.
- **No `updated_since` filter.** A MAINTAIN-style "what changed
  since last run?" query is tempting but fragile (relies on clock,
  not on a vector clock or a changelog). If that pattern lands, it
  belongs in a dedicated ancillary op — not here.
- **Result is the full summary, not the PK.** A `slugs_only`
  variant is an easy additive optimization later; today payload
  is bounded by summary size which is small.

## Edge cases

- **No entities at all.** Empty vault, fresh brain. `items: []`,
  `total: 0`. Valid.
- **Filter matches no rows.** Same as above for the filtered set.
  `total: 0` distinguishes "filter matched nothing" from "pagination
  ran off the end" (the latter has `total > 0` but `items: []`).
- **`limit: 0`.** Returns zero items plus the accurate `total`.
  Idiomatic for "count with filters applied".
- **Concurrent `compile_put_page` during list.** The engine's
  snapshot isolation determines whether a mid-list write appears.
  No explicit consistency guarantee at the op layer.
- **Concurrent `delete_entity` during list.** A row may disappear
  between pages. Pagination is best-effort under writes.
- **`type` filter matches but no rows have that `type`.**
  `items: []`, `total: 0`. Same as empty filter match.
- **Tags are case-sensitive at filter time.** `tag='friend'` does
  NOT match a row tagged `'Friend'`. Storage is lowercase per
  `compile_put_page` §Preconditions; any stored uppercase tag is a
  write-side bug, not a filter-side quirk.

## Open questions

Specific to this op:

- **Cursor-based iteration for stable-under-writes paging.** Offset
  pagination is simple but weak under concurrent writes. A future
  `cursor?: string` parameter (opaque token encoding the last seen
  slug) would let MAINTAIN iterate over a million-entity vault
  without missing or duplicating under concurrent COMPILE writes.
  Additive; not in scope today.
- **Filter extensibility.** If the common MAINTAIN checks want
  `status_active_sources_count = 0` or `has_inferred_outbound_link
  = true`, those become filter parameters. Adding them is additive;
  the current caller set doesn't need them.
- **Count-only variant.** `limit: 0` works today. A dedicated
  `count_entities(filters)` op is cleaner if count-only becomes a
  hot path, but current callers treat count as a secondary signal.

Inherited:

- **Canonical slug format evolution** — same as every slug-aware
  op.
- **Cross-engine collation differences** — mitigated here by
  codepoint sort, but any future switch to collation-aware sort
  (e.g., Unicode-aware case folding in titles) would need a
  matching change in every sort-normative read op.

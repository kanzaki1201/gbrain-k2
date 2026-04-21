# get_timeline

Read `timeline_entries` rows attached to a seed entity, optionally
bounded by a date range. Read-only.

## Signature

```ts
get_timeline(
  ctx: OperationContext,
  input: {
    entity_slug: string;    // seed entity
    since?: string;         // YYYY-MM-DD, inclusive lower bound
    until?: string;         // YYYY-MM-DD, inclusive upper bound
  },
): Promise<TimelineEntry[]>

type TimelineEntry = {
  entry_id: number;         // surrogate PK from `add_timeline_entry`
  date: string;             // YYYY-MM-DD (no timezone)
  summary: string;          // single-line "what the brain learned"
  detail: string;           // expanded body; '' when omitted on insert
  source_path: string;      // resolved from stored source_id
  created_at: string;       // ISO-8601 UTC, insert wall-clock
};
```

Both `since` and `until` are optional; omitted means no bound on that
side. When both are present, they form an inclusive `[since, until]`
window.

## CRUD class

**R** on `timeline_entries` (zero or more rows). Joins `entities` to
resolve the seed slug → `entity_id`, and `sources` to resolve
`source_id` → `path`.

Reads: `timeline_entries`, `entities`, `sources`.
Does NOT touch any other table and performs no writes.

## Preconditions

- `entity_slug` follows `K2_SCHEMA.md` §Entity Identity canonical-slug
  rules. Violations return `invalid_slug`, the same convention as
  `get_entity` and `get_links`.
- `since` / `until`, when provided, are parseable `YYYY-MM-DD`
  strings. No time-of-day, no timezone suffix. The same shape
  `add_timeline_entry` enforces on write.
- If both are provided, `since <= until` (lexicographic compare is
  safe for `YYYY-MM-DD`). A reversed range errors
  `invalid_date_range` rather than silently returning empty — it is
  a caller bug, not "no results."

## Postconditions

- Returns an array of `TimelineEntry` records sorted by `date`
  ascending, with `created_at` ascending as tiebreaker.
- Missing seed entity produces an empty array, not an error. Same
  rationale as `get_links` §Not-found handling.
- No table is mutated. Repeat calls return byte-equivalent data
  subject to concurrent writers.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_slug` | `entity_slug` violates canonical-slug format. | Caller bug — normalize or validate upstream. |
| `invalid_date` | `since` or `until` is not a parseable `YYYY-MM-DD` string or encodes an impossible day. | Caller bug — normalize before calling. |
| `invalid_date_range` | Both bounds provided and `since > until`. | Caller bug — swap the bounds or omit one. |

Runtime DB errors surface as `OperationError` with engine
diagnostics intact; not pre-enumerated.

No `entity_not_found`. A missing seed → empty result.

## Sort order

Returned entries are sorted:

1. `date` ascending (chronological).
2. `created_at` ascending as tiebreaker for entries sharing a
   `date` value.

Ascending (oldest first) is the API default because:

- ASK's temporal filter language ("on/after DATE") pairs naturally
  with ascending iteration.
- COMPILE's re-synthesis walks history forward to build a narrative
  for `compiled_truth`.
- Callers that render (notably `compile_render`, which emits the
  `## Timeline` section newest-first under the K2 format) reverse
  the array themselves. The API serves machine callers; the render
  serves humans.

Callers MAY rely on this ordering for deterministic comparison
across engines.

## MCP exposure

This op is **MCP-exposed**. Read-only, no raw-zone content returned
(citations are stored as paths, not file bodies). ASK's temporal
retrieval (`specs/skills/ask.md` §Phase 2 — Temporal) runs through
this op over MCP.

As with `get_links`, the frontmatter-redaction concern flagged in
`get_entity` §MCP exposure does not apply — this op returns
summaries and source paths, not frontmatter fields.

## Field semantics

- **`entry_id`** — the surrogate PK returned by
  `add_timeline_entry`. Exposed because a future cascade-audit or
  rendering pipeline may want to cite a specific row; also lets
  callers dedupe across repeated fetches without comparing every
  field.
- **`date`** — stored as DATE in the engine; returned as
  `YYYY-MM-DD`. Consistent with the input format.
- **`summary`** — single-line prose as inserted. Never modified
  post-write per the append-only invariant
  (`specs/operations/add_timeline_entry.md` §Idempotency).
- **`detail`** — multi-line body, empty string when omitted at
  insert.
- **`source_path`** — resolved via `sources.id = source_id`. Works
  for soft-deleted sources (`status='deleted'`): the path is still
  present, even though the raw file is gone. Renders correctly in
  the wiki citation.
- **`created_at`** — insert wall-clock. ISO-8601 UTC, normalized at
  the op layer.

No `source_id` or `entity_id` in the return — callers work with slugs
and paths, the same convention as the write-side specs.

## Date range filter semantics

Both bounds are **inclusive**:

- `since='2026-10-10'` → entries with `date >= '2026-10-10'`.
- `until='2026-12-31'` → entries with `date <= '2026-12-31'`.
- Both set → `since <= date <= until`.
- Neither set → all entries attached to the seed.

The `date` column is the "date the brain learned the fact" (per K2
design), not the event date in the summary. ASK queries like "what
did I learn about Alice in 2026?" map cleanly; queries like "what
happened to Alice in 2026?" are event-date queries and require
summary parsing, which is outside this op's scope — see Open
questions.

## Not-found handling

Consistent with `get_links`: missing seed entity returns `[]` rather
than erroring. Same rationale — collection-shaped return, race
absorption under `list_entities` → `get_timeline` iteration, and the
expected caller pattern is "nothing to do" on absence.

Only `invalid_slug`, `invalid_date`, and `invalid_date_range` error;
the first guards malformed slugs, the last two guard malformed date
inputs.

## Pagination

This op does NOT paginate. Two reasons:

- **Natural date windowing.** Callers with a large timeline span
  (ASK on a long-lived people entity) use `since`/`until` as the
  pagination surface. "Last 30 days" → `since=today-30, until=today`.
- **Wholesale-read callers don't want pages.** COMPILE's phase-5
  re-synthesis reads the full timeline to shape `compiled_truth`;
  MAINTAIN's cascade bookkeeping reads the full timeline to decide
  whether a new drop-link entry would duplicate one already appended.
  Forcing pagination on them would require in-caller reassembly.

The open risk: an entity whose timeline grows to thousands of
entries will return a large array on unbounded calls. Under the K2
design, that case is rare (most `people`/`projects` entities
accumulate O(10s)–O(100s) of entries over years), but it isn't
impossible. See §Open questions.

## Idempotency

Trivially idempotent — read-only, no write. Repeat calls return
byte-equivalent data subject to concurrent writers.

## Trust boundary

Read-only; safe under `ctx.remote === true`. See §MCP exposure.

## Callers

- **ASK §Phase 2 Temporal** — "when did X?", "what happened
  on/after DATE?". Calls with `entity_slug` plus the date range
  pulled from the user's question.
- **COMPILE §Phase 5 re-synthesis** — read the full timeline for
  an entity as input to the LLM call that produces the new
  `compiled_truth`. No date bounds; the op returns every entry.
- **COMPILE §Phase 9 cascade accounting** — before appending a
  drop-link timeline entry, look at existing entries to confirm no
  prior identical drop-link was already recorded in this run
  (duplicate avoidance). Typically reads the latest few entries;
  the op doesn't help narrow that — use `since` with the current
  run's start timestamp if needed.
- **MAINTAIN §Check cascade bookkeeping** — `maintain.md` §Check
  names this op under the cascade-bookkeeping read surface. Purpose
  is usually audit, rarely hot-path.

No RECOVER caller. RECOVER writes timeline entries via
`add_timeline_entry` rather than reading existing ones; any reads it
needs go through `get_entity` plus internal parser state.

## Notes

- **No filter by `source_path`.** Callers who want "entries citing
  source X" iterate this op's output and filter. Adding a
  `source_path` filter here is a feasible future additive change;
  the current caller set doesn't need it, so it stays out.
- **No filter by substring of `summary`.** Freeform prose filtering
  is the job of `search` or `query`, both of which retrieve against
  the full-text index across entities. Adding substring search here
  would duplicate and fragment the search surface.
- **No batch form.** One entity per call. Bulk callers (MAINTAIN's
  full-vault audit) iterate `list_entities` → `get_timeline`.
- **Append-only is a write-side invariant.** This op doesn't
  enforce it — `add_timeline_entry` does. But callers can rely on
  it: once returned, an entry's fields will not change in later
  calls (except `source_path` when `update_source_path` moves the
  underlying source row, which mutates path globally).
- **Source-rename visibility.** If `update_source_path` renames the
  citation path between two `get_timeline` calls, the second call
  returns the new path for the same `entry_id`. That is the right
  behavior — timeline entries reference the source by id, not by
  path snapshot.
- **Sorting and ISO-8601 normalization are normative.** Same rule as
  the other read ops.

## Edge cases

- **Seed with zero timeline entries.** Returns `[]`. Common for
  entities that were just created in phase 5 with no facts yet
  (though per §Phase 5 ordering, a fresh entity typically gets at
  least one timeline entry in the same run).
- **Soft-deleted source underneath an entry.** The entry is
  returned; `source_path` is the path as stored in the `sources`
  row, regardless of its `status`. Render layer may want to style
  deleted-source citations differently, but that's a render
  concern, not this op's.
- **`since=until` (single-day window).** Returns entries whose
  `date` equals that day. Valid. Used by ASK for "what happened on
  2026-10-10?" queries.
- **Very large date window.** No implicit limit. See §Pagination.
- **Concurrent `add_timeline_entry` during this call.** The engine's
  snapshot isolation determines whether the new entry appears in
  the result. No cross-call consistency guarantee; callers that
  care resolve via explicit transaction boundaries at the skill
  layer (itself an Open question for COMPILE).

## Open questions

- **Timeline-size blowup.** An entity with thousands of entries
  will return a large array on an unbounded call. If this becomes a
  real operational concern, the fix is to add a `limit?: number`
  parameter (cheap, additive) and document that exceeding it
  truncates from the oldest side. Not in scope today; no caller has
  hit the ceiling.
- **Event-date vs. learned-date queries.** ASK users may
  legitimately ask "what happened on 2026-10-10?" meaning the event
  date inside the summary, not the learned-date. The current op
  only filters on learned-date. Resolving this needs either (a)
  structured event-date storage on the timeline row (schema
  change), (b) downstream parser in ASK, or (c) acknowledging the
  limitation in the UX. No decision yet.

Inherited:

- **Canonical slug format evolution** — same as `get_entity` and
  `get_links`.
- **Transaction boundaries for concurrent append + read** —
  resolved by the engine's isolation level, but the skill-layer
  contract in `compile.md` is still open.

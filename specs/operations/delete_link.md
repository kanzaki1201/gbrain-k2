# delete_link

Remove one row from `links` identified by its surrogate primary
key. Supports MAINTAIN's dead-link auto-fix when link endpoints
may have drifted out of sync with the entity registry.

## Scope resolution

Before writing the signature: this spec commits to option (a) from
`specs/skills/maintain.md` §Open questions — `delete_link` as a
first-class primitive alongside `add_link`. Rejected alternatives:

- **(b) Batch `reconcile_links(entity, edges[])`.** Cleaner at
  scale, but MAINTAIN's auto-fix removes individual dead links
  found via scan, not full edge sets. Bulk-rewrite semantics don't
  match the caller's shape.
- **(c) Let `delete_entity` cascade handle it.** Only works when
  the dead-link cause is a MISSING target entity that FK cascade
  would have pruned. MAINTAIN's dead-link check specifically
  surfaces rows where the target `entity_id` doesn't resolve —
  there is no entity to delete. Option (c) leaves the orphan row
  stranded.

Option (a) is symmetric with `add_link` in the op set and
minimizes caller orchestration for the auto-fix path.

## Signature

```ts
delete_link(
  ctx: OperationContext,
  input: {
    link_id: number;          // surrogate primary key of the `links` row
  },
): Promise<{
  link_id: number;            // echoed
  action: 'deleted' | 'noop';
  prior: {
    from_slug: string | null; // null under extreme drift (from-entity missing)
    to_slug: string | null;   // null when the dead-link target didn't resolve
    link_type: string;
    inferred: boolean;
    context: string;
  } | null;                   // null when action = 'noop'
}>
```

`link_id` is the input because the dead-link case — the op's
primary reason to exist — has an unresolvable `to_entity_id` by
definition. Keying on the logical triple `(from_slug, to_slug,
link_type)` would fail for exactly the rows this op needs to
delete. Callers obtain `link_id` from:

- A future `scan_dead_links` read op (flagged in `get_links.md`
  §Open questions) that enumerates rows whose endpoint joins
  fail.
- A future `get_links` variant that exposes `link_id` additively
  (current spec does not; noted in `get_links.md` §Open questions).

## CRUD class

**D** on `links` (one row).

Writes: `DELETE FROM links WHERE id = ?` — exactly one row, or
zero.
Reads: `links` (to capture the prior snapshot for the return
payload), `entities` twice (to resolve endpoint slugs for the
`prior` field; tolerant of unresolvable sides).

Does NOT touch: `entities`, `timeline_entries`, `entity_sources`,
`content_chunks`, `sources`, wiki files. Neighbour entities' state
(struct_hash, render) is NOT updated here — caller orchestrates
that via `compile_render` + `compile_embed` on the affected
from-entity.

## Preconditions

- `link_id` is a positive integer. Non-positive or non-integer
  inputs error `invalid_link_id`.

There is no slug-validation precondition. The op does not require
either endpoint's entity to exist — that is precisely what
distinguishes it from a hypothetical "delete by logical triple"
variant.

## Postconditions

On success:

- If a row existed at `link_id`: it is removed.
  `action: 'deleted'`; `prior` carries the row's snapshot as of
  before deletion (with `from_slug` / `to_slug` resolved
  best-effort, null when an endpoint doesn't resolve).
- If no row existed: nothing is written. `action: 'noop'`;
  `prior: null`.
- No other table is mutated. `entities.struct_hash` /
  `entities.updated_at` DO NOT change. Timeline entries are NOT
  appended — any drop-link record is the caller's responsibility
  (see §Caller orchestration).

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_link_id` | `link_id` is non-positive or non-integer. | Caller bug — provide a valid PK. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through MAINTAIN (or future callers) running locally. |

Runtime DB errors surface as `OperationError` with engine
diagnostics intact; not pre-enumerated.

No `link_not_found` error. Missing rows → `noop`, supporting
retry semantics after partial failure.

## Idempotency

Idempotent on absence. Calling twice:

- First call: `action: 'deleted'` (if row existed) or `'noop'`
  (if not).
- Second call: always `'noop'`, `prior: null`.

Safe for retry after crash or partial orchestration failure.
MAINTAIN's fix phase may re-issue deletions without probing.

## Trust boundary

This op is **local-only**. `ctx.remote === true` rejects with
`remote_caller_denied`. Only `src/cli.ts` — as the entry point
for MAINTAIN (and potentially RECOVER's selective-mode cleanup)
— may call this op.

Rationale: an MCP caller with link-delete access could quietly
strip inferred connections or back-links, silently degrading the
graph without an audit trail. MAINTAIN's auto-fix scope
(`specs/skills/maintain.md` §Auto-fix scope — *closed, limited
to re-render, missing back-links, dead links*) is the policy
boundary; local-only is the enforcement.

## Caller orchestration

This op is the primitive. Link deletion by itself does NOT:

- Append a drop-link `timeline_entries` row on the from-entity
  (or any neighbour).
- Recompute struct_hash on the from-entity.
- Re-render or re-embed the from-entity.

Those live in MAINTAIN's auto-fix loop:

1. `scan_dead_links` (future op) enumerates dead-link rows,
   returning each row's `link_id` plus whatever metadata the
   report requires.
2. For each dead link, decide whether the fix is appropriate
   (dead-link removal is a closed auto-fix per MAINTAIN §Auto-fix
   scope — no human approval needed).
3. Call `delete_link(link_id)`.
4. Optionally: `add_timeline_entry` on the from-entity recording
   the removal (MAINTAIN §Auto-fix names this when the deletion
   coincides with an entity cascade — for pure dead-link removal
   the drop-link entry is optional but recommended for audit).
5. Re-render + re-embed the from-entity via `compile_render` +
   `compile_embed` to pick up the struct_hash change.

Step 3 is atomic on its own row. Steps 4–5 are orchestration.

## `prior` field semantics

The return's `prior` object captures the state of the deleted
row BEFORE the delete. Fields:

- `from_slug`, `to_slug` — resolved via `entities` lookup. Either
  may be `null` if the stored endpoint id does not resolve to a
  live entity (the dead-link case is typically `to_slug: null`;
  an extremely drifted row could have both sides null).
- `link_type`, `inferred`, `context` — copied from the row
  verbatim. Always present (non-null strings, booleans).

The snapshot is captured in the same read query that drives the
delete, avoiding a race between resolution and deletion. Callers
that log the fix trail use this payload rather than issuing a
second read.

## Deliberate limitations

- **Only one input mode.** This op does NOT accept the logical
  triple `(from_slug, to_slug, link_type)`. Callers with resolvable
  endpoints (rare in delete-link territory) still go through
  `scan_dead_links` or `get_links` (when it exposes `link_id`) to
  obtain the surrogate PK. Consistent single-key access pattern
  avoids two code paths.
- **No bulk form.** One link per call. Batching multiple
  deletions would require transaction-shape decisions (all-or-
  nothing vs. best-effort) that the current caller set doesn't
  need.
- **No neighbour side effects.** See §Caller orchestration.
- **No cascade.** Deleting a link has no FK-cascade target — the
  link has no dependent children in the schema. This is a
  terminal-leaf delete.

## Callers

- **MAINTAIN §Auto-fix — dead-link removal.** The canonical
  caller. Invoked per dead link found in the check phase.
  `maintain.md` §Auto-fix scope — *remove dead links* — gates
  this as an auto-fix (no human approval required).

No COMPILE caller. COMPILE's phase 9 cascade does not delete
links directly; FK cascade on `delete_entity` handles edge
removal in that flow.

No RECOVER caller directly. RECOVER's phase 3 wipes entities
with cascade, not individual links.

No ASK caller (read-only skill).

## Notes

- **Symmetric with `add_link`.** Both ops target individual
  `links` rows. `add_link` uses the logical key for upsert
  (which requires resolvable endpoints by design); `delete_link`
  uses `link_id` because its primary use case can't rely on
  endpoint resolution.
- **The "dead link" name.** In the K2 design, "dead link" means
  a `links` row whose `to_entity_id` doesn't resolve to an
  `entities` row (or, rarely, whose `from_entity_id` doesn't).
  Detection is `scan_dead_links` territory; removal is this op.
- **Back-link removal is NOT this op's concern.** If MAINTAIN
  creates an unwanted back-link via `add_link`, reversal is
  "delete the back-link row" — which currently has no direct
  caller. If it becomes one, it routes through this op by
  link_id. For now, `add_link`'s idempotent upsert means
  accidental back-links don't duplicate.
- **Cascade-induced drop-link records.** When `delete_link` is
  invoked as part of a larger cascade (hypothetical — current
  cascade runs through `delete_entity`), the CALLER appends a
  drop-link timeline entry before or after the link delete.
  This op does not emit the entry itself.

## Edge cases

- **Link row exists, both endpoints resolve.** Returns
  `'deleted'`, `prior` with both slugs populated.
- **Link row exists, `to_slug` doesn't resolve (canonical dead
  link).** Returns `'deleted'`, `prior.to_slug = null`,
  `prior.from_slug` populated.
- **Link row exists, `from_slug` doesn't resolve.** Extreme
  drift — typically indicates prior FK-cascade failure. Returns
  `'deleted'`, `prior.from_slug = null`. Rare; flagged by
  MAINTAIN as schema drift.
- **Both endpoints unresolvable.** Even rarer drift case. Op
  still succeeds; `prior.from_slug = null`, `prior.to_slug =
  null`, `link_type` and `context` still populated.
- **`link_id` doesn't exist.** Returns `'noop'`, `prior: null`.
  No error. Consistent with idempotent retry.
- **Concurrent `delete_entity` removed the row via FK cascade.**
  Whichever commits first wins; the other returns `'noop'`.
  Row-level locking at the engine layer prevents partial state.
- **`link_id` belongs to a healthy link (both endpoints
  resolve).** The op still deletes — there's no precondition
  requiring the link be dead. Callers that want safety
  (e.g., "only delete if the link is actually dead") enforce
  that check upstream, before invoking this op.

## Performance considerations

- Single-row delete keyed on primary index — fast.
- Fetching the prior snapshot adds one SELECT joined against
  `entities` twice (left joins to tolerate unresolvable
  endpoints). Adds negligible cost.
- When MAINTAIN's fix loop removes many dead links in sequence,
  total cost scales linearly. Typical dead-link counts on a
  consistent DB are zero; drift-recovery runs might see
  hundreds but not thousands.

## Open questions

- **Companion `scan_dead_links` read op.** Referenced by
  `get_links.md` §Open questions. Needed before this op's
  primary caller (MAINTAIN dead-link fix) can actually run.
  Spec deferred; likely lives as a sibling read op that returns
  `{ link_id, from_slug | null, to_slug | null, link_type,
  inferred, context }[]` for drift-detection purposes. The
  shape mirrors this op's `prior` return.
- **Expose `link_id` from `get_links`.** For callers that want
  to delete a link by lookup-then-delete (rare; mostly a
  debugging convenience), `get_links` would need to surface
  `link_id`. Additive change flagged in
  `get_links.md` §Open questions.
- **Drop-link timeline policy for dead-link removal.** MAINTAIN
  §Auto-fix mentions `add_timeline_entry` for cascade-induced
  drop-links but leaves pure dead-link-removal's timeline policy
  unspec'd. Likely: always append for audit. Resolve in
  MAINTAIN's skill spec, not here.
- **Bulk delete variant.** If scan-driven cleanup finds many
  dead links per run, a `delete_links({ link_ids: [...] })`
  batch op would amortize round-trip cost. Additive; not in
  scope today.

Inherited:

- **Transaction boundaries across MAINTAIN's auto-fix phase** —
  whether dead-link removal + timeline append + re-render
  happens atomically, or best-effort per entity, is the same
  open question COMPILE carries.

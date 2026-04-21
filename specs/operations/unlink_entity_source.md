# unlink_entity_source

Remove one row from the `entity_sources` junction, severing an
entity's attribution to one source. Companion to
`link_entity_source`.

## Signature

```ts
unlink_entity_source(
  ctx: OperationContext,
  input: {
    entity_slug: string;   // entity whose attribution is being removed
    source_path: string;   // source to detach
  },
): Promise<{
  entity_slug: string;                      // echoed
  source_path: string;                      // echoed
  action: 'deleted' | 'noop';               // whether a row was actually removed
}>
```

As with `link_entity_source`, callers work in slugs and paths; the
op resolves both to ids internally. The junction is keyed on
`(entity_id, source_id)`, and that pair is what the op targets.

## CRUD class

**D** on `entity_sources` (idempotent — noop when the row is absent).

Writes: `entity_sources` — zero or one row deleted.
Reads: `entities` (slug → id), `sources` (path → id), `entity_sources`
(to detect the row's presence and decide `deleted` vs `noop`).

Does NOT touch:
- `entities`, `links`, `timeline_entries`, `content_chunks`, `sources`,
  raw-zone files, wiki files.
- `entities.struct_hash` — although `entity_sources` is part of the
  struct_hash inputs, the caller batches `compile_put_page` for the
  affected entity after the phase-9 cascade write set lands.
- Any downstream cascade (entity delete when count hits zero,
  timeline append for the drop-link event). Those are phase-9
  orchestration, not this op's business.

## Preconditions

- `entity_slug` resolves to an existing row in `entities`. If the
  entity has already been cascade-deleted by an earlier step in the
  same phase, the FK cascade on `entity_sources.entity_id` has
  already pruned every junction row for that entity — this op would
  see nothing to do. Callers that want that to be a noop instead of
  an error SHOULD check entity existence before iterating, or
  tolerate `entity_not_found`.
- `source_path` resolves to an existing row in `sources`, under any
  `status`. Soft-deleted sources are the common case — phase 9
  typically calls this op right after `set_source_status('deleted')`.
- Shape rules on paths are inherited from `register_source`:
  non-empty, vault-relative, POSIX slashes, under `human/**` or
  `sources/**`, no `..`, no trailing slash.

## Postconditions

After a successful call:

- If a junction row existed at `(entity_id, source_id)`: it is
  removed. `action = 'deleted'`.
- If no junction row existed: nothing is written. `action = 'noop'`.
- No other row in `entity_sources` is touched.
- No row in any other table is touched. In particular, the
  entity's `struct_hash` is NOT recomputed here; the caller lands
  `compile_put_page` after batching phase-9 writes so the hash
  reflects the final `entity_sources` set.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `entity_not_found` | `entity_slug` has no row in `entities`. | Caller bug — either the slug is wrong or a prior cascade already removed the entity (in which case FK cascade already pruned this row; skip instead of calling). |
| `source_not_found` | `source_path` has no row in `sources` under any status. | Caller bug — register or fix the path. A truly gone source (which shouldn't exist: deletion is soft) is a symptom of schema drift. |
| `invalid_path` | `source_path` is empty, absolute, uses backslashes, contains `..`, or ends with `/`. | Caller bug — normalize before calling. |
| `path_outside_raw_zone` | `source_path` does not start with `human/` or `sources/`. | Caller bug — only raw-zone paths are valid sources. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / RECOVER running locally. |

Runtime DB errors (connection loss, FK violations other than the
above, transaction aborts) surface as `OperationError` with engine
diagnostics intact; they are not pre-enumerated here.

## Idempotency

Idempotent on absence. Calling twice with the same `(entity_slug,
source_path)`:

- First call may be `'deleted'` or `'noop'` depending on whether the
  junction row exists.
- Second call is always `'noop'`.

This mirrors `Set.delete()` semantics and matches how the COMPILE
phase-9 cascade loop wants to iterate: for each source deleted this
run, for each junction row keyed to that source, call this op. Any
row that was already pruned (e.g., because the entity was cascaded
away via FK before this call ran) absorbs as a noop.

`prior` state beyond the binary `deleted | noop` is not returned. If
a caller wants the `created_at` of the row that was removed — say,
for audit — they fetch it via a read-side junction op before calling
this one. Keeping the return shape minimal preserves the set-membership
model (the junction either held the pair or it didn't).

## Trust boundary

This op is **local-only**. `ctx.remote === true` (set by
`src/mcp/server.ts`) rejects with `remote_caller_denied`. Only
`src/cli.ts` — as the entry point for COMPILE, RECOVER, and MAINTAIN
— may call this op.

Rationale: the `entity_sources` junction drives two load-bearing
invariants — the source-trail invariant (`compile.md` §Contract) and
the cascade invariant (phase 9's "entities with zero sources are
auto-deleted"). An MCP caller with junction-delete access could
force cascade deletions of arbitrary entities by stripping their
attributions. The op gates against that by refusing remote callers.

## Cascade interaction

Deleting a junction row does NOT automatically delete the entity or
emit a drop-link timeline entry, even if the entity's remaining
`entity_sources` count drops to zero. Those side effects belong to
COMPILE phase 9's explicit orchestration:

1. `set_source_status(path, 'deleted')` — flag the source.
2. For each junction row keyed to the now-deleted source: call
   `unlink_entity_source` (this op).
3. For each entity whose `entity_sources` count dropped to zero:
   call `delete_entity` (which itself cascades FK deletes and emits
   cascade bookkeeping).
4. For each surviving entity that lost a link to the deleted one
   via that deletion: append a drop-link `timeline_entries` row via
   `add_timeline_entry`, naming the deletion in the summary.

Keeping the cascade entirely in the caller layer is the same design
call made in `set_source_status.md` §Status-flip does NOT drive the
cascade. A future rethink that pushes cascade into the op layer
would need to revisit both specs in lockstep.

## FK-cascade interaction with `delete_entity`

When `delete_entity` is called on an entity, the `ON DELETE CASCADE`
on `entity_sources.entity_id` automatically prunes every junction
row for that entity — no direct `unlink_entity_source` call needed.
That's why `specs/skills/maintain.md` §CLI ops used describes this
op as "usually called transitively via `delete_entity`."

Direct callers of this op are specifically the cascade inversion
path: "source was deleted, now each entity that cited it loses one
source from its trail." FK cascade doesn't fire in that direction
because the source row is only soft-deleted (`status='deleted'`);
the PK still exists, and dependent rows stay. Hence the explicit
unlink pass.

## Callers

- `specs/skills/compile.md` §Phase 9 — for each soft-deleted source,
  iterate `entity_sources` rows tied to its `source_id` and unlink
  them. This is the canonical cascade driver.
- `specs/skills/recover.md` §Phase 3 — pre-write cleanup. When
  orphan source rows are being removed, their junction rows are
  unlinked via this op before the source itself is soft-deleted via
  `set_source_status`.
- `specs/skills/maintain.md` §Auto-fix — listed under "prune
  `entity_sources` during the same cascade when needed directly
  (usually called transitively via `delete_entity`)". Direct
  invocation is rare; most of MAINTAIN's attribution pruning rides
  on FK cascade when it calls `delete_entity` on source orphans.

## Notes

- **No bulk form.** One call per junction row. Iteration is the
  caller's responsibility. A `unlink_all_for_source(source_path)`
  convenience could be added later if profiling justifies it; it
  would be a named ancillary op, not a signature extension.
- **No side-effects beyond the one row.** No timeline entries, no
  struct_hash recompute, no cascade reactions. The spec is
  deliberately thin.
- **Return is symmetric with `link_entity_source`**: `action` uses
  the past-tense verb describing what this op *did*
  (`created`/`deleted`) alongside `noop`. Readers of both specs see
  the same shape and code against it uniformly.

## Edge cases

- **Entity was cascade-deleted earlier in the same phase.** FK
  cascade on `entity_sources.entity_id` already dropped every
  junction row for that entity. A later call here with that
  `entity_slug` errors `entity_not_found`. The canonical callers
  avoid this by iterating over `entity_sources` rows directly (via
  some read-side op) rather than by entity list; the rows
  themselves are gone, so iteration skips them.
- **Source was registered but never attributed.** An
  `entity_sources` row does not exist. Every call with that
  `source_path` noops. Fine.
- **Entity was cited by the same source twice.** Impossible by
  construction — `link_entity_source` §Idempotency ensures at most
  one junction row per `(entity_id, source_id)` pair. One unlink
  removes the one row.
- **Concurrent unlinks for the same pair.** The op either sees the
  row (deletes it) or doesn't (noop). Under row-level locking,
  consistency holds without this op implementing its own retry. If
  the engine doesn't provide the right lock granularity, that's an
  engine-layer fix, not a spec change.

## Open questions

Inherited from upstream:

- **Transaction boundaries across COMPILE phase 9**
  (`specs/skills/compile.md` §Open questions). Determines whether
  the cascade orchestration (soft-delete source → unlink junctions
  → possibly delete entities → append timeline entries) runs under
  one transaction or chains across several. Affects crash-recovery,
  not this op's per-call contract.
- **Path canonicalization on case-insensitive filesystems**
  (`specs/operations/register_source.md` §Open questions). Inherited
  as for every source-touching op.

None specific to this op.

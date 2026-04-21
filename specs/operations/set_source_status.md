# set_source_status

Flip one row's `sources.status` between `'active'` and `'deleted'`.
The sole write path for source lifecycle transitions; creation is
`register_source`, path-rename is `update_source_path`.

## Signature

```ts
set_source_status(
  ctx: OperationContext,
  input: {
    path: string;                       // vault-relative path, must exist in `sources`
    new_status: 'active' | 'deleted';   // desired status after the call
  },
): Promise<{
  source_id: number;                              // unchanged; echoed for convenience
  path: string;                                   // echoed
  prior_status: 'active' | 'deleted';             // what was stored before the call
  new_status: 'active' | 'deleted';               // what is stored after the call
  action: 'updated' | 'noop';                     // whether a write landed
}>
```

`path` is the caller-facing identifier; the op resolves it to
`source_id` internally. The return code uses `action` (not `status`)
to avoid colliding with the column name.

## CRUD class

**U** on `sources` (one row, single column — `status`).

Writes: `sources.status` for the one row matching `path`, when
`new_status !== prior_status`. Nothing is written on `noop`.
Reads: `sources` (the existing row at `path`, to resolve `source_id`
and compare `prior_status`).

Does NOT touch:
- `entity_sources` — a source soft-delete does NOT automatically
  prune junction rows. The caller (COMPILE phase 2 or 9, RECOVER
  phase 3) follows up with `unlink_entity_source` calls to drive the
  cascade count down. This split keeps the primitive a flat column
  update and lets different callers decide what junction-level
  cleanup they want.
- `entities`, `links`, `timeline_entries`, `content_chunks`, raw
  zone files, wiki files.
- `entities.struct_hash` — the hash's inputs (timeline entries,
  links, tags, entity_sources, frontmatter) are insensitive to a
  source's status column; a soft-delete does not trigger re-render
  or re-embed on its own.

## Preconditions

- `path` is non-empty, vault-relative, POSIX forward slashes, no
  `..` segments, no trailing slash, under `human/**` or
  `sources/**`. Same shape rules as `register_source`.
- `path` exists in `sources` (under either status).
- `new_status` is either `'active'` or `'deleted'`. No other values.

## Postconditions

After a successful call:

- If `new_status === prior_status`: nothing is written. The row is
  unchanged in every column. `action = 'noop'`.
- Otherwise: exactly one row in `sources` has its `status` column
  overwritten with `new_status`. Every other column (`path`,
  `content_hash`, `created_at`, and any future metadata) is
  unchanged. `action = 'updated'`.
- No other row in `sources` is touched. No row in any other table
  is touched (see §CRUD class for the full list).

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `source_not_found` | `path` has no matching row in `sources`. | Caller bug — use `register_source` to create, then retry if you really meant to flip status on the newly created row (unusual — a freshly registered row is already `active`). |
| `invalid_path` | `path` is empty, absolute, uses backslashes, contains `..`, or ends with `/`. | Caller bug — normalize before calling. |
| `path_outside_raw_zone` | `path` does not start with `human/` or `sources/`. | Caller bug — only raw-zone paths are valid sources. |
| `invalid_status` | `new_status` is a string other than `'active'` or `'deleted'`. | Caller bug — use the enum. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / RECOVER running locally. |

Runtime DB errors (connection loss, transaction aborts, unique-index
violations unrelated to the above) surface as `OperationError` with
engine diagnostics intact; they are not pre-enumerated here.

## Idempotency

Idempotent on `new_status`. Calling twice with the same `(path,
new_status)`:

- First call may be `'updated'` or `'noop'` depending on the stored
  `status`.
- Second call is always `'noop'`. No write.

This matches the semantics callers want. COMPILE phase 2 retrying
after partial failure can re-issue the delete without worrying that
the source is already marked. RECOVER phase 3's orphan pruning can
pass each orphan through unconditionally.

The `prior_status` / `new_status` pair in the return tells the caller
whether the transition actually happened — useful for phase 9's
"did we soft-delete anything this run?" accounting and for logging
that distinguishes "noop because already in state" from "updated".

## Trust boundary

This op is **local-only**. `ctx.remote === true` (set by
`src/mcp/server.ts`) rejects with `remote_caller_denied`. Only
`src/cli.ts` — as the entry point for COMPILE and RECOVER — may call
this op.

Rationale: an MCP caller with status-flip access could resurrect
soft-deleted sources to revive cascaded-away entities (if a
downstream reactivation path existed), or mass-delete active sources
to force cascade deletion of every entity. Both are privilege
escalations against the raw zone's ground truth.

MAINTAIN is barred from calling this op by its own contract
(`specs/skills/maintain.md` §CLI ops used lists only read-side
source access; soft-delete of sources is not a MAINTAIN-authorized
action). Raw orphans are flagged for review, not soft-deleted.

## Lifecycle semantics

There are exactly two transitions this op performs and both have
defined callers:

### `active → deleted` (soft-delete)

Used by:
- **COMPILE §Phase 2** — raw file deletion observed in the git diff
  (`D oldpath`). The sequence is: flip the source row to `deleted`
  via this op; phase 9's cascade then calls `unlink_entity_source`
  for each junction row tied to the `source_id` and may trigger
  `delete_entity` for entities that drop to zero sources.
- **RECOVER §Phase 3** — pre-write cleanup of orphaned source rows.
  When an existing `sources` row has no counterpart in the parsed
  wiki citations, RECOVER soft-deletes it (and follows with
  `unlink_entity_source` as needed) before inserting fresh rows in
  phase 5.

### `deleted → active` (resurrection)

Used by:
- **COMPILE** when git reports an add (`A newpath`) for a path that
  already exists in `sources` with `status='deleted'`. If the
  content_hash on disk matches the stored `content_hash`, the file
  truly is the same one coming back and the trail should be
  preserved; the dispatcher calls this op with `'active'`.
- **Operator-initiated repair** via CLI when a file was incorrectly
  soft-deleted. This routes through COMPILE's entry point (not MCP,
  not MAINTAIN).

Resurrection preserves `entity_sources` rows keyed to the same
`source_id`. Entities whose trails depended on this source (and
whose other sources may have since deteriorated) do not automatically
un-cascade; cascade deletions are terminal under the current design.

## Status-flip does NOT drive the cascade

This is load-bearing enough to state explicitly: calling this op with
`'deleted'` does NOT reduce any entity's `entity_sources` count. The
junction rows stay. The cascade invariant
(`specs/skills/compile.md` §Contract — *Source cascade is automatic*)
fires from `unlink_entity_source` calls, which typically follow this
op but are not its side effect.

Rationale: (a) keeps the primitive simple; (b) RECOVER's cleanup
path can distinguish "orphan source row" (soft-delete via this op,
keep junction) from "orphan + cascade" (soft-delete plus unlink) on
its own terms; (c) avoids coupling status to junction writes which
would produce races when COMPILE phase 9 iterates over `entity_sources`
rows tied to a source it just flipped.

## Callers

- `specs/skills/compile.md` §Phase 2 — `D` entries in the git diff
  dispatch here. Normally `active → deleted`. Resurrection
  (`deleted → active`) applies when an `A` entry re-uses a
  soft-deleted path with matching content_hash.
- `specs/skills/recover.md` §Phase 3 — pre-write cleanup when a
  `sources` row has no parsed citation counterpart in the wiki.
  Always `active → deleted`.

No COMPILE phase 9 caller directly: phase 9's cascade ops are
`unlink_entity_source`, `add_timeline_entry`, and `delete_entity`;
the source's status was already flipped in phase 2.

No MAINTAIN caller. No ASK caller (read-only).

## Notes

- **No content_hash clearing on soft-delete.** The stored
  `content_hash` stays put. Useful for detecting "same file returning"
  on resurrection (an `A newpath` with matching hash after a prior
  `D oldpath + set_source_status('deleted')` sequence).
- **No `created_at` or `deleted_at` bookkeeping.** The schema per
  `K2_DESIGN.md` §Logical schema is `path, content_hash, status` —
  there is no `deleted_at` column today. Audit trail of when a source
  was marked deleted lives in the commit history and in any
  `timeline_entries` rows generated on affected entities during
  cascade. If operators want a per-source event log later, that is
  an additive schema change, not an edit to this op.
- **Input enum is strict.** Callers passing `'inactive'`, `'gone'`,
  `'archived'`, etc. get `invalid_status`. Adding a new status value
  requires a schema decision, not an ad-hoc op extension.
- **No bulk form.** Callers issue one call per source. Git diffs are
  linear; RECOVER's orphan pruning scales with the number of
  orphans, which is bounded by prior rows not citation count.

## Edge cases

- **Repeated `D oldpath` in consecutive runs.** Second run's diff
  may re-report the deletion if the checkpoint failed to advance.
  Caller issues this op with `'deleted'`; op returns `noop`. Safe.
- **Resurrection with content change.** `A newpath` hits a
  soft-deleted path, but the new file's content_hash differs. Two
  interpretations: (a) it's a brand-new file that happens to share
  the path — disallowed because `register_source` would error
  `path_already_registered`; (b) it's the same logical file with
  edits — flip to `active` via this op, then the stored hash is
  stale and needs the same backfill mechanism flagged in
  `register_source.md` §Open questions. Current design prefers (b).
- **Soft-deleting a source with zero `entity_sources` rows.** Valid.
  Some sources are registered but never attributed (see
  `specs/skills/compile.md` §Edge cases — *File with zero extracted
  entities*); they can still be marked deleted when the file is
  gone. No cascade fires — no junction rows to drop.
- **Attempt to soft-delete an already-deleted row.** Returns `noop`,
  no error. See §Idempotency.
- **Caller passes `new_status='active'` on a row that is already
  active.** Returns `noop`.

## Open questions

Inherited, not specific to this op:

- **`deleted_at` column and audit trail.** Whether to store the
  soft-delete timestamp on the source row itself. Today the answer
  is "no, infer from timeline entries and commit history." Revisit
  if an operator workflow requires per-source event visibility.
- **Resurrection with content change content_hash refresh.** Tied
  to `register_source.md` §Open questions on hash backfill. Affects
  any caller that does `deleted → active` when the raw file content
  changed during the dead period.
- **Whether MAINTAIN should ever soft-delete sources.** Currently no.
  If the design evolves to let MAINTAIN reconcile "rows marked
  active but file missing from disk" (distinct from COMPILE's
  diff-driven deletion), that reconcile op should call this one.
  Not in scope for the current contract.

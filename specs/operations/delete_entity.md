# delete_entity

Delete one entity and cascade-remove its DB footprint (links,
timeline entries, entity_sources, content_chunks) plus — by default
— its wiki file. The cascade anchor under the K2 design.

## Signature

```ts
delete_entity(
  ctx: OperationContext,
  input: {
    entity_slug: string;            // entity to delete
    preserve_wiki_file?: boolean;   // default false; true = DB-only delete
  },
): Promise<{
  entity_slug: string;              // echoed
  action: 'deleted' | 'noop';
  rows_removed: {
    entities: number;               // 0 or 1
    links: number;                  // both directions
    timeline_entries: number;
    entity_sources: number;
    content_chunks: number;
  };
  wiki_file_status: 'removed' | 'not_found' | 'delete_failed' | 'preserved';
}>
```

`preserve_wiki_file: true` is RECOVER §Phase 3's mode — wipe the
entity's DB state without touching the wiki file, so phase 4 can
re-insert from the parsed wiki. All other callers accept the default
and delete both DB and file.

## CRUD class

**D** on `entities` (primary), with FK cascades on `links`,
`timeline_entries`, `entity_sources`, `content_chunks`. File
deletion on the wiki zone (optional).

Writes: DELETE from `entities` (one row); FK cascades remove every
row in `links` where either endpoint matches, every
`timeline_entries` row with matching `entity_id`, every
`entity_sources` row, every `content_chunks` row. Optionally,
unlink the wiki file at `<category>/<slug>.md`.

Reads: `entities` (to resolve slug → id), counts of each cascaded
table (for return payload).

Does NOT touch: **neighbour entities**. Their inbound `links`
rows to this entity are pruned by FK cascade, but their
`compiled_truth`, `struct_hash`, or wiki files are NOT updated
here. Drop-link timeline entries on survivors are appended by the
CALLER (COMPILE §Phase 9 runs `add_timeline_entry` on each
survivor BEFORE invoking this op; see §Caller orchestration).

## Preconditions

- `entity_slug` follows `K2_SCHEMA.md` §Entity Identity canonical-
  slug rules. Violations return `invalid_slug`.
- `preserve_wiki_file`, if provided, is a boolean.
- The vault root is reachable (for wiki file deletion) unless
  `preserve_wiki_file: true`.

## Postconditions

On success:

- Every row keyed to the entity's id is gone from `entities`,
  `links` (both endpoint matches), `timeline_entries`,
  `entity_sources`, `content_chunks`. Counts are returned in
  `rows_removed`.
- The wiki file at `<category>/<slug>.md` has been unlinked, or
  left in place per `preserve_wiki_file`. `wiki_file_status`
  reports the outcome.
- `action`:
  - `'deleted'` — entity existed and was removed.
  - `'noop'` — entity did not exist (already gone or never
    existed). All `rows_removed` counts are zero; `wiki_file_status`
    is `'not_found'` or `'preserved'` depending on the mode.

On failure: no DB mutation (see §Atomicity). The wiki file is
never touched when the DB transaction fails.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_slug` | `entity_slug` violates canonical-slug format. | Caller bug — normalize upstream. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / MAINTAIN / RECOVER running locally. |

Runtime DB errors (FK constraint issues beyond the cascaded rows,
transaction aborts, connection loss) surface as `OperationError`
with engine diagnostics intact. Wiki-file deletion failures do
NOT raise errors — they reflect in `wiki_file_status:
'delete_failed'` and the DB delete remains committed (see
§Wiki-file delete failure).

No `entity_not_found` error. A missing entity is `action: 'noop'`,
consistent with idempotency semantics.

## Atomicity

The op uses a strict ordering:

1. **Read phase.** Resolve `entity_slug` to `entity_id` (or
   discover the slug doesn't exist and return early with
   `action: 'noop'`).
2. **DB phase.** Open a transaction:
   - DELETE FROM `entities` WHERE id = ?
   - FK cascades fire: `links`, `timeline_entries`,
     `entity_sources`, `content_chunks` lose rows pointing to this
     entity.
   - Count the rows removed per table (for return payload).
   - COMMIT.
   On transaction failure: rollback; no mutation; bubble the
   `OperationError`.
3. **Wiki-file phase.** Iff `preserve_wiki_file` is false:
   - Compute path: `<category>/<slug>.md` per the `entity.type`
     table captured in step 1.
   - `unlink` the file.
   - On success: `wiki_file_status: 'removed'`.
   - On "file doesn't exist": `wiki_file_status: 'not_found'`.
   - On other failure (permissions, I/O): `wiki_file_status:
     'delete_failed'`; do NOT error the op.

Order matters: DB FIRST, file LAST. Reversing would mean a DB
failure could leave the wiki file gone while the entity row
remains — creating a "broken" entity with no file. DB-first-
then-file is worst-case a stale wiki orphan, which MAINTAIN
already handles via its raw/wiki orphan checks.

## Caller orchestration (COMPILE Phase 9 cascade)

This op is primitive — it removes one entity's footprint. The
chain-cascade semantics documented in `compile.md` §Edge cases
("when A's deletion orphans B, and B's deletion orphans C")
happen at the CALLER level:

1. Identify entity A for deletion (source cascade dropped
   `entity_sources` to zero).
2. Fetch inbound links to A: `get_links(A, direction='inbound')`.
3. For each neighbour N pointing to A, append a drop-link
   timeline entry via `add_timeline_entry(N, ...)` naming A's
   removal.
4. Call this op: `delete_entity(A, preserve_wiki_file: false)`.
   FK cascade removes the A→X and X→A link rows.
5. Re-check each N's `entity_sources` count. If any drops to
   zero via chained dependency, recurse.
6. For every N whose struct_hash changed as a result (link set
   shrunk), COMPILE re-enters phase 6 → phase 7 (re-render)
   → phase 8 (re-embed).

This op does none of the above. It does exactly one thing.
The orchestration stays in COMPILE / MAINTAIN where the cascade
semantics are owned.

## Wiki-file delete failure

If step 3 of §Atomicity fails (e.g., filesystem permission
error, disk I/O error), the DB delete is ALREADY committed.
Rolling back the DB to keep the file "consistent" is not
supported — the DB transaction was atomic and cannot be
undone from outside.

Instead:

- The op returns `wiki_file_status: 'delete_failed'` and
  completes normally with `action: 'deleted'`.
- MAINTAIN's next check phase will detect the orphaned wiki
  file (a `.md` file in a category dir with no `entities`
  counterpart) under its raw/wiki orphan surface and can surface
  it for operator cleanup.
- Callers MAY retry the file delete externally; the op provides
  no built-in retry.

The alternative (rollback the DB on file-delete failure) is
worse: it would require a pessimistic "file-first" order where
a failed DB delete leaves an entity with no wiki file. Under the
chosen order, the worst case is a harmless orphan.

## `preserve_wiki_file` mode

When `preserve_wiki_file: true`:

- The DB phase runs normally (delete + cascades + commit).
- Step 3 (wiki file phase) is skipped entirely.
- Return payload has `wiki_file_status: 'preserved'`.

This is specifically the RECOVER §Phase 3 pattern: clean-slate
DB rebuild from wiki parse. The wiki file is the REBUILD
SOURCE, so deleting it would defeat the purpose. RECOVER
toggles this mode per-entity; all other callers accept the
default (`false`) and let the op clear both DB and file.

## Idempotency

Idempotent on absence. Calling twice:

- First call: `action: 'deleted'`, counts reflect removed rows,
  `wiki_file_status: 'removed'` (or 'preserved').
- Second call: `action: 'noop'`, all counts zero,
  `wiki_file_status: 'not_found'` (or 'preserved').

Safe to retry after partial failure. Callers that iterate
`list_entities` results and hit a slug that was concurrently
cascaded get `noop` rather than an error.

## Trust boundary

This op is **local-only**. `ctx.remote === true` rejects with
`remote_caller_denied`. Only `src/cli.ts` — as the entry point
for COMPILE, MAINTAIN, and RECOVER — may call this op.

Rationale: entity deletion has the widest blast radius in the
system. Remote callers triggering `delete_entity` could wipe
arbitrary entities, and the cascade would propagate through
links and timeline to affect every neighbour. MAINTAIN's own
spec requires human approval before source-orphan deletion
(`maintain.md` §Auto-fix scope — *delete_entity cascade-delete
a source-orphan AFTER human approval*); the trust boundary
here is the local-only gate backstopping that human-approval
contract.

## Callers

- **COMPILE §Phase 9** — source-cascade. When a source is
  soft-deleted and `entity_sources.count` drops to zero for an
  entity, that entity is cascaded. Caller orchestration per
  §Caller orchestration.
- **MAINTAIN §Auto-fix** — deletes source-orphans AFTER human
  approval. `maintain.md` §Auto-fix scope gates this behind
  explicit consent.
- **RECOVER §Phase 3** — clean-slate rebuild. Called with
  `preserve_wiki_file: true` per entity in scope; DB gets
  wiped, wiki remains as the source of truth for phase 4
  re-insertion.

## Notes

- **Cascade is FK-driven.** The schema (Phase 2b work) pins
  `ON DELETE CASCADE` on `links.from_entity_id`,
  `links.to_entity_id`, `timeline_entries.entity_id`,
  `entity_sources.entity_id`, and `content_chunks.entity_id`.
  This op relies on those constraints; the DB does the cascade.
- **No neighbour re-render.** Survivors whose link set shrinks
  via this deletion have stale struct_hash until COMPILE /
  MAINTAIN re-renders them. That's orchestration, not this op.
- **No drop-link timeline append.** See §Caller orchestration.
  Appending drop-link entries on survivors is the caller's job,
  BEFORE calling this op. Doing it AFTER would miss the
  deletion (entity is gone, can't append to its timeline, but
  neighbours still need the drop-link entry on THEIR
  timelines — which is why the caller does it first).
- **No backup.** The op does not snapshot the entity before
  deletion. If operators want a "recoverable delete", they
  snapshot the `entities` row + related rows externally before
  calling. In practice, deletion is irreversible at the op
  layer — RECOVER can reconstruct from the wiki if the file
  exists.
- **No cross-entity FK checks.** The schema's `ON DELETE
  CASCADE` on link endpoints means no dangling link exists
  after the op commits. The spec does not audit this
  post-hoc; FK integrity is an engine-level invariant.
- **No confirmation prompt.** The op is a primitive; human
  approval (MAINTAIN's contract) is orchestrated at the skill
  layer. The op itself does not ask — it just deletes when
  called.

## Edge cases

- **Entity with zero links, zero timeline, zero
  entity_sources, zero chunks.** All cascade counts are zero;
  only the `entities` row is removed. `rows_removed.entities =
  1`, everything else zero.
- **Entity whose wiki file never existed.**
  `wiki_file_status: 'not_found'`. Valid; `action: 'deleted'`.
- **Entity whose category dir doesn't exist.** Same as
  above — the file doesn't exist to delete. `not_found`.
- **Entity with many inbound links.** FK cascade removes all
  of them; `rows_removed.links` counts both inbound and
  outbound. Callers who want to know "how many neighbours
  lost a link" compare counts, or pre-count via `get_links`.
- **Cascading chain A → B → C.** Call orders: delete A with
  its pre-written drop-link entries on B; check B's source
  count; if zero, delete B with drop-link entries on C;
  repeat. This op does NOT self-recurse.
- **Concurrent delete on the same entity.** Under row-level
  locking, the first committer wins; the second returns
  `noop`. No deadlock.
- **Delete during a RECOVER phase 3 pass on a live DB.**
  Possible if RECOVER runs against a brain that COMPILE is
  also touching — undefined behavior; tracked in
  `recover.md` §Open questions on concurrent run safety.
  Current design assumes operators serialize these.
- **Delete with `preserve_wiki_file: true` but entity
  has no wiki file.** DB phase succeeds normally;
  `wiki_file_status: 'preserved'` regardless of existence.
  "Preserved" means "this op didn't touch the file,"
  not "a file exists and was kept."

## Performance considerations

- Cascade depth is one level deep (direct FK cascades only).
  No recursive deletion in the DB; the op returns after
  committing.
- The DB transaction size scales with cascade count. An
  entity with hundreds of timeline entries and thousands of
  chunks may be a non-trivial transaction; engines with
  long-running-transaction concerns may want to set a
  reasonable statement timeout.
- Wiki-file unlink is fast (single syscall). Disk failures
  here are usually systemic (full disk, permission drift)
  and don't slow the op per-call.
- Running cascade chains through a loop of `delete_entity`
  calls is serial at the skill layer. Engines MAY parallelize
  independent cascades (entities that don't share links), but
  the op itself is single-entity.

## Open questions

- **Partial-cascade transaction size cap.** If an entity's
  cascade count is very large (e.g., a massive hub entity
  in a pathological test vault), a single transaction may
  stress the engine. No cap is specified; engines can fail
  the transaction and bubble an `OperationError`. A chunked-
  cascade variant is deferred.
- **Audit trail for deletions.** The op currently leaves no
  record of the deletion other than what the caller put in
  neighbours' timelines. A dedicated `deletion_log` table
  would enable operator "what did we lose in this run?"
  queries. Not in scope; MAINTAIN's fix log and COMPILE's
  phase-9 reporting cover operator visibility at the skill
  layer.
- **Soft-delete for entities.** K2 currently has no "deleted
  entity" state — sources are soft-deleted, entities are
  hard-deleted. If a future design wants "marked for
  deletion pending review" semantics, that's a new op
  (e.g., `mark_entity_deleted` + `purge_entity`), not an
  extension of this one.
- **Orphaned wiki-file recovery.** `wiki_file_status:
  'delete_failed'` leaves a file on disk with no entity
  counterpart. MAINTAIN flags it. A dedicated "retry wiki
  orphan cleanup" sweep or a first-class
  `delete_wiki_file(path)` op could close the loop. Not in
  scope.

Inherited:

- **Canonical slug format evolution** — same as every
  slug-aware op.
- **Transaction boundaries across COMPILE phases** — the
  delete's cascade triggers downstream re-render /
  re-embed decisions whose ordering is tracked in
  `compile.md` §Open questions.
- **Source-rename fallout** (`update_source_path` §Open
  questions) — unrelated to deletion, but also affects
  stale references.

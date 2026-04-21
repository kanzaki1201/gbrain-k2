# update_source_path

Rewrite one row's `sources.path` column, preserving its `source_id`,
`content_hash`, `status`, and every `entity_sources` row keyed to it.
The sole write path for rename handling; creation is
`register_source`, status changes are `set_source_status`.

## Signature

```ts
update_source_path(
  ctx: OperationContext,
  input: {
    old_path: string;   // current path in `sources`; must exist
    new_path: string;   // new path; must NOT exist in `sources`
  },
): Promise<{
  source_id: number;   // unchanged by this op — returned for convenience
  old_path: string;    // echoed
  new_path: string;    // echoed
}>
```

Both paths use the same shape as `register_source` inputs:
vault-relative, POSIX forward slashes, under `human/**` or
`sources/**`.

## CRUD class

**U** on `sources` (one row, single column — `path`).

Writes: `sources.path` for the one row matching `old_path`.
Reads: `sources` twice — once to resolve `old_path` to `source_id`,
once to confirm `new_path` is unoccupied.

Does NOT touch: `entity_sources` (the whole point of this op — every
junction row survives the rename because it keys on `source_id`, not
`path`), `entities`, `links`, `timeline_entries`, `content_chunks`,
raw zone files, wiki files. `entities.struct_hash` also does NOT
change — the hash includes `entity_sources` but treats it as a set of
source_ids, not paths, so a rename is invisible to the hash.

## Preconditions

- `old_path` and `new_path` are both non-empty, vault-relative, use
  POSIX forward slashes, contain no `..` segments, have no trailing
  slash, and fall under `human/**` or `sources/**`. Same shape rules
  as `register_source`.
- `old_path !== new_path`. A self-rename is a caller bug — git would
  not report `R oldpath oldpath`.
- `old_path` exists in `sources`.
- `old_path`'s row has `status='active'`. A soft-deleted row is not
  renameable (see Errors → `source_not_active`; see also Notes).
- `new_path` does NOT exist in `sources` under any status. The target
  path must be completely free.

## Postconditions

After a successful call:

- Exactly one row in `sources` has been updated: the one formerly at
  `old_path` now has `path = new_path`. Its `source_id`,
  `content_hash`, `status`, and `created_at` are unchanged.
- No other row in `sources` is touched.
- `entity_sources` is untouched — every junction row keyed to
  `source_id` is preserved and its semantic attribution is intact.
- `timeline_entries` rows whose `source_id` matches are untouched —
  their FK is stable.
- No entity gets a struct_hash recompute. No wiki file changes. No
  re-render. No re-embed.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `source_not_found` | `old_path` has no matching row in `sources`. | Caller bug — phase 2 dispatch lost track; recompute the diff or rebuild from checkpoint. |
| `source_not_active` | `old_path` resolves but its `status` is `'deleted'`. | Caller bug — a deleted source cannot be renamed. Re-activate via `set_source_status` first if truly intended (unusual). |
| `destination_occupied` | `new_path` already exists in `sources` under any status. | Caller bug — either the diff is stale or a prior run left a row at `new_path`. Resolve the collision before retrying. |
| `invalid_path` | Either path is empty, absolute, uses backslashes, contains `..`, or ends with `/`. | Caller bug — normalize before calling. |
| `path_outside_raw_zone` | Either path does not start with `human/` or `sources/`. | Caller bug — only raw-zone paths are valid sources. |
| `paths_identical` | `old_path === new_path`. | Caller bug — treat this as a noop at the dispatch layer, don't call this op. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE running locally. |

Runtime DB errors (unique-index violations other than the above,
transaction aborts, connection loss) surface as `OperationError` with
engine diagnostics intact; they are not pre-enumerated here.

## Idempotency

**Not idempotent.** A second call with the same `(old_path, new_path)`
fails with `source_not_found` — the row has already moved. That's the
right behavior: git reports each rename exactly once per diff, and a
silent noop on "rename already happened" would mask a dispatch bug
that re-emits the same rename in a later run.

If a caller needs "ensure this source is at new_path", they probe
first with a source-read op (not yet spec'd) and decide whether to
issue `update_source_path` or to treat the current state as correct.

## Trust boundary

This op is **local-only**. `ctx.remote === true` (set by
`src/mcp/server.ts`) rejects with `remote_caller_denied`. Only
`src/cli.ts` — as the entry point for COMPILE — may call this op.

Rationale: an MCP caller with rename access could retarget an
attribution trail without touching the files on disk. Because this
op preserves `entity_sources`, a malicious rename could point an
entity's "source evidence" at an unrelated raw file by moving the
file's registry entry out from under it. Ground truth for rename
lives in git; only the local CLI has that grounding.

## Git-rename semantics

This op implements the "raw-file rename" case from
`specs/skills/compile.md` §Phase 2 and §Edge cases — *Git rename (`R`)
vs delete+create*. Phase 2's git diff (`git diff --name-status -M`)
emits `R oldpath newpath` when git detects a rename. The COMPILE
dispatch:

1. Computes `content_hash` of the file at `newpath`.
2. Compares it to the stored `content_hash` of the row at `oldpath`.
3. Branches:
   - **Hashes equal → pure rename.** Call this op once with
     `(oldpath, newpath)`. No phase-3 extraction. Phase 2 done for
     this file.
   - **Hashes differ → rename + content change.** Call this op with
     `(oldpath, newpath)` first (so all downstream writes in this
     run reference the new path), then hand the file to phase 3 for
     re-extraction as if it were a modified file. The stored
     `content_hash` still reflects the OLD hash and MUST be refreshed
     before the run ends — see §Open questions on the hash-backfill
     mechanism.
4. Alternatively, if git reports `D oldpath` + `A newpath` separately
   (rename similarity below the `-M` threshold), COMPILE can recover
   by comparing content hashes. If the hashes match, treat it as a
   rename and call this op — do NOT call `set_source_status` +
   `register_source`, because that path breaks `entity_sources`
   attribution.

## Preservation contract

The op is specifically designed to preserve these invariants across
a rename:

- **`source_id` stability.** All FKs into `sources` (from
  `entity_sources`, from `timeline_entries.source_id`, from any future
  table keying on source) remain valid without update.
- **`entity_sources` continuity.** Every entity whose evidence trail
  includes this source keeps its attribution. No cascade fires. No
  entity's struct_hash changes.
- **Citation path in rendered wiki.** The wiki's inline `^[...]`
  footnotes and `## Timeline` lines spell the *old* path until the
  next `compile_render` runs on the citing entity. But renaming a
  raw file does NOT change any entity's struct_hash (see below), so
  phase 7 will not re-render spontaneously. Callers who care about
  refreshing the citation paths in rendered wiki files need an
  explicit re-render path — that is outside this op's scope and is
  filed under Open questions.

## Why the struct_hash doesn't change

`K2_DESIGN.md` §Structural Hash lists `entity_sources` as an input.
Interpreted as a set of `(entity_id, source_id)` pairs, a rename of
the `sources.path` column is invisible to the hash. This is a
conscious design call: renames on disk must not trigger re-render
and re-embed storms across every entity that cites the renamed file.

The flip side: rendered wiki files carry stale path strings until the
*content* or *structural* evidence forces a re-render via a path
unrelated to this op. Callers that need aggressive freshness can run
a forced render pass on every entity touching this source_id, but
that is not COMPILE's default behavior, and it is not this op's
business.

## Callers

- `specs/skills/compile.md` §Phase 2 — the only legitimate caller.
  Invoked once per `R oldpath newpath` in the git diff (and, where
  content hashes match, once per `D`+`A` pair that COMPILE
  reconstructs into a rename).

No RECOVER caller. RECOVER rebuilds `sources` from scratch via
`register_source` on the parsed citation paths; there is no "rename"
semantics once the pre-existing rows are wiped in phase 3.

No MAINTAIN caller. Raw-zone renames are COMPILE's territory; MAINTAIN
flags raw orphans without writing to `sources`.

## Notes

- **Content hash is not touched.** This op is path-only. A rename
  with a content change requires a separate hash update — see Open
  questions. Conflating the two here would grow the primitive and
  smuggle a write path that isn't actually "rename".
- **No re-render of citing entities.** Wiki files that cite this
  source by its old path stay stale until re-rendered for another
  reason. See Edge cases.
- **No bulk form.** Callers issue one call per rename. A batch
  rename op is not warranted — git's diff is linear.
- **Case-sensitivity gotcha.** On case-insensitive filesystems, a
  rename that differs only in case (`Foo.md` → `foo.md`) looks
  identical by path to the op's precondition checks. Resolution is
  tied to the `sources.path` canonicalization Open question
  (`register_source.md` §Open questions).

## Edge cases

- **Rename-with-content-change.** Per `compile.md` §Edge cases,
  update path first, then re-extract on the new path. The stored
  `content_hash` remains stale until a dedicated backfill lands.
  On the next run, phase 2 will see the hash mismatch and re-process
  the file again — this is wasteful but not incorrect. Fix depends
  on §Open questions resolution.
- **Rename into a status='deleted' slot.** If `sources` has a
  soft-deleted row at `new_path` (old file that used to live there
  before being deleted), this op errors `destination_occupied`.
  Caller resolution: either (a) restore the deleted row via
  `set_source_status` if it's actually the same file coming back
  (content_hash match required), or (b) garbage-collect the deleted
  row through whatever `sources` GC op we eventually spec (not yet
  a named op). Currently no automated resolution.
- **Two renames in one run both targeting the same destination.** If
  git reports `R a d` and `R b d` in the same diff, COMPILE's phase-2
  dispatch must detect the collision and error out; this op would
  otherwise process the first call, then fail the second with
  `destination_occupied`.
- **Rename chain in one run.** `R a b` then `R b c`. The dispatch
  must apply calls in order. This op does not guard against intra-run
  ordering — that's phase 2's problem. Each call independently
  succeeds if its precondition holds at call time.
- **Source with zero `entity_sources`.** Still renameable. A source
  row without attributions (a raw file that no entity cites yet) is
  a valid registry entry and can move like any other.

## Open questions

Inherited from upstream, not specific to this op but relevant:

- **`content_hash` backfill mechanism.** Tracked in
  `specs/operations/register_source.md` §Open questions. Shapes how
  rename-with-content-change finalizes; this op alone is not
  sufficient in that scenario.
- **Re-rendering entities whose citations point to the renamed
  path.** The rendered wiki shows the old path until re-render. Is
  that acceptable churn, or should renames force a re-render pass
  for every entity in `entity_sources` for this `source_id`? Current
  design says "acceptable churn, render refreshes lazily." The
  alternative would replicate into a hash design that specifically
  incorporates path (bad — see §Why the struct_hash doesn't change)
  or a side-channel re-render queue (feasible but not spec'd).
- **Path canonicalization on case-insensitive filesystems.** See
  `register_source.md` §Open questions. This op inherits the same
  policy.

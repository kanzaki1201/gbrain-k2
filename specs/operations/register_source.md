# register_source

Insert one row into the `sources` table, recording a newly observed
raw-zone file (or a newly observed citation path, for RECOVER). The
sole write path for source **creation**; rename and status transitions
are `update_source_path` and `set_source_status`.

## Signature

```ts
register_source(
  ctx: OperationContext,
  input: {
    path: string;                    // vault-relative path under human/** or sources/**
    content_hash: string | null;     // sha256 of raw bytes, or null for RECOVER
  },
): Promise<{
  source_id: number;                 // primary key of the new row
  path: string;                      // echoed, normalized
  status: 'active';                  // always 'active' on registration
}>
```

`path` is the caller-facing stable identifier. `source_id` is the
surrogate key returned for callers that want to thread it to
`link_entity_source` without a round-trip.

## CRUD class

**C** on `sources`.

Writes: `sources` (one row).
Reads: `sources` (the existing row at `path`, to enforce the "new
file" precondition).

Does NOT touch: `entity_sources`, `entities`, `links`,
`timeline_entries`, `content_chunks`, raw-zone files, wiki files. The
source row is a registry entry, not a content import — content
chunking is `compile_embed`, entity attribution is
`link_entity_source`.

## Preconditions

These are caller contract. Failing any is a caller bug, not a runtime
error the caller should catch.

- `path` is a non-empty string, vault-relative (no leading `/`), with
  POSIX-style forward slashes. No `..` segments, no redundant `./`,
  no trailing slash.
- `path` is under `human/**` or `sources/**`. The raw zone is
  K2_DESIGN.md §Principle 3's "evidence layer"; registering paths
  outside it would imply a write to the wiki zone or vault root as
  a source, which no K2 skill supports.
- `path` is NOT already present in `sources` (under any status).
  Rename goes through `update_source_path` (preserves `entity_sources`);
  resurrection of a soft-deleted path goes through `set_source_status`
  flipping status back to `active`. This op is strictly for *first
  registration*. See Edge cases for the resurrection discussion.
- `content_hash`, when non-null, is a lowercase hex string of length
  64 (SHA-256). When null, the caller is RECOVER (invariant 2 forbids
  reading raw files), and the sentinel is the contractually empty
  content_hash. A null is backfilled by the next COMPILE run that
  reads the raw file; RECOVER does not race with COMPILE (see
  `specs/skills/recover.md` §Phase 5 Open questions on checkpoint
  interaction).

## Postconditions

After a successful call:

- `sources` has a row keyed by `path` with:
  - `path` = the input path verbatim.
  - `content_hash` = the input hash, or null.
  - `status` = `'active'`.
  - `created_at` = insert wall-clock.
- No other table has been mutated. `entity_sources` stays empty until
  a later `link_entity_source` call ties this source to an entity.
- The returned `source_id` is usable as a foreign key in subsequent
  calls (`link_entity_source`, `add_timeline_entry` via `source_path`
  lookup, `update_source_path`, `set_source_status`).

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `path_already_registered` | A row exists at `path` (regardless of status). | Caller bug — route to `update_source_path` (rename) or `set_source_status` (resurrection of soft-deleted). |
| `invalid_path` | `path` is empty, absolute, contains `..`, has a trailing slash, or uses backslashes. | Caller bug — normalize before calling. |
| `path_outside_raw_zone` | `path` does not start with `human/` or `sources/`. | Caller bug — only raw-zone paths are valid sources. |
| `invalid_content_hash` | `content_hash` is non-null and not a 64-char lowercase hex string. | Caller bug — recompute with the K2 canonical SHA-256 of the file bytes, or pass null for RECOVER. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / RECOVER running locally. |

Runtime DB errors (connection loss, constraint violations other than
the above, transaction aborts) surface as `OperationError` with the
engine's diagnostic intact; they are not pre-enumerated here.

## Idempotency

**Not idempotent.** Calling twice with the same `path` errors the
second call with `path_already_registered`. Unlike `compile_put_page`
(upsert) or `add_link` (upsert-on-uniqueness-key), this op treats
"source already exists" as a contract violation, because:

- COMPILE's phase 2 drives registration from a git diff that
  explicitly distinguishes `A` (add) from `M` (modify) from `R`
  (rename). A double-register only happens if that dispatch is wrong.
- RECOVER's phase 5 dedups citation paths *before* calling this op,
  and phase 3 wipes the `sources` table in full-mode first. A double-
  register only happens if that dedup pass is wrong.
- Silent noop-on-collision would mask either of those bugs while
  letting `entity_sources` trails get wired to the wrong row.

If a caller genuinely wants "register if missing", the caller checks
with a source-read op first (a read-side op not yet spec'd — see
`specs/skills/maintain.md` §CLI ops used). Do NOT fold that probe
into this op.

## Trust boundary

This op is **local-only**. `ctx.remote === true` (set by
`src/mcp/server.ts`) rejects with `remote_caller_denied`. Only
`src/cli.ts` — as the entry point for COMPILE and RECOVER — may call
this op.

Rationale: an MCP caller with source-registry write access could
forge citations ("this fact comes from `sources/Clippings/fake.md`",
where the file does not exist). The source trail invariant
(`specs/skills/compile.md` §Contract — *Every DB write has a source
trail*) is only meaningful if the `sources` table reflects reality.
COMPILE's registration is grounded in git diff of the actual
filesystem; RECOVER's registration is grounded in parsed wiki
citations. MCP callers have neither grounding.

MAINTAIN is explicitly barred from calling this op
(`specs/skills/maintain.md` §Anti-patterns — *auto-registering raw
orphans*). That enforcement lives in MAINTAIN's contract, not in this
op. If MAINTAIN adds a code path that calls `register_source`, that
is a spec violation to catch in review, not a runtime check.

## Status semantics

The op always writes `status='active'`. There is no input parameter
for status. Rationale:

- Registering a row with `status='deleted'` would mean "record this
  source as having existed and been removed" — no K2 skill has that
  need.
- COMPILE only registers files it sees in the current raw zone; by
  definition those are active.
- RECOVER only registers paths it sees cited in the wiki; per
  `specs/skills/recover.md` §Phase 5, the rebuilt `sources` rows are
  all active (status is not round-tripped through the wiki render).

State transitions OUT of `active` go through `set_source_status`. A
caller that needs "deleted" state on the freshly registered row
issues a two-step: `register_source` then `set_source_status`. The
split keeps each op's contract clean.

## Content hash semantics

`content_hash` enables three downstream behaviours:

1. **Rename detection** (COMPILE phase 2). When git reports `R
   oldpath newpath`, the caller updates the path via
   `update_source_path` but leaves the hash alone — a true rename
   doesn't change the content. When git reports `D oldpath` + `A
   newpath` but the content hashes match, the caller SHOULD treat it
   as a rename and call `update_source_path` instead of
   `register_source` + `set_source_status`.
2. **Modification detection** on subsequent runs. A file whose path
   is already in `sources` but whose on-disk hash differs from the
   stored hash is a modification — it drives phase 3 re-extraction
   without needing a new row.
3. **RECOVER fidelity note.** A null hash is a clear signal that the
   row was reconstructed without raw-zone access. A later COMPILE run
   that encounters the file computes and stores the real hash — but
   because the op does not re-register (precondition forbids), the
   backfill mechanism is a separate op (or a column update inside
   whatever COMPILE phase 2 routine notices the null). That surface
   is not yet spec'd; see Open questions.

## Callers

- `specs/skills/compile.md` §Phase 2 — newly added raw files (git
  status `A`). The caller computes `content_hash` from the file
  bytes before invoking.
- `specs/skills/recover.md` §Phase 5 — each unique citation path
  observed while parsing the wiki. `content_hash` is null under the
  current contract (`recover.md` §CLI ops used calls out the
  null/sentinel decision).

## Notes

- **No `entity_sources` side effect.** Registration alone does not
  link the source to any entity. A source row with an empty
  `entity_sources` footprint is valid — it represents a raw file
  that exists on disk (or was cited in the wiki) but has not yet
  been attributed to an entity. COMPILE runs the attribution via
  `link_entity_source` during phase 5.
- **No content read.** This op does not open the raw file. The
  caller precomputes `content_hash` (or passes null for RECOVER).
  Reading inside the op would (a) couple the op to filesystem
  semantics and (b) introduce a race between the git-diff view of the
  world and the on-disk view.
- **No path canonicalization.** The op validates shape but does not
  rewrite the path (no symlink resolution, no case normalization).
  Callers pass the exact path the wiki will cite (for RECOVER) or the
  exact path git reports (for COMPILE). Paths that differ only by
  case on a case-insensitive filesystem collide as distinct rows —
  the caller is responsible for reconciling if needed.
- **No timestamp input.** `created_at` is the insert wall-clock. The
  "when did the brain first learn about this source" signal is the
  insert time, not a caller-provided date; if a caller needs a
  historical registration date, that belongs on a timeline entry for
  whatever entity consumes the source, not on the source row itself.

## Edge cases

- **Soft-deleted path re-appears on disk.** The raw file was deleted
  (status='deleted'), then a new file appears at the same path.
  Under the current contract, the caller MUST NOT call
  `register_source` (would error with `path_already_registered`).
  The resolution depends on whether it is the same file:
  - Same content_hash → `set_source_status` flipping to `active`.
    The prior `entity_sources` trail is preserved.
  - Different content_hash → caller's choice. Common resolution:
    `set_source_status` to `active`, let phase 3 re-extract with the
    new content, and let the trail survive. Treating it as a
    genuinely new source (new row) is not currently supported because
    the schema keys on unique `path`. See Open questions for a future
    schema refinement if this pattern becomes common.
- **Path registered while phase-5 writes are in flight.** COMPILE's
  transaction boundaries are an Open question (inherited from
  `compile.md` §Open questions). Until resolved, the op assumes the
  engine's row-level locking prevents torn reads; it does not
  implement its own retry.
- **Case-insensitive filesystem sees two registrations that differ
  only in case.** The op treats them as distinct rows. If the vault
  is on a case-insensitive filesystem, the caller is responsible for
  normalizing (probably lowercasing) before calling. No config
  surface for this yet.

## Open questions

- **Null-hash backfill mechanism.** When a row was registered by
  RECOVER with `content_hash=null`, a subsequent COMPILE pass that
  reads the raw file needs a way to write the real hash without
  calling `register_source` (precondition forbids). Candidates: (a)
  a new `update_source_hash` op, (b) fold it into
  `update_source_path` as an optional parameter, (c) have COMPILE
  phase 2 write the hash column directly as part of its `A/M/R/D`
  dispatch. Not a blocker for the current spec; resolve when
  backfill becomes reachable.
- **Path normalization policy on case-insensitive filesystems.** See
  Edge cases. Probably resolved as a config knob (`sources.paths.
  case_sensitive: bool`), but not in scope for this op.

Inherited from upstream:

- **Transaction boundaries across COMPILE phases**
  (`compile.md` §Open questions). Affects atomicity of phase 2 +
  phase 5 writes but does not change this op's contract.

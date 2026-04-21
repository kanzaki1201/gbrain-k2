# link_entity_source

Attribute one entity to one source by inserting a row into the
`entity_sources` junction. The sole write path for entity→source
attribution; removal is `unlink_entity_source`.

## Signature

```ts
link_entity_source(
  ctx: OperationContext,
  input: {
    entity_slug: string;   // entity that owes evidence to the source
    source_path: string;   // raw-zone path registered in `sources`
  },
): Promise<{
  entity_slug: string;               // echoed
  source_path: string;               // echoed, normalized
  status: 'created' | 'noop';        // created on first link, noop on repeat
}>
```

No source_id or entity_id on the surface — the op resolves both
internally. The junction row's composite key is `(entity_id,
source_id)`; a second call with the same pair is a `noop`.

## CRUD class

**C** on `entity_sources` (idempotent — noop on duplicate).

Writes: `entity_sources` (one row on `created`; zero rows on `noop`).
Reads: `entities` (slug → id), `sources` (path → id plus status check),
`entity_sources` (to detect the duplicate → `noop` path).

Does NOT touch: `entities` (no struct_hash recompute; caller batches
`compile_put_page` after the full phase-5 write set), `links`,
`timeline_entries`, `sources`, `content_chunks`, raw zone files, wiki
files.

## Preconditions

- `entity_slug` resolves to an existing row in `entities`. Callers
  that create the entity in the same run MUST land `compile_put_page`
  before calling this op.
- `source_path` resolves to an existing row in `sources` with
  `status='active'`. A soft-deleted source is not a legal new
  attribution target (see Errors → `source_not_active`).
- Both resolutions are against the same logical transaction the
  caller is running; the op does not wait for external writes.

## Postconditions

After a successful call:

- On `created`: `entity_sources` has a new row with `entity_id` and
  `source_id` resolved from the inputs, `created_at` set to the
  insert wall-clock.
- On `noop`: `entity_sources` is unchanged. The row returned by a
  hypothetical read would be the one already stored; no timestamp is
  overwritten.
- No other table is mutated. In particular:
  - `entities.struct_hash` and `entities.updated_at` DO NOT change
    here — `entity_sources` is part of struct_hash input
    (`K2_DESIGN.md` §Structural Hash), so the caller MUST later run
    `compile_put_page` for the entity with the recomputed hash after
    every phase-5 write for it has landed. Splitting the
    responsibility keeps the hash canonical across batched writes.
  - `sources.updated_at` stays put; attribution does not alter the
    source row itself.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `entity_not_found` | `entity_slug` has no matching row in `entities`. | Caller bug — land `compile_put_page` first, or fix the slug. |
| `source_not_found` | `source_path` has no matching row in `sources` under any status. | Caller bug — land `register_source` first, or fix the path. |
| `source_not_active` | `source_path` resolves but its `status` is `'deleted'`. | Caller bug — either the citation is stale (remove it), or the user truly wants to resurrect the source (call `set_source_status` first, then retry). |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / RECOVER running locally. |

Runtime DB errors (FK violations other than those enumerated above,
connection loss, transaction aborts) surface as `OperationError` with
engine diagnostics intact; they are not pre-enumerated here.

## Idempotency

Idempotent on `(entity_id, source_id)`. Calling twice with the same
pair produces a single junction row; the second call returns
`{ status: 'noop' }` and performs no write.

Idempotency is intentional here (contrast with `register_source`
which rejects duplicates). The junction row encodes a boolean set
relation — *"is this source one of this entity's contributors?"* —
and `Set.add` semantics are the right model. Callers can re-issue
safely on retry without having to probe first.

"Same pair" is strict equality of the resolved ids. Two different
`source_path` strings that canonicalize to the same path are NOT
considered the same by this op — path canonicalization is outside
scope (`register_source` §Notes — *No path canonicalization*). The
uniqueness of the junction follows the uniqueness of `sources.path`.

## Trust boundary

This op is **local-only**. `ctx.remote === true` (set by
`src/mcp/server.ts`) rejects with `remote_caller_denied`. Only
`src/cli.ts` — as the entry point for COMPILE and RECOVER — may
call this op.

Rationale: the `entity_sources` junction is load-bearing for the
source-trail invariant (`specs/skills/compile.md` §Contract — *Every
DB write has a source trail*) AND the cascade invariant (phase 9
deletes entities whose `entity_sources` count drops to zero). An MCP
caller with junction-write access could fabricate source attribution
for an entity that has no real evidence, keeping it alive against the
cascade even after its real sources vanish. MAINTAIN is barred from
calling this op by its own contract (not listed in `maintain.md`
§CLI ops used).

## Source-trail interaction

COMPILE phase 5 orchestration — the canonical caller for new
evidence-based writes — runs ops in this order per entity:

1. `compile_put_page` (entity row exists).
2. `link_entity_source` one or more times (trail is live).
3. `add_link` for evidence-based edges (the trail requirement is
   satisfied by step 2; the `add_link` op itself does not verify the
   trail — see `specs/operations/add_link.md` §Preconditions).
4. `add_timeline_entry` for each extracted fact (requires source and
   entity to exist; trail is implicitly satisfied because step 2
   already attached the source).
5. `compile_put_page` again with the recomputed `struct_hash`.

An entity that leaves phase 5 with zero `entity_sources` rows is a
bug. It will be deleted by phase 9's cascade on the next run (or on
the same run if phase 9 catches it), and no callers should rely on
transient zero-source state.

## Cascade interaction

`unlink_entity_source` is the companion op for removing junction
rows; link removal plus a source count of zero triggers
`delete_entity` under COMPILE phase 9. This op does NOT implement
any cascade side effects — it writes the one row and returns.
Deletion logic lives downstream.

## Callers

- `specs/skills/compile.md` §Phase 5 — one call per (entity, source)
  pair produced by extraction. A raw file that extracts N entities
  yields N calls to this op (plus one `register_source` up front in
  phase 2).
- `specs/skills/recover.md` §Phase 5 — one call per (entity,
  citation-path) pair parsed from the wiki. Dedup of citation paths
  happens in the caller; this op further dedups via idempotency, but
  callers should not rely on that.

No MAINTAIN caller. MAINTAIN's auto-fix set does not include
attribution changes (creating or breaking `entity_sources` rows).
Raw-orphan handling surfaces the orphan for human review rather than
calling this op.

## Notes

- **No bulk form.** Callers issue N calls for N attributions. A
  batch op (`link_entity_sources_many({ entity_slug, source_paths[]
  })`) could be added later if a profiling pass shows round-trip
  cost matters, but would be additive; this primitive stays simple.
- **No source-existence probe beyond the precondition.** The op
  checks that the source exists and is active at call time. It does
  NOT poll for the source appearing later, and does NOT handle "link
  this pair eventually" semantics.
- **`noop` is observationally indistinguishable from `created` for a
  naïve caller.** That's fine — the junction state is the same in
  both cases. Callers that care (for metrics, logging,
  trail-activation detection) can branch on `status`; most won't.
- **Self-referential attribution is undefined.** A source whose path
  is the same as the rendered wiki file of an entity is a pathological
  case that crosses the zone boundary (raw vs. wiki) — both live
  under the vault tree. `register_source` already rejects wiki-zone
  paths via `path_outside_raw_zone`, so this op never sees such an
  attribution.

## Edge cases

- **Entity exists but was created in the SAME run without a
  `compile_put_page` commit yet.** Depends on the transaction
  model. Under the current Open question on transaction boundaries
  (`specs/skills/compile.md` §Open questions), the COMPILE caller is
  expected to land `compile_put_page` before invoking this op. If
  the engine reads from an uncommitted-in-same-transaction view,
  phase 5 must run under a single transaction per entity; otherwise
  phase-5 writes must serialize by entity. Both answers are
  downstream of the transaction-boundary decision.
- **Source exists but `status='deleted'`.** Errors with
  `source_not_active`. The caller decides whether to resurrect the
  source (typically not — if the file is gone from disk, a new
  citation should fail validation upstream).
- **Duplicate attribution across parallel phase-5 writes.** If two
  raw files both reference the same entity and each triggers its own
  call, idempotency protects the junction. No row duplicates, no
  error — both callers succeed.

## Open questions

Inherited from upstream; not specific to this op:

- **Transaction boundaries across COMPILE phases**
  (`compile.md` §Open questions). Determines whether step 1 →
  step 2 in §Source-trail interaction requires the same transaction
  or just the same run.
- **Path canonicalization policy on case-insensitive filesystems**
  (`specs/operations/register_source.md` §Open questions). The
  uniqueness of `sources.path` is what backs the idempotency guarantee
  here; any canonicalization policy applies equally to both ops.

None specific to this op.

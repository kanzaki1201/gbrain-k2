# add_timeline_entry

Append one row to the event ledger for an entity. The sole write path
for `timeline_entries` under the K2 design.

## Signature

```ts
add_timeline_entry(
  ctx: OperationContext,
  input: {
    entity_slug: string;   // entity the entry attaches to
    date: string;          // YYYY-MM-DD, the date the fact was learned
    summary: string;       // one-line "what the brain learned"
    source_path: string;   // raw-zone path; MUST match a row in `sources`
    detail?: string;       // optional longer body (used by render)
  },
): Promise<{
  entry_id: number;        // newly inserted row id
  entity_slug: string;     // echoed for caller convenience
  date: string;            // echoed, normalized to YYYY-MM-DD
}>
```

`entity_slug` and `source_path` are the caller surface; the op resolves
them to `entities.id` and `sources.id` internally. Callers never touch
surrogate ids.

## CRUD class

**C** on `timeline_entries`.

Writes: `timeline_entries` (one row).
Reads: `entities` (slug → id lookup), `sources` (path → id lookup).

Does NOT touch: `entities` (no summary propagation, no struct_hash
recompute — that's `compile_put_page`'s job after the caller
re-synthesizes), `links`, `entity_sources`, `content_chunks`, wiki
files. Render of the timeline line is `compile_render`; chunking of
the summary + detail text into an embedding is `compile_embed`.

## Preconditions

These are caller contract. Failing any is a caller bug, not a runtime
error the caller should catch.

- `entity_slug` resolves to an existing row in `entities`. Callers that
  create the entity in the same run MUST land `compile_put_page`
  before calling this op.
- `source_path` resolves to an existing row in `sources`. The row MAY
  have `status='deleted'` — cascade-induced timeline entries routinely
  reference a soft-deleted source (the raw file whose deletion kicked
  off the cascade is still a valid source_id FK target). Callers that
  register the source in the same run MUST land `register_source`
  before calling this op.
- `date` is a valid `YYYY-MM-DD` string. No time-of-day component. No
  timezone suffix. Callers parse frontmatter / extraction output into
  this format before invocation.
- `summary` is non-empty, single-line (no embedded newlines), and
  trimmed.
- `detail`, if provided, is a string (possibly multi-line). Empty
  string is equivalent to omitted.

## Postconditions

After a successful call:

- `timeline_entries` has a new row with:
  - `entity_id` = resolved id of `entity_slug`
  - `date` = the input date (stored as DATE)
  - `summary` = the input summary verbatim
  - `source_id` = resolved id of `source_path`
  - `detail` = the input detail, or empty string if omitted
  - `created_at` = insert wall-clock
- No other table has been mutated. In particular, `entities.struct_hash`
  and `entities.updated_at` are UNCHANGED by this op; the caller must
  recompute and write them via `compile_put_page` once the full set of
  structural changes for the entity is in.
- The returned `entry_id` is the primary key of the new row, useful
  for callers that want to cite the entry elsewhere in the same run
  (e.g. a future cascade ledger).

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `entity_not_found` | `entity_slug` has no matching row in `entities`. | Caller bug — land `compile_put_page` first, or fix slug derivation. |
| `source_not_found` | `source_path` has no matching row in `sources` (even with `status='deleted'`). | Caller bug — land `register_source` first, or fix the path. |
| `invalid_date` | `date` is not a parseable `YYYY-MM-DD` string, or encodes an impossible day. | Caller bug — normalize before calling. |
| `invalid_summary` | `summary` is empty, whitespace-only, or contains newlines. | Caller bug — the timeline line is single-line by K2_SCHEMA.md §Timeline entry format. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / RECOVER / MAINTAIN running locally. |

Runtime DB errors (connection loss, FK violations other than the above,
transaction aborts) surface as `OperationError` with the engine's
diagnostic intact; they are not pre-enumerated here.

## Idempotency

**Not idempotent, by design.** Timeline is append-only
(`specs/skills/compile.md` §Contract — *Append-only timeline*). Two
calls with identical inputs produce two identical rows. This is not a
bug: the op is the minimal primitive, and dedup is the caller's
concern.

Callers avoid duplicate writes by construction:

- **COMPILE** advances its checkpoint only after a successful run
  (`specs/skills/compile.md` §Contract — *Checkpoint advance is atomic
  with the run*). A rerun on the same diff is structurally impossible.
- **RECOVER** wipes `timeline_entries` for the target entities before
  re-inserting (`specs/skills/recover.md` §Phase 3).
- **MAINTAIN** only appends cascade-induced entries once per cascade
  event, gated by `delete_entity` running at most once per affected
  link (`specs/skills/maintain.md` §Auto-fix scope).

If a future op wants "upsert a timeline entry by (entity, date, source,
summary)" semantics, that is a DIFFERENT op and SHOULD NOT be folded
into this one — collapsing them would break the append-only invariant.

## Trust boundary

This op is **local-only**. `ctx.remote === true` (set by
`src/mcp/server.ts`) rejects with `remote_caller_denied`. Only
`src/cli.ts` — as the entry point for COMPILE, RECOVER, and MAINTAIN
— may call this op.

Rationale: letting an MCP caller append to the evidence ledger would
let an untrusted agent fabricate history. The timeline is the
append-only audit trail; write access is reserved for the skills whose
contracts guarantee source attribution (COMPILE §Contract — *Every DB
write has a source trail*; MAINTAIN §Contract — *Append-only
timeline*).

A read-side op (`get_timeline`) stays MCP-exposed for ASK.

## Cascade semantics

Cascade entries (§Phase 9 of COMPILE, §Auto-fix of MAINTAIN) use this
same op. The caller:

1. Resolves the raw-file path that triggered the cascade. For
   delete-entity cascades, this is the source whose deletion chained
   through. For link-drop cascades triggered by a source update, it is
   the updated source.
2. Crafts a `summary` that names the dropped link explicitly — the
   content is ledger prose, not a structured edge. Typical shape:
   `"Link <verb> <target-title> dropped (deleted with source)"`.
3. Uses the triggering source's path as `source_path`. A soft-deleted
   source is fine; the op accepts `status='deleted'` rows.

The op itself has no awareness of cascade vs. evidence-based entries —
both go through the same append path. The distinction lives in the
caller's `summary` text.

## Callers

- `specs/skills/compile.md` §Phase 5 — evidence-based entries from
  extracted facts.
- `specs/skills/compile.md` §Phase 9 — drop-link entries on entities
  affected by cascade deletion.
- `specs/skills/maintain.md` §Auto-fix cascade — drop-link entries
  appended when MAINTAIN runs `delete_entity` on a source-orphan.
- `specs/skills/recover.md` §Phase 6 — one call per parsed `## Timeline`
  row during wiki-to-DB rebuild.

## Notes

- **No render.** This op writes the row. Emission as the
  `- **YYYY-MM-DD** | <summary> ^[[<source title>](<path>), YYYY-MM-DD]`
  line (K2_SCHEMA.md §Timeline entry format) belongs to
  `compile_render`. The display title of the source — the bracket text
  in the citation — is render-side business; this op only stores the
  reference.
- **No struct_hash involvement.** Writing a new timeline entry
  structurally changes the entity and therefore should flip
  `struct_hash`. But this op does not recompute — the caller batches
  all structural writes for one entity and lands one
  `compile_put_page` at the end of phase 5 to write the new hash.
  Splitting the responsibilities keeps the hash canonical across
  multi-op update sets.
- **No dedup helper.** See Idempotency — callers provide the
  no-duplicates guarantee. Adding a silent skip here would mask caller
  bugs in which the checkpoint, wipe, or cascade gate fails.
- **Source trail holds for cascade.** The K2 invariant — every
  timeline row has a source_id FK — is preserved in cascade because
  the triggering source row still exists (soft-deleted, not purged).
  `set_source_status` marks it `deleted` but never removes it.

## Open questions

None specific to this op. The broader open questions on canonical
struct_hash serialization and transaction boundaries (tracked in
`specs/skills/compile.md` §Open questions and surfaced in
`fix_plan.md`) bound the COMPILE callers but do not change this op's
contract.

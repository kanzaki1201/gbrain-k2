# compile_render

Render one entity's DB state to a markdown file in the wiki zone.
The sole write path for rendered wiki files under the K2 design.

## Signature

```ts
compile_render(
  ctx: OperationContext,
  input: {
    entity_slug: string;        // entity to render
    dry_run?: boolean;          // default false; when true, no disk write
  },
): Promise<{
  path: string;                 // vault-relative wiki path, e.g. "people/alice.md"
  action: 'created' | 'overwritten' | 'unchanged' | 'dry_run';
  content?: string;             // always present when dry_run=true; optional otherwise
}>
```

`entity_slug` is the caller surface; the op fetches the full entity,
timeline, and links internally. No caller-side bundling.

## CRUD class

**C / U** on the wiki zone (one `.md` file).

Reads: `entities`, `timeline_entries`, `links`, `entity_sources`,
`sources` — everything needed to render the page.
Writes: one markdown file at `<category>/<slug>.md` under the vault
root. Parent directory is auto-created if missing.

Does NOT touch: `entities.struct_hash` (the hash was already written
by the preceding `compile_put_page`; this op is pure output),
`content_chunks` (that is `compile_embed`'s job), any other file in
the wiki zone, raw-zone files.

## Preconditions

- `entity_slug` resolves to an existing row in `entities`. If the
  row's `struct_hash` is null, the op STILL renders (RECOVER's
  phase-10 verification pass uses this via `dry_run` before phase 8
  backfills); callers that want to render only fully-compiled
  entities SHOULD filter on `struct_hash IS NOT NULL` upstream.
- The vault root is reachable and writable by the process (disk
  errors surface as `render_write_failed`).
- `ctx` carries a valid vault config pointing at the target brain.

## Postconditions

After a successful call:

- The rendered markdown file exists at the computed path (see
  §Path computation). Contents match the deterministic render of
  the current DB state (see §Rendered format).
- `action` reflects the disk outcome:
  - `created` — no file existed at the path; one was written.
  - `overwritten` — a file existed and its content was replaced.
  - `unchanged` — a file existed with byte-identical content; no
    write occurred. File mtime is preserved.
  - `dry_run` — `dry_run: true` was passed; no disk I/O happened;
    `content` is returned.
- `content` is always returned in dry-run mode. For the three
  disk-writing actions, `content` is optional (engines MAY return
  it for logging; callers SHOULD NOT depend on it).
- No DB row is mutated. In particular, `entities.updated_at` does
  NOT change.
- No `content_chunks` row is touched. Re-embed lives in
  `compile_embed`, which COMPILE phase 8 calls in pair with this
  one per changed entity.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_slug` | `entity_slug` violates `K2_SCHEMA.md` §Entity Identity. | Caller bug — normalize upstream. |
| `entity_not_found` | `entity_slug` has no row in `entities`. | Caller bug — land `compile_put_page` before calling. |
| `render_write_failed` | Disk write errored (permissions, space, I/O). | Retry after resolving; the op makes no partial mutation (see §Atomic write). |
| `invalid_vault_root` | `ctx` vault root is missing, unwritable, or outside the process's permitted roots. | Caller / ops bug — fix the config. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / MAINTAIN running locally. |

Runtime filesystem errors (FS-full, EIO) surface via
`render_write_failed` with the engine's diagnostic intact; they are
not pre-enumerated further.

No `entity_stale` error. If the caller passes an entity whose
struct_hash hasn't changed since last render, the op still runs;
the output is `unchanged` if the on-disk file already matches.
Callers that skip render for unchanged struct_hashes (COMPILE
phase 6) do so at the orchestration layer — not at this op.

## Path computation

The destination path is `<category>/<slug>.md`, where `<category>`
maps from `entities.type` via the K2 filing rules
(`K2_SCHEMA.md` §Directory Structure):

| `entity.type` | `<category>` directory |
|---------------|-------------------------|
| people        | `people/`               |
| places        | `places/`               |
| projects      | `projects/`             |
| companies     | `companies/`            |
| ideas         | `ideas/`                |
| originals     | `originals/`            |
| concepts      | `concepts/`             |
| how-to        | `how-to/`               |
| media         | `media/`                |
| tools         | `tools/`                |
| meetings      | `meetings/`             |
| decisions     | `decisions/`            |
| household     | `household/`            |
| personal      | `personal/`             |
| org           | `org/`                  |
| writing       | `writing/`              |

The op does NOT handle renames. If a caller changes an entity's
type, `compile_put_page` rejects that write with
`slug_collision_different_type` unless the slug was disambiguated
(e.g., `alice-project`). The op always writes where the current
type + slug point; pruning stale files at the OLD path is COMPILE
orchestration, not this primitive.

The parent directory is created if missing (`mkdir -p`
equivalent). No error on missing directory under a valid vault root.

## Atomic write

Writes use the standard write-to-temp + rename pattern:

1. Write the full rendered content to `<path>.tmp-<pid-or-unique>`
   in the same directory as the final path (same-filesystem is
   required for atomic rename).
2. Fsync (engine-dependent best-effort).
3. Rename `<path>.tmp-*` to `<path>`, which is atomic on POSIX
   filesystems.
4. On any failure before the rename, unlink the temp file and
   surface `render_write_failed`. No partial content at `<path>`.

Callers may safely retry on `render_write_failed`; the failed call
left no visible mutation.

## Rendered format

The output follows `K2_SCHEMA.md` §Page Format and
`K2_DESIGN.md` §Render. Structure:

```
---
{frontmatter — see below}
---

# {entity.title}

{entity.compiled_truth — rendered verbatim}

---

## Timeline

- **YYYY-MM-DD** | {summary} ^[[<source display>](../<source path>), YYYY-MM-DD]
... (each entry on its own line)

---

## Inferred Connections

- [<target title>](<relative path>.md) — `<link_type>` (<reason>)
... (one line per outbound inferred edge; section omitted if none)
```

### Frontmatter

```yaml
title: {entity.title}
type: {entity.type}
aliases: {entity.aliases, sorted case-insensitive ascending, YAML list}
tags: {entity.tags, sorted case-insensitive ascending, YAML list}
created: {frontmatter.created || entity.created_at.date}
updated: {frontmatter.updated || entity.updated_at.date}
{per-category fields from entity.frontmatter, sorted by key ascending}
```

- `title`, `type`, `aliases`, `tags` always appear first in that order.
- `created` / `updated` take from `entity.frontmatter` when present
  (preserves user-authored date); otherwise derive from DB
  timestamps (date-only, no time).
- Per-category fields (`role`, `status`, `media-type`, etc. per
  K2_SCHEMA.md §Frontmatter Specification §Per-category additions)
  come from `entity.frontmatter` and are emitted sorted by key for
  deterministic output.
- Empty arrays (`aliases: []`, `tags: []`) are still emitted — the
  slot stays in every rendered page.
- YAML is quoted where needed (values containing `:`, `#`, leading
  whitespace, or starting with a YAML reserved character). Engines
  use the same quoting rule across renders for byte-stable output.

### Timeline section

- Sorted by `date` DESCENDING (newest first) — opposite of
  `get_timeline`'s ascending API order. This is the wiki-reader
  convention per K2_DESIGN.md Alice/Bob/Cathy example.
- Ties (same date) broken by `created_at` DESCENDING, so the most
  recently inserted entry appears above an earlier-inserted entry
  from the same day.
- Each line: `- **YYYY-MM-DD** | {summary} ^[[<display>](<path>), YYYY-MM-DD]`.
  The `<display>` is derived from the source's path (basename
  without extension, or a stored title if present — engine
  decision). The citation date is the timeline entry's `date`.
- Section header `## Timeline` is always emitted, even if there
  are zero entries. The body is empty under the header in that case.

### Inferred Connections section

- Emitted only when the entity has ≥1 outbound `links` row with
  `inferred=true`. Per
  `docs/plans/2026-04-21-inferred-links-render-format.md`.
- Sorted by target slug ASCENDING (codepoint tiebreak) for
  deterministic output.
- Each line: `- [<target title>](<relative path>.md) — `<link_type>` (<context>)`.
- Absent section — no header, no blank section separator — when
  the entity has zero inferred outbound edges.

### Links inside compiled_truth

The `compiled_truth` body is rendered verbatim. The op does NOT
rewrite inline `[display](path.md)` links. Any link-path rewriting
(e.g., source renames) is the responsibility of the writer that
produced `compiled_truth` (COMPILE §Phase 5 synthesis), not this
op.

## Determinism

Two invocations of this op on byte-identical DB state MUST produce
byte-identical output. This is the contract RECOVER relies on for
round-trip fidelity (§Phase 10 verification):

- Frontmatter: key order is fixed (title, type, aliases, tags,
  created, updated, then per-category fields sorted by key).
- `aliases`, `tags`: sorted case-insensitive ascending, codepoint
  tiebreak.
- Timeline: sorted by `date DESC`, then `created_at DESC`.
- Inferred Connections: sorted by target slug ascending.
- YAML quoting rule is stable.
- Line endings: LF (`\n`), never CRLF.
- Trailing newline: exactly one at file end.

Engines that deviate from byte-stability break the RECOVER
round-trip invariant and the `unchanged` action's correctness.

## Trust boundary

This op is **local-only**. `ctx.remote === true` rejects with
`remote_caller_denied`. Only `src/cli.ts` — as the entry point for
COMPILE, MAINTAIN, and RECOVER — may call this op.

Rationale: arbitrary disk writes from MCP-exposed callers would
let an untrusted agent corrupt the wiki. Renders are driven by
COMPILE's extraction pipeline (which has its own notability /
dedup gates) or MAINTAIN's stale-page auto-fix (bounded by the
check-phase findings); both run locally.

## Idempotency

Idempotent when the DB state is unchanged:

- Repeat calls produce `unchanged` after the first `created` or
  `overwritten`, assuming no concurrent writer mutated the
  entity's DB-side inputs.
- Byte-identical content is detected by comparing the freshly
  rendered output against the file already on disk. No hash
  short-circuit — the op always does the render; the optimization
  is in skipping the write.
- `dry_run: true` is trivially idempotent; it never writes.

Pathological case: if an engine's YAML serializer produces
different-but-equivalent output on repeat calls (e.g., reordering
mapping keys), the op would write twice with `overwritten` both
times. Engines MUST maintain byte stability — see §Determinism.

## `unchanged` semantics

`action: 'unchanged'` means:

- A file exists at the target path.
- Its byte-for-byte contents match what this op would have
  written.
- No disk write, no mtime update, no directory stat change.

`unchanged` is a "correct idempotency" signal, not a "matches hash"
signal. Callers that want "did this entity's wiki file change
in this run?" get that information from this field directly; no
separate hashing or snapshot needed.

## Callers

- **COMPILE §Phase 7** — the canonical caller. Once per entity
  whose `struct_hash` changed in phase 5. Phase 6 filters out
  unchanged entities so phase 7 never receives no-op candidates;
  when it does (e.g., from a retry), the `unchanged` action
  absorbs.
- **COMPILE §Phase 9 re-render** — after cascade alters a
  surviving entity's struct_hash (link removed, drop-link timeline
  appended), the entity is re-rendered here. Same op, same path.
- **MAINTAIN §Auto-fix** — stale entities (struct_hash drift
  detected in the check phase) are re-rendered via this op,
  paired with `compile_embed`.
- **RECOVER §Phase 10** — verification pass. Calls with
  `dry_run: true` to render to a scratch buffer and diffs against
  the parsed wiki for round-trip mismatch detection.

## Notes

- **No multi-entity batch form.** One render per call. Batch
  would muddy the atomic-write + per-file action semantics.
- **No in-place partial render.** If a caller wants to replace
  only the `## Timeline` section of an existing file, this op
  doesn't support it. The op writes the full page or nothing.
- **No link-graph validation.** If `compiled_truth` contains an
  inline link to a non-existent entity (`[Ghost](people/ghost.md)`
  where `ghost` has no row), the op writes it as-is. Dead-link
  detection is MAINTAIN's job.
- **No frontmatter schema enforcement.** Whatever is in
  `entities.frontmatter` renders. If a `tool-type` key shows up
  on a `people` entity, it renders — the op does not gate per-
  category field presence. K2_SCHEMA.md validation is upstream.
- **Citation rendering.** The op resolves `timeline_entries.source_id`
  to `sources.path` via join; it does NOT look up source display
  titles in any external index. Display text for the citation is
  the source path's basename unless the engine opts to include a
  stored display-name column (not currently in the schema).
- **Self-renders are fine.** An entity with outbound `links` rows
  pointing to itself (forbidden by `add_link` §Preconditions
  anyway, but hypothetically) would render normally; the op does
  not gate.

## Edge cases

- **Entity with empty `compiled_truth`.** The body between `#
  Title` and the timeline separator is empty. Valid minimal page.
  Common for freshly created entities before phase-5 synthesis
  updates `compiled_truth`.
- **Entity with zero timeline entries.** `## Timeline` header is
  still emitted; section body is empty.
- **Entity with zero outbound inferred links.** `## Inferred
  Connections` section is omitted entirely — no blank header.
- **Entity whose category directory doesn't exist yet.** Op creates
  it via `mkdir -p` before writing.
- **Disk full mid-write.** Temp file creation or write fails with
  `render_write_failed`. Temp file is unlinked. No mutation at the
  final path.
- **Two COMPILE runs racing on the same entity.** The last writer
  wins under POSIX rename semantics. Engines may serialize renders
  at the skill layer; this op assumes external coordination.
- **File at target path is a directory (weird state).** Op errors
  `render_write_failed`. Resolution is operator cleanup.
- **Symbolic link at the target path.** Op follows the symlink and
  writes through it. Intentional — supports advanced vault layouts.
  Engines that want to refuse symlinks do so outside this op.

## Performance considerations

- Render cost scales with entity size: `compiled_truth` length +
  timeline entry count + inferred-link count. For typical K2
  entities (compiled_truth ~1–5KB, timeline ~10s entries), renders
  complete in ~1ms of CPU time plus disk I/O.
- The read phase (fetch entity + timeline + links + sources)
  involves up to four queries. Engines MAY fetch them in parallel.
- `unchanged` detection requires a file read to compare byte-for-
  byte. For entities whose struct_hash matches, the read cost is
  one file load plus the render cost. COMPILE phase 6 skips the
  op entirely in that case, so `unchanged` is mostly a safety
  net rather than a hot path.

## Open questions

- **Source display-title resolution.** Citations currently render
  the basename of the source path as display text. A future
  `sources.display_title` column could store a human-friendly
  title (e.g., "Alice's Website" for a clipping of that site),
  but is not in the schema today. Deferred.
- **Link-path rewriting on source rename.** `update_source_path`
  changes `sources.path` without re-rendering citing entities. The
  rendered wiki file carries the old path until the next
  re-render. A forced-render pass for every entity in the
  `entity_sources` trail of the renamed source is feasible but
  not wired. Tracked in `update_source_path` §Open questions.
- **Archived entities.** `K2_SCHEMA.md` references `archive/`
  under the wiki zone for retired content. How an archived entity
  maps through this op (e.g., does `type='archived'` route to
  `archive/<slug>.md`?) is undefined. Deferred until
  archiving is spec'd.
- **Render-time LLM pass.** Current design renders from DB state
  mechanically. A hypothetical future pass could use an LLM to
  rewrite `compiled_truth` prose on render — but that breaks
  determinism and the RECOVER round-trip. Explicitly NOT in scope.

Inherited:

- **Canonical slug format evolution** — same as every slug-aware
  op.
- **Transaction boundaries** — COMPILE phases 5 → 6 → 7 interact
  here; an unclosed phase-5 transaction could leave this op
  reading partial state. `compile.md` §Open questions owns the
  policy.
- **Cross-engine collation differences** — affects sorted fields
  (tags, aliases). Current mitigation is codepoint sort.

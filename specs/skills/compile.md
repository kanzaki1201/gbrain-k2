# COMPILE

Transform raw-zone changes into structured DB records and rendered wiki markdown,
as the single authorised writer across both layers.

## Layer reach

| Layer    | Access |
|----------|--------|
| Raw zone | R      |
| DB       | CRUD   |
| Wiki     | CRUD   |

**Writes:** `entities`, `timeline_entries`, `links`, `sources`, `entity_sources`,
`content_chunks`, compile checkpoint in `config`; wiki markdown files under
category directories per `K2_SCHEMA.md`.
**Reads:** raw zone files under `human/` and `sources/`; git metadata for the
configured checkpoint; existing DB rows for dedup, struct_hash comparison, and
cascade accounting.
**Does NOT touch:** raw zone files (never created, modified, moved, or deleted
by COMPILE — creation belongs to INGEST or direct human edits); nothing outside
the vault tree.

## Contract

Testable invariants COMPILE guarantees to callers and to the rest of the skill
system.

- **One-writer.** COMPILE is the only skill that creates or mutates rows in
  `entities`, `links`, `timeline_entries`, `sources`, `entity_sources`,
  `content_chunks`, or files in the wiki zone. MAINTAIN may update or delete,
  but never create. ASK and RECOVER have their own reach. INGEST writes only
  the raw zone.
- **Append-only timeline.** A `timeline_entries` row, once written, is never
  mutated or removed. Entity deletion cascades produce NEW timeline entries on
  affected entities recording the dropped link; the deleted entity's rows
  disappear with the entity, but every surviving entity's timeline only grows.
- **Conflicting evidence preserved.** When extracted facts contradict existing
  evidence, both sides are recorded (timeline entries, links with distinct
  `link_type` and context) and rendered in compiled_truth with citations.
  COMPILE never silently picks a winner. Mirror the Ethan case in
  `K2_DESIGN.md` §Example: Alice/Bob/Cathy.
- **Structural idempotency.** Same raw inputs → same graph structure (entities,
  links, timeline dates). When an entity's `struct_hash` is unchanged since
  last render, COMPILE skips render and embed for that entity entirely. No
  wiki file rewrite, no re-chunking, no embedding API call.
- **Source cascade is automatic.** When a raw file is deleted or its last
  contributing source row is removed, entities whose `entity_sources` count
  drops to zero are auto-deleted with cascade. Flagging source-light entities
  for human review is MAINTAIN's job, not COMPILE's.
- **Every DB write has a source trail.** New entities, timeline entries, and
  evidence-based links are always tied to a `sources` row via
  `entity_sources` or the link/timeline source reference. Inferred links are
  the sole exception and carry `inferred=true`.
- **Checkpoint advance is atomic with the run.** The compile checkpoint SHA
  in `config` only advances after the run's writes land. A failed run leaves
  the previous checkpoint intact so the next run re-processes the same diff.

## Dependencies

### CLI ops used

Pulled from `K2_DESIGN.md` §CLI operations per primitive. Each op is a
separate contract in `specs/operations/`. Signatures live in
`src/core/operations.ts`; this spec names them only.

- `register_source` — insert a new `sources` row for a newly seen raw file,
  with path, content hash, and active status.
- `update_source_path` — rewrite `sources.path` for a git-renamed raw file
  without re-extracting content.
- `set_source_status` — mark a `sources` row as deleted (soft-delete) when
  its raw file is removed.
- `link_entity_source` — add a row to `entity_sources` attributing an entity
  to a source.
- `unlink_entity_source` — remove an `entity_sources` row when a source no
  longer contributes to an entity (usually via cascade on source deletion).
- `compile_put_page` — structured upsert of an entity (slug, type, title,
  compiled_truth, frontmatter, tags, struct_hash). Replaces legacy
  `put_page`; takes structured fields only, no markdown parsing.
- `add_link` — insert a typed directed edge with `source` attribution and
  `inferred` flag.
- `add_timeline_entry` — append a dated evidence entry with source citation.
- `compile_render` — DB → markdown file for one entity; writes to the wiki
  path determined by `K2_SCHEMA.md` filing rules.
- `compile_embed` — chunk compiled_truth plus timeline text for one entity,
  call the embedding provider, store rows in `content_chunks`.
- `delete_entity` — cascade-delete an entity, its links, timeline entries,
  embeddings, and wiki file.
- `get_entity` — fetch one entity by slug (dedup confirmation, struct_hash
  comparison, cascade read).
- `search` — keyword and fuzzy search over entities for the dedup gate.
- `query` — hybrid (vector + keyword) search for the dedup gate when
  keyword search returns nothing useful.
- `get_timeline` — read existing timeline entries for an entity to inform
  re-synthesis and cascade accounting.
- `get_links` — read the link graph to find entities affected when a source
  or entity disappears (cascade) and for cross-entity propagation.

### Other skills called

- **ASK** — invoked internally during the notability/dedup gate to check
  whether an extracted entity already exists under a different name,
  alias, or handle. ASK is read-only and returns a grounded existence
  signal; COMPILE interprets the signal and does all writes.

## Phases

Each run executes in this order. Every phase names its input, output, CLI
ops used, and state changes.

### 1. Change detection

**Input:** current checkpoint SHA (from `config`) and HEAD of the raw zone.
**Output:** a list of raw-zone file changes keyed by git status: `A`
(added), `M` (modified), `D` (deleted), `R` (renamed).
**Op:** none — shells to `git diff --name-status -M <checkpoint>..HEAD`
scoped to `human/` and `sources/`.
**State change:** none yet.

Rename detection (`-M`) must distinguish a true rename from a delete+create.
A true rename is reported as `R oldpath newpath` and MUST NOT trigger
re-extraction when content is unchanged.

### 2. Source registration

**Input:** the per-file change list from phase 1.
**Output:** updated `sources` rows reflecting additions, moves, and deletions.
**Ops:** `register_source` (new files), `update_source_path` (renames with
unchanged content), `set_source_status` (deletions). Where a rename co-occurs
with content change, treat as move + modify: update path, then feed the file
into phase 3.
**State change:** `sources` table mutated. `entity_sources` is untouched by
renames — the junction still points at the same row.

### 3. Entity extraction

**Input:** new and modified raw files (the `A` and content-changed `M`/`R`
subset from phase 2).
**Output:** a per-file list of candidate entities with extracted facts,
links, and timeline snippets.
**Ops:** none (LLM work). COMPILE calls its chosen extraction provider.
**State change:** none yet; extraction is a read-only pass whose results
feed phase 4.

Cross-entity propagation happens here: when a fact about A also implies
new evidence on linked B, B is added to the affected-entity set even if
unnamed in the raw text (see the Alice/Bob/Cathy walkthrough — Bob is
updated by a zettel that never names him).

### 4. Notability / dedup gate

**Input:** each candidate entity from phase 3.
**Output:** a decision per candidate: `create`, `update-existing`, or `skip`.
**Ops:** `search` and `query` (exact, fuzzy, alias, handle lookups);
`get_entity` on any strong match. May also call ASK's existence-check path
for a grounded judgement when signals are mixed.
**State change:** none — this phase only decides what phase 5 will write.

Rules:
- Before creating any new entity, check for an existing one by title, slug,
  alias, handle, and nearby-context cues.
- If a match is confirmed, route writes to the existing entity.
- If no match is found and the candidate passes the notability bar
  (K2_SCHEMA.md §Notability Gate), mark it `create`.
- If the candidate is too thin to warrant a page, skip it.

### 5. Structured writes

**Input:** per-entity write set from phase 4 (new entities, updates to
existing entities, new links, new timeline entries).
**Output:** updated `entities`, `links`, `timeline_entries`, `entity_sources`
rows; recomputed `struct_hash` on every touched entity.
**Ops:** `compile_put_page`, `add_link` (with `source` and `inferred`),
`add_timeline_entry`, `link_entity_source`.
**State change:** all structured DB mutations for the run land in this phase.
Inferred links are written with `inferred=true` and carry the structural
reason in their `context` field.

### 6. Struct_hash comparison

**Input:** freshly written `entities.struct_hash` per phase 5, compared
against the value stored before this run.
**Output:** the set of entities whose struct_hash changed. Entities whose
struct_hash matches the pre-run value are excluded from phase 7 and 8.
**Ops:** `get_entity` for the prior value when not held in memory.
**State change:** none — this is a filter.

### 7. Render

**Input:** the changed-hash set from phase 6.
**Output:** wiki markdown files in the correct category directory per
`K2_SCHEMA.md` filing rules, using the link and citation format in
`K2_DESIGN.md` §Render.
**Op:** `compile_render` once per changed entity.
**State change:** wiki files created, rewritten, or moved on disk.

Entities whose outbound link set includes `inferred=true` edges get an
`## Inferred Connections` section below `## Timeline`, per the decision
in `docs/plans/2026-04-21-inferred-links-render-format.md`. Entities
with no inferred outbound edges omit the section entirely.

### 8. Embed

**Input:** the same changed-hash set.
**Output:** fresh `content_chunks` rows covering compiled_truth and timeline
text for each changed entity; stale rows for those entities removed before
insert.
**Op:** `compile_embed` once per changed entity.
**State change:** `content_chunks` mutated; embedding provider called.

### 9. Cascade

**Input:** every entity whose `entity_sources` count dropped in this run.
**Output:** zero-source entities deleted with full cascade; surviving
entities that lost a link get a NEW timeline entry recording the drop.
**Ops:** `get_links`, `get_timeline`, `unlink_entity_source`,
`add_timeline_entry`, `delete_entity`. After cascade, re-enter phase 6 for
entities whose struct_hash changed as a result of link removal, so the
render and embed of surviving entities stays consistent with the new graph.
**State change:** may delete entities, prune `entity_sources`, append
timeline entries, delete wiki files, and re-render neighbours.

At the end of the run, the compile checkpoint in `config` advances to HEAD.

## Anti-patterns

What COMPILE must NEVER do. These exist to keep SKILL.md honest when it is
written later.

- **Create entities without the notability/dedup gate.** Every candidate goes
  through phase 4, including entities that "feel obviously new". A skipped
  dedup check is how duplicate people and tool pages get born.
- **Silently resolve conflicting evidence.** Both sides are recorded and
  cited. If the LLM hides one side of a contradiction in compiled_truth, the
  run is wrong — rewrite the prompt, not the evidence.
- **Re-render or re-embed when struct_hash is unchanged.** No "just to be
  safe" passes; the skip is the contract. A run that touches every entity
  every time is a correctness bug, not a performance hiccup.
- **Write to DB without a source trail.** Evidence-based entities, links,
  and timeline entries must map to a `sources` row. Inferred links are the
  only exception, and they carry `inferred=true` with a structural reason.
- **Ingest content.** COMPILE reads raw only. Writing to `human/` or
  `sources/` is INGEST's job (plus direct human edits). If COMPILE is about
  to call a write op on a raw path, it has a bug.
- **Flag orphans for review.** Zero-source entities cascade-delete.
  Surface-level "please review" flags belong to MAINTAIN.
- **Advance the checkpoint on a failed run.** A partial run must leave the
  checkpoint untouched so the next run re-picks the same diff.

## Edge cases

- **Git rename (`R`) vs delete+create.** Git rename preserves history, so
  phase 2 must call `update_source_path`, not `set_source_status` +
  `register_source`. A rename with unchanged content is invisible to phases
  3–8: no re-extraction, no struct_hash change, no re-render, no re-embed.
- **Rename with content change.** Update the path first, then treat the new
  path as a modified file in phase 3. `entity_sources` is preserved.
- **Cascade that orphans a chain.** When A's deletion orphans B, and B's
  deletion orphans C, process in order: delete A, append drop-link timeline
  on B, re-check B's source count; if zero, delete B and append drop-link
  on C; repeat. Every surviving entity in the chain gets a new timeline
  entry; no existing entry is mutated.
- **Conflict where one source is deleted.** If the source citing the
  contested fact disappears, phase 9's cascade may drop the supporting
  link or timeline. Re-render reflects the remaining side — the contradiction
  may collapse, but only because evidence actually vanished, not because
  COMPILE chose a winner.
- **Slug collision across types.** If extraction proposes `alice` (type
  `projects`) while `alice` (type `people`) already exists, the slug is
  taken. COMPILE disambiguates by prefixing the type in the slug for the
  new entity (e.g., `projects/alice-project.md`) and records the chosen
  slug in that entity's frontmatter. Never write a second row to an
  existing slug; never silently coerce a project into a person.
- **File with zero extracted entities.** The source still registers in
  phase 2 (so later edits show up), but `entity_sources` stays empty and
  MAINTAIN will later surface it as a raw orphan.
- **LLM returns malformed extraction.** Treat as a phase-3 failure for that
  file; the run continues for other files but the checkpoint does not
  advance past the failed file. See open questions on retry policy.

## Open questions

- **Canonical `struct_hash` serialization.** What exact bytes go into
  SHA-256? Field order, null handling, Unicode normalization form, how
  inferred links participate — all undefined. Until fixed, two implementations
  with identical DB state can compute different hashes.
- **Transaction boundaries.** Which phases are atomic per entity, per file,
  or per run? A crash mid-phase-5 across related entities can leave
  dangling `entity_sources` without links, or vice versa. Needs a written
  atomicity contract before implementation.
- **LLM extraction error handling.** Retry with backoff, skip the file and
  log, or abort the run? Behaviour differs sharply between "model rate
  limited" and "model returned garbage JSON". No policy is committed.
- **Notability signal source.** Is the notability bar driven by source
  count, citation density, an LLM judgement, or a combination? The phase-4
  skip decision has no documented formula yet.
- **ASK existence-check response shape.** COMPILE calls ASK for dedup, but
  ASK's output format for that internal path — match list, confidence score,
  grounded narrative — is not yet specified. Blocks ASK's spec too.

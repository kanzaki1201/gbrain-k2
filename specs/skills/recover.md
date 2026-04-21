# RECOVER

Reconstruct the structured store (`entities`, `links`, `timeline_entries`,
`sources`, `entity_sources`, `content_chunks`) from the rendered wiki
markdown alone. Used when the DB is lost, during engine migration, or
when bootstrapping from an exported wiki.

## Layer reach

| Layer    | Access |
|----------|--------|
| Raw zone | —      |
| DB       | CRUD   |
| Wiki     | R      |

**Writes:**
- `entities` (CRUD) — inserts parsed rows; may delete existing rows
  before rebuild when the caller requests a clean slate.
- `links` (CRUD) — inserts every `[text](path.md)` match; deletes old
  rows when rebuilding.
- `timeline_entries` (CRUD) — inserts every parsed `## Timeline` row;
  deletes old entries on clean-slate rebuild.
- `sources` (CRUD) — inserts a row per unique citation path; may
  delete stale rows when caller requests it. Inferred `status='active'`.
- `entity_sources` (CRUD) — inserts one row per (entity, source) pair
  discovered in citations.
- `content_chunks` (CRUD) — re-chunks and re-embeds every reconstructed
  entity; old embeddings are discarded because they were tied to a
  `struct_hash` that no longer exists.
- `entity_versions` / `raw_data` / `ingest_log` — untouched; these are
  COMPILE/INGEST-owned supporting tables and the wiki doesn't preserve
  their history.

**Reads:** every markdown file under K2 category directories per
`K2_SCHEMA.md` §Directory Structure (the wiki zone). Nothing else.

**Does NOT touch:**
- `human/**` or `sources/**` — raw zone is `—` in layer reach. RECOVER
  parses citation paths but never opens the referenced files.
- The compile checkpoint in `config` — RECOVER is orthogonal to COMPILE's
  raw-zone diff state; see Contract invariant 8 and Open questions.
- Any file outside the vault tree.
- Any file under wiki's `archive/` unless the caller explicitly opts in
  (see Open questions on archived-page handling).

## Contract

Testable invariants RECOVER guarantees.

1. **Roundtrip fidelity.** For any entity E, the pipeline
   `render(DB[E]) → parse(markdown[E]) → DB'[E]` produces DB state
   equivalent to DB[E] under a defined equivalence relation. Equivalence
   covers: slug, type, title, aliases, tags, compiled_truth text,
   timeline entries (dates + summaries + source citations), evidence-based
   link set (from/to/verb/context), `entity_sources` set. Fields NOT
   covered by equivalence (and thus lost in the round trip under the
   current schema): the `inferred` flag on links, the `content_hash` of
   sources, chunk-text byte-identity, embedding vectors. See Open
   questions.
2. **No raw-zone reach.** RECOVER never opens a file under `human/**`
   or `sources/**`. Citation paths are recorded as strings; content is
   not fetched. This is what makes the wiki a self-contained backup.
3. **Lossless from the wiki.** Every entity, link, timeline entry, and
   source present in the wiki survives a RECOVER pass. If the wiki
   encodes it, RECOVER reconstructs it.
4. **No invention.** RECOVER never creates a row the wiki does not
   imply. New entities that the operator wishes existed do NOT get
   conjured during a recovery — that's COMPILE's job on a subsequent
   raw-zone pass.
5. **Idempotent.** Running RECOVER twice against the same wiki with
   the same options produces byte-equivalent DB state (subject to
   non-deterministic fields like embedding floats — see Open questions
   on re-embedding determinism).
6. **Struct_hash is computed, not parsed.** The wiki doesn't encode
   `struct_hash` directly; RECOVER recomputes it from the reconstituted
   timeline + links + tags + entity_sources, using the same algorithm
   COMPILE uses. Hash canonicalization is the same open question
   COMPILE carries.
7. **Atomic per entity.** Parsing a single wiki file either succeeds
   entirely or that entity is skipped with a logged reason. Partial
   rows (entity inserted without its timeline, or with only some of
   its links) never land. Aggregate atomicity across the whole run is
   an Open question.
8. **Checkpoint-neutral.** RECOVER does not advance, reset, or read
   the COMPILE checkpoint. The caller is responsible for deciding what
   to do with the checkpoint after RECOVER — full raw re-extract
   (checkpoint null), trust-and-continue (keep current), or manual
   pin. See Open questions.
9. **Re-embedded.** Every reconstituted entity gets fresh
   `content_chunks` rows. Embeddings from a prior DB are never reused,
   because they were keyed to a `struct_hash` that RECOVER recomputes.

## Dependencies

### CLI ops used

Write-side (shared with COMPILE; ops are a shared surface):
- `compile_put_page` — insert reconstructed entity rows (slug, type,
  title, compiled_truth, frontmatter, tags, struct_hash).
- `add_link` — insert each parsed link. Always `inferred=false` under
  the current render format (see Open questions).
- `add_timeline_entry` — one call per parsed `## Timeline` row.
- `register_source` — insert a `sources` row for each unique citation
  path observed across the wiki. `content_hash` is null / sentinel
  under the current contract; see Open questions.
- `link_entity_source` — one call per (entity, citation path) pair.
- `compile_embed` — re-chunk and re-embed each reconstructed entity.
- `delete_entity` — clean-slate rebuild: delete existing entity row
  (and its cascaded links, timeline, entity_sources, chunks, wiki file?
  — see Edge cases) before inserting the parsed replacement.
- `set_source_status` / `unlink_entity_source` — cleanup of orphaned
  rows when the caller chose a clean-slate pass.

Read-side:
- `list_entities` / `get_entity` — used by selective-recovery mode to
  diff current DB against parsed wiki and reconcile.

Parsing (frontmatter, compiled_truth body, inline links, timeline
rows, citations) is implementation internal — not a CLI op.

### Other skills called

None. RECOVER is a leaf skill. Notably:

- **Does not call COMPILE.** Even though RECOVER shares write-side ops
  with COMPILE, it does not invoke COMPILE as a skill. Calling COMPILE
  would re-enter the extraction pipeline, which needs raw zone access
  RECOVER lacks.
- **Does not call ASK.** No dedup gate during reconstruction — the
  wiki is authoritative, and duplicate-looking slugs in the wiki are
  a MAINTAIN finding, not a RECOVER decision.

## Phases

Each run moves through these phases in order. Phase 2's output drives
everything that follows.

### 1. Mode selection

**Input:** caller-supplied mode: `full` (wipe and rebuild), `selective`
(rebuild a named list of entities), or `dry-run` (report what would
change, write nothing).
**Output:** a scope object describing which entities to read from the
wiki and which existing DB rows to delete first.
**State change:** none.

Rules:
- `full` is a destructive op and requires explicit opt-in.
- `selective` writes only the listed entities. Cross-entity references
  to entities not in the list are still parsed and inserted as links,
  but the referenced entities themselves are not reconstructed.
- `dry-run` runs through phases 2–3 and emits a diff report without
  calling any write op.

### 2. Wiki scan and parse

**Input:** the wiki category directories per `K2_SCHEMA.md` §Directory
Structure, filtered by the phase-1 scope.
**Output:** a parsed-page structure per file:
- `slug`, `type`, `title`, `aliases`, `tags`, `created`, `updated` from
  frontmatter.
- `compiled_truth` — the body between the opening `---` block and the
  timeline separator.
- `links` — every `[display](path.md)` match inside `compiled_truth`.
- `citations` — every `^[[title](path), date]` match inside
  `compiled_truth` and within timeline entries.
- `timeline` — ordered list of parsed `## Timeline` entries, each with
  `date`, `summary`, and embedded citation list.
**Ops:** none — all filesystem + parsing.
**State change:** none.

A page that fails to parse (malformed frontmatter, missing `##
Timeline` separator, unparseable date) is logged and excluded from
subsequent phases. Per invariant 7, no partial write lands for such a
page.

### 3. Pre-write cleanup (conditional)

**Input:** the scope from phase 1 and any pre-existing DB state that
needs to be evicted before insert.
**Output:** DB rows for in-scope entities are deleted. In `full` mode,
every `entities` row, along with cascaded links / timeline /
entity_sources / content_chunks, is removed. In `selective` mode, the
same happens but only for entities the caller named.
**Ops:** `delete_entity` per entity. `set_source_status` and
`unlink_entity_source` for orphaned source rows that no longer
correspond to any parsed citation path.
**State change:** `entities`, `links`, `timeline_entries`,
`entity_sources`, `content_chunks`, and selected `sources` rows may
shrink substantially.

Skipped entirely in `dry-run` mode.

### 4. Insert entities

**Input:** parsed pages from phase 2.
**Output:** a fresh `entities` row per page. Struct_hash field is
computed *after* phases 5–7, in phase 8, so insert is a two-step: a
shell row goes in now, and the hash column is backfilled once its
inputs are present.
**Ops:** `compile_put_page`.
**State change:** new `entities` rows.

### 5. Insert sources and entity_sources

**Input:** the union of unique citation paths across all parsed pages
and the per-page citation set.
**Output:** one `sources` row per unique path (status `active`,
`content_hash` null or sentinel), one `entity_sources` row per
(entity, citation-path) pair.
**Ops:** `register_source`, `link_entity_source`.
**State change:** `sources` and `entity_sources` rows materialize.

### 6. Insert timeline entries

**Input:** the parsed `timeline` list per entity.
**Output:** one `timeline_entries` row per parsed line, dated from the
line's header, with the embedded citation resolved to the matching
source row.
**Ops:** `add_timeline_entry`.
**State change:** `timeline_entries` rows materialize.

### 7. Insert links

**Input:** the `links` list per parsed page, plus the link target's
slug (derived from the path inside `[display](path.md)`).
**Output:** one `links` row per parsed link, `inferred=false` under
the current format.
**Ops:** `add_link`.
**State change:** `links` rows materialize.

Link verbs: the current render format does not emit the verb as a
distinct token. RECOVER cannot faithfully reconstruct `link_type` from
a parse-only pass; see Open questions. V1 behaviour is to store the
link with a generic `link_type='references'` and let MAINTAIN refine
on a subsequent pass (itself an Open question, since MAINTAIN's
auto-fix scope doesn't currently include link-type refinement).

### 8. Recompute struct_hash

**Input:** the newly written `timeline_entries`, `links`, tags from
frontmatter, and `entity_sources` per entity.
**Output:** struct_hash per entity, stored on the `entities` row.
**Ops:** `compile_put_page` (idempotent upsert of the hash column).
**State change:** `entities.struct_hash` column now non-null.

The hash uses the same algorithm COMPILE uses. Canonical serialization
is the same Open question COMPILE carries — RECOVER inherits it.

### 9. Re-embed

**Input:** every in-scope entity's reconstituted compiled_truth and
timeline text.
**Output:** fresh `content_chunks` rows.
**Ops:** `compile_embed`.
**State change:** `content_chunks` populated.

Skipped in `dry-run` mode.

### 10. Verification pass (optional)

**Input:** the reconstituted DB plus the original parsed pages.
**Output:** a roundtrip report — for each entity, does `render(DB)`
produce markdown that re-parses to the same structured data? Any
mismatch surfaces as a finding the operator can review.
**Ops:** `compile_render` (to a scratch buffer, NOT written to disk)
plus the parser from phase 2.
**State change:** none to DB or wiki. The report is returned to the
caller.

## Anti-patterns

- **Opening a raw-zone file.** The `—` in the raw layer cell is the
  contract. Even for "just verifying" a citation target exists.
- **Inventing missing entities.** A link target `people/cathy.md` that
  has no corresponding parsed page in the scan does NOT cause RECOVER
  to create an entity row for Cathy. The link gets written pointing at
  a slug that has no entity; MAINTAIN will later surface it as a dead
  link. Recovery is not a suitable moment to hallucinate into gaps.
- **Preserving stale embeddings.** Running RECOVER then skipping
  `compile_embed` produces `content_chunks` rows whose embeddings were
  generated against an older `compiled_truth`. Always re-embed.
- **Advancing the compile checkpoint.** That's a raw-zone bookkeeping
  concern RECOVER has no grounds to touch.
- **Parsing `human/**` or `sources/**` as if they were wiki files.**
  Raw zone files are not wiki markdown and do not round-trip through
  this pipeline.
- **Partial entity writes.** Invariant 7 forbids an entity row without
  its timeline, or a link list without the entity. Transactional
  enforcement per entity is required; the runtime policy is an Open
  question on aggregate atomicity.
- **Using RECOVER to resolve duplicates.** Two wiki pages claiming the
  same slug is a filing violation, not a reconciliation exercise.
  Abort the run, surface the conflict, and defer to MAINTAIN + human.
- **Trusting DB state over wiki state.** If caller chose `full` mode,
  the DB is authoritative only insofar as it gets deleted. Post-phase-3
  DB state is derived entirely from the parse.

## Edge cases

- **Wiki page with no timeline section.** Permitted — an entity can
  exist with no recorded timeline entries (e.g., a recently created
  entity where extraction produced no dated facts). Insert the entity,
  skip phase 6 for this page.
- **Timeline entry with unparseable date.** The entry is malformed.
  Per invariant 7, the whole entity is aborted — the page likely
  carries other malformations too, and half-reconstructed entities
  violate roundtrip fidelity. Log the file and slug.
- **Citation with path pointing outside `sources/**` or `human/**`.**
  Store the path as-is in the `sources` row; MAINTAIN will later
  classify it as a raw orphan (it's not in the expected raw directories,
  so future COMPILE runs will ignore it).
- **Citation pointing to a raw file that no longer exists on disk.**
  RECOVER cannot know — it doesn't open raw files. The source row is
  created with `status='active'`. Post-recovery MAINTAIN will catch
  the discrepancy as a raw orphan (reverse direction — a source
  without a corresponding file).
- **Two wiki pages with colliding slugs.** Treated as a filing
  violation, not a RECOVER decision. Abort with a clear error; defer
  to MAINTAIN + human.
- **Wiki page with frontmatter type mismatching the directory.** Same
  as above — filing violation, not RECOVER's job to reconcile. Abort
  with an error naming the conflict.
- **Link target path inside `compiled_truth` that doesn't match any
  parsed page.** Insert the link anyway with the slug the path implies.
  MAINTAIN surfaces it as a dead link on the next pass.
- **Link inside a timeline entry (rather than compiled_truth).** Also
  parsed and inserted. Timeline entries are evidence; links they
  contain are equally valid.
- **Compiled truth containing an inline `^[...]` citation whose path
  is not already in the global citation set.** The path gets a new
  source row in phase 5. Citations inside timeline entries are parsed
  the same way.
- **Rendered page with additional sections beyond `## Timeline`.** The
  current render format is frontmatter + compiled_truth + `---` +
  `## Timeline`. Extra sections are out of contract; log and ignore
  them, or abort the entity? v1 default is log-and-ignore (preserves
  reach), but this blurs roundtrip fidelity. See Open questions.
- **Archived pages under `archive/`.** Skipped by default — they are
  retired wiki content and may not round-trip cleanly under the
  current schema. Caller can opt in to scanning `archive/`; see Open
  questions.

## Open questions

- **Inferred-link flag round-trip.** `links.inferred` distinguishes
  structural inference from evidence-based edges in COMPILE, but the
  current render format emits both as identical `[display](path.md)`
  markdown. RECOVER thus cannot reconstruct the distinction. Options:
  (a) render adds a marker (e.g., a trailing `{.inferred}` class or a
  frontmatter `inferred_links` array) that RECOVER parses; (b) accept
  the drift — all recovered links come back as `inferred=false`,
  MAINTAIN's duplicate-detection and cascade rules absorb the cost;
  (c) store inferred links in a side-channel file (e.g.,
  `inferred_links.json` per entity) in the wiki zone. Blocks full
  fidelity claim in invariant 1.
- **Link-type reconstruction.** Link verbs (`child_of`, `parent_of`,
  `uses`, etc.) are not encoded in the current markdown link syntax.
  V1 falls back to `link_type='references'`; the render would need to
  emit the verb (perhaps as `[display | child_of](path)` or in a
  frontmatter `edges:` array) for RECOVER to reconstruct it faithfully.
- **Citation date format variability.** `K2_SCHEMA.md` §Citation Format
  requires `YYYY-MM-DD`. What if an older rendered wiki carried
  different formats (ISO datetime, locale strings, `[[YYYY-MM-DD]]`
  wikilinks)? V1 default: strict ISO, reject others. Permissive mode
  is an Open question.
- **Content_hash for parsed sources.** RECOVER doesn't read raw files,
  so `content_hash` is not computable. Options: (a) store `NULL` and
  recompute on the next COMPILE pass when the file is actually read;
  (b) store a sentinel `"recovered"` marker so MAINTAIN knows to
  refresh; (c) require raw-zone access during RECOVER (contradicts
  invariant 2). v1 default: NULL; COMPILE recomputes on next pass.
- **Compile checkpoint post-recovery.** Three candidates: (a) set
  checkpoint to `null` so the next COMPILE re-extracts everything from
  the raw zone; (b) leave checkpoint untouched and let COMPILE
  continue from wherever it was; (c) set checkpoint to HEAD, trusting
  that the wiki is current. Each has failure modes: (a) is slow but
  safe; (b) drops raw changes that happened between the checkpoint
  and now; (c) silently skips real raw updates. v1 preference is (a)
  but needs decision.
- **Aggregate atomicity.** Per invariant 7, each entity is atomic, but
  what about a run that fails mid-phase-5 across 300 entities? Options:
  (a) all-or-nothing transaction across the whole run; (b) per-entity
  atomicity, accept that a crash leaves a partially populated DB; (c)
  write to a staging schema and swap on success. Mirrors COMPILE's
  transaction-boundary question.
- **Re-embedding determinism.** Two RECOVER passes produce the same
  text chunks, but embedding providers return floats that may differ
  slightly across calls. Strict invariant-5 equivalence may need
  carve-outs. Option: exclude embedding vectors from the equivalence
  relation (document explicitly).
- **Archived wiki content.** Pages under `archive/` are retired content.
  Skipped by default; whether caller can opt-in, and whether archived
  pages have the same schema shape as active pages, is undecided.
- **Canonical struct_hash serialization.** Inherited from COMPILE's
  open question. Must be resolved uniformly — two RECOVER passes on
  the same wiki must compute the same hash.
- **Extra wiki sections.** Current format is rigid
  (frontmatter + body + `---` + `## Timeline`). Future editors may add
  custom sections. V1 log-and-ignore, but this weakens invariant 1.
  Open whether such pages need to be rejected, quarantined, or
  accepted with a warning.
- **Verification-pass scope.** Phase 10 is optional. Is it "mandatory
  for `full` mode, optional for `selective`"? Always run in CI? Never
  run in production? No policy yet.
- **Chunking determinism for invariant 5.** The 3-tier chunker in
  `src/core/chunkers/` (recursive / semantic / LLM-guided) is not
  deterministic in all tiers. Strict idempotency requires pinning to a
  deterministic tier during recovery, or documenting that chunk
  boundaries are excluded from the equivalence relation.

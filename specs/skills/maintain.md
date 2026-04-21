# MAINTAIN

Quality enforcement across the wiki layer: surface drift between DB, wiki,
and raw zone; automatically repair the bounded set of safe fixes; flag
everything else for human review without blocking on a response.

## Layer reach

| Layer    | Access |
|----------|--------|
| Raw zone | R      |
| DB       | RUD    |
| Wiki     | RUD    |

**Writes:**
- `entities` (U) — only through re-render, which recomputes
  `compiled_truth`, `updated`, and `struct_hash` on an existing row.
- `links` (C limited / D) — creation is narrowly scoped to missing
  back-links derivable from existing edges (no new knowledge). Deletion
  covers dead links whose target entity is gone.
- `timeline_entries` (C) — appended when cascades remove a link, mirroring
  COMPILE's cascade rule in `K2_DESIGN.md` §COMPILE.
- `entity_sources` (D) — pruned when `delete_entity` cascades through a
  source-orphan deletion approved by the human.
- `content_chunks` (CUD) — refreshed when an entity re-renders; stale
  rows are removed before insert, same pattern COMPILE uses.
- wiki markdown files (U / D) — re-render overwrites an existing file;
  wiki-orphan removal deletes one after human approval.

**Reads:** `entities`, `links`, `timeline_entries`, `sources`,
`entity_sources`, `content_chunks`; raw-zone filesystem for raw-orphan
detection; wiki-zone filesystem for wiki-orphan and filing checks.

**Does NOT touch:**
- `human/**` or `sources/**` file contents — raw zone is read-only here.
- New entity rows — MAINTAIN never calls `compile_put_page` on a slug
  that doesn't exist (see Contract invariant 1).
- New `sources` rows — raw orphans are flagged, not auto-registered
  (see invariant 2).
- Wiki files for entities that have never rendered — creating a
  brand-new wiki file is COMPILE's job, even if the entity row already
  exists in the DB.
- The compile checkpoint in `config` — MAINTAIN is orthogonal to
  COMPILE's change-detection state.

## Contract

Testable invariants MAINTAIN guarantees.

1. **No entity creation.** MAINTAIN never creates a row in `entities`.
   If a wiki page references an entity that has no DB row, MAINTAIN
   surfaces it as a "dead link" or "wiki-orphan" depending on the
   direction of the mismatch — it does not invent the missing side.
2. **No source creation.** Raw orphans (files under `human/**` or
   `sources/**` that are not in the `sources` table) are surfaced for
   human review or COMPILE re-pickup. MAINTAIN never calls
   `register_source`.
3. **Append-only timeline.** MAINTAIN may append a new `timeline_entries`
   row when recording a cascaded link drop, but never mutates or removes
   an existing row. Mirrors COMPILE's invariant.
4. **Automated-fix scope is closed.** The set of fixes MAINTAIN is
   permitted to perform without human approval is exactly: re-render
   stale pages, create missing back-links, remove dead links. Any check
   that does not map to one of these three fixes routes to human review.
5. **Human review presents, doesn't force.** MAINTAIN emits a structured
   review list and returns. It does not block a session waiting for
   responses. Unresolved items re-surface on the next run; items the
   user acts on externally disappear from the next report.
6. **Idempotent under quiescence.** Running MAINTAIN against a vault
   with no drift produces no DB or wiki writes. Running it twice in a
   row after a fix pass produces no writes on the second run.
7. **Cascade via COMPILE ops.** Source-orphan deletion goes through
   `delete_entity` so the same cascade semantics (drop-link timeline
   entries on neighbours, prune `content_chunks`, remove wiki file)
   apply. MAINTAIN does not hand-roll its own cascade path.
8. **Reports are deterministic inputs.** The check phase is pure read;
   running it twice on the same DB + wiki state produces byte-identical
   findings (modulo timestamps). This is what makes diffing reports
   across runs useful.

## Dependencies

### CLI ops used

Pulled from `K2_DESIGN.md` §CLI operations per primitive. Ops named here
overlap freely with COMPILE's list — ops are a shared surface.

Reads used by the check phase:
- `list_entities` — enumerate all entities (page-wise iteration).
- `get_entity` — per-entity fetch for struct_hash, frontmatter, tags.
- `get_links` — inbound/outbound edges (back-link check, dead-link
  target resolution).
- `get_timeline` — for cascade bookkeeping.
- `search` — fuzzy/keyword lookup during duplicate detection.
- `query` — hybrid-search fallback for duplicate signals when keyword
  alone returns nothing useful.
- A source-registry read op — currently unnamed in `K2_DESIGN.md`; see
  Open questions. Needed to enumerate `sources` rows for raw-orphan and
  source-orphan detection.

Writes used by the automated-fix phase:
- `compile_render` — re-render a stale entity to its wiki file. Shared
  with COMPILE; contract is "DB → markdown for one entity".
- `compile_embed` — paired with re-render so `content_chunks` stays in
  sync.
- `add_link` — create a missing back-link. Always carries `inferred=false`
  and a context string recording the originating edge (the back-link is
  not structural inference, it is ledger symmetry).
- `delete_link` — remove a dead link. **Not yet named in COMPILE's
  dependency list**; see Open questions for op-naming.
- `add_timeline_entry` — append cascade-induced drop-link entries on
  entities affected by `delete_entity`.
- `delete_entity` — cascade-delete a source-orphan after human approval.
- `unlink_entity_source` — prune `entity_sources` during the same
  cascade when needed directly (usually called transitively via
  `delete_entity`).

### Other skills called

None at runtime. MAINTAIN does not invoke COMPILE, ASK, INGEST, or
RECOVER. Scheduling (run MAINTAIN before or after COMPILE) is an
outer-loop concern, not a skill dependency.

## Phases

Each run flows through three logical phases: **check** (pure read),
**auto-fix** (bounded writes), **review** (emit flags). Check results
drive both subsequent phases — there is no fix or flag that wasn't
discovered in check.

### 1. Check — detect drift

**Input:** the full DB and wiki state; raw-zone filesystem listing.
**Output:** a structured findings object, one list per check:
`stale`, `wiki_orphans`, `source_orphans`, `raw_orphans`, `dead_links`,
`missing_backlinks`, `missing_cross_refs`, `duplicate_candidates`,
`filing_violations`, `citation_gaps`.
**Ops:** `list_entities`, `get_entity`, `get_links`, `get_timeline`,
`search`, `query`, source-registry read. Plus filesystem scans of raw
and wiki zones.
**State change:** none.

Check definitions:
- **Stale entities** — `struct_hash` on the row does not match the hash
  implied by current `timeline_entries + links + tags + entity_sources`.
  This means a write landed that didn't propagate to render + embed.
- **Wiki orphans** — a markdown file under a category directory with no
  inbound link from any other wiki page (and no `entities` row? — see
  Open questions on exact definition).
- **Source orphans** — `entities` rows whose `entity_sources` count is
  zero after the latest COMPILE run. Surfaced for human decision, not
  auto-deleted.
- **Raw orphans** — files under `human/**` or `sources/**` whose path
  does not appear in `sources` with `status='active'`. Typically a file
  that was added but never compiled — flag for COMPILE, not MAINTAIN.
- **Dead links** — `links` rows whose `to_entity_id` no longer resolves
  to an entity. Candidate for the auto-fix phase.
- **Missing cross-references** — mentions of a known entity name inside
  another entity's `compiled_truth` that do not have a corresponding
  `links` row. Detection heuristic deferred to Open questions.
- **Missing back-links** — a `links` row from A→B whose canonical
  inverse verb does not have a matching row B→A. Inverse-verb mapping
  is a config surface; see Open questions.
- **Duplicate candidates** — pairs of entities with similar slugs,
  overlapping aliases, or high compiled_truth similarity. Scoring
  heuristic open.
- **Filing violations** — wiki markdown whose directory does not match
  its frontmatter `type`, or whose slug violates `K2_SCHEMA.md` §Entity
  Identity rules.
- **Citation gaps** — facts in `compiled_truth` not followed by an
  inline `^[...]` footnote. Detection is structural in v1; semantic
  checks deferred.

### 2. Auto-fix — bounded writes

**Input:** the subset of findings mapped to the closed fix set.
**Output:** a fix log enumerating every mutation (entity re-rendered,
back-link created, dead link removed) with before/after pointers.
**Ops:** `compile_render` + `compile_embed` (stale entities), `add_link`
(missing back-links), `delete_link` (dead links), `add_timeline_entry`
(cascade drop-link records when a dead-link removal coincides with an
entity deletion handled elsewhere).
**State change:** `entities.compiled_truth`, `entities.struct_hash`,
`entities.updated`, `content_chunks`, `links` (add + delete), selected
wiki markdown files.

Rules:
- A fix never runs if its check produced zero findings — no speculative
  passes.
- Back-link creation is idempotent: if B→A already exists, skip without
  error.
- Dead-link deletion is blind to "why" — if the target is gone, the
  link is removed. Target-recovery is a RECOVER responsibility.
- Stale-entity re-render runs `compile_render` and `compile_embed` as
  one logical unit; if embed fails, the run records partial state and
  surfaces the failure (behaviour on partial failure is an Open
  question, parallel to COMPILE's same gap).

### 3. Review — human-facing report

**Input:** all findings NOT consumed by the auto-fix phase, plus a
summary of automated fixes landed.
**Output:** a structured report object listing each review item with:
category (`source_orphan` / `ambiguous_duplicate` / `filing_dispute` /
`conflicting_evidence` / `wiki_orphan` / `raw_orphan` / `citation_gap` /
`missing_cross_ref`), the entities involved, the recommended action,
and a stable identifier so repeat runs can show "this is the third
time you've seen this item".
**Ops:** none. The report is a derived artifact; persistence location
is an Open question.
**State change:** none to the DB or vault beyond what the auto-fix
phase wrote. The report itself is emitted to the caller.

Unresolved items re-surface on the next run; acted-on items (e.g.,
entity deleted by human, filing corrected) disappear naturally because
the next check phase no longer detects them.

## Anti-patterns

- **Creating entities for "obviously referenced" slugs.** A wiki page
  mentions Cathy but there's no `entities` row — flag, don't create.
  New entity creation always routes through COMPILE's extraction.
- **Auto-registering raw orphans.** Walking `sources/**` and calling
  `register_source` on unknown files bypasses COMPILE's extraction
  pipeline. The file gets indexed but no entities link to it — worse
  than leaving the orphan.
- **Auto-resolving duplicates.** Merging two pages is irreversible
  enough that v1 always routes through human review, even when
  signals are strong.
- **Auto-resolving conflicting evidence.** Same rule COMPILE follows:
  present both sides with citations, never pick a winner in code.
- **Mutating existing timeline entries.** Append-only. If a cascade
  drops a link, write a NEW entry recording the drop — never edit an
  old entry to reflect the new state.
- **Writing to raw zone.** MAINTAIN reads raw files to detect orphans;
  it never edits or deletes them.
- **Creating a wiki file from scratch.** If an entity row exists but
  the wiki file is missing, flag for COMPILE to render. Do not
  synthesize the first render here.
- **Advancing the compile checkpoint.** MAINTAIN is orthogonal to
  COMPILE's checkpoint bookkeeping.
- **Retrying forever on LLM errors.** Re-render failures surface in
  the report and do not loop.

## Edge cases

- **Stale detection with the entity's wiki file missing.** The entity's
  struct_hash mismatches but render has never run (no file exists).
  Flag for COMPILE, not an auto-fix. MAINTAIN's re-render path assumes
  an existing file.
- **Back-link creation onto a link type with no registered inverse.**
  Skip — only verbs with a known inverse participate in back-link
  auto-fix. Unknown inverses are not guessed.
- **Dead link whose target entity is being revived (recovery in
  progress).** Timing concern: if MAINTAIN runs mid-RECOVER, a link
  may appear dead that is about to come back. Operational mitigation:
  MAINTAIN and RECOVER are not run concurrently. Spec-level mitigation
  is deferred to the scheduling Open question.
- **Duplicate detection across wiki zones with the same slug.**
  `K2_SCHEMA.md` §Entity Identity forbids cross-type slug reuse, so two
  `alice` entities (one people, one projects) is itself a filing
  violation and a duplicate candidate. Report under both categories.
- **Wiki orphan that is intentional (an archived page).** Today there's
  no "archived" metadata. When the design adds one, the check must
  exempt archived pages from the orphan list. Flagged in Open
  questions for spec evolution.
- **Source orphan that the human wants to keep.** Human dismisses the
  review item; subsequent runs still detect the orphan, but the
  dismissal must survive. Dismissal persistence is an Open question.
- **Filing violation where frontmatter `type` disagrees with
  directory.** Report without auto-fix; moving a file is cross-cutting
  (updates all inbound links). Human decides, then COMPILE re-renders.
- **Citation gap detected in a paragraph MAINTAIN cannot structurally
  attribute.** Flag with the exact span; do NOT guess the missing
  citation.

## Open questions

- **`delete_link` op naming and spec.** COMPILE's dependency list does
  not include a link-delete op. Candidates: (a) add `delete_link`
  alongside `add_link` as a first-class primitive; (b) fold deletion
  into a future `reconcile_links(entity, edges[])` op that reconciles
  an entity's full edge set; (c) rename MAINTAIN's dead-link fix to
  call `delete_entity` on phantom targets, letting cascade remove the
  incoming edges (no direct link-delete needed). Option (a) is
  straightforward; (b) is cleaner at scale; (c) only works when the
  dead-link cause is a missing entity, not a targeting bug.
- **Back-link inverse-verb registry.** Which verbs have inverses, and
  where is the mapping stored? Candidates: (a) config file in
  `config` table; (b) per-link-type metadata on a new `link_types`
  table; (c) heuristic mapping in code. Blocks the back-link auto-fix.
- **Duplicate detection scoring.** What combination of signals
  (slug Levenshtein, alias Jaccard, compiled_truth embedding cosine,
  co-citation count) produces the `duplicate_candidates` list, and
  with what threshold? Undefined.
- **Missing cross-reference detection.** Structural only (string match
  of known titles/aliases against compiled_truth) vs. semantic
  (LLM-driven mention detection). Structural is cheap and noisy;
  semantic is expensive and fuzzy. v1 default is undecided.
- **Citation-gap detection.** Fact-granular (every sentence should
  carry a footnote) vs. block-granular (every paragraph must end
  with at least one citation). Too aggressive produces false-positive
  churn; too lax misses real drift.
- **Scheduling.** Is MAINTAIN a cron job, a post-COMPILE hook, a
  user-initiated command, or all three? Interaction with RECOVER is
  also undefined (see Edge cases, dead-link timing).
- **Report persistence.** Where does the review list live? Options:
  (a) stdout only (ephemeral); (b) `reports/` directory on disk;
  (c) a `maintenance_log` DB table; (d) append to a dedicated wiki
  page under `archive/`. Persistence is also what enables dismissal
  tracking.
- **Dismissal persistence.** When a human looks at a review item and
  decides "ignore this, it's fine", MAINTAIN must remember. Storage
  surface is tied to the report-persistence question.
- **Filing-violation auto-fix.** Moving a wiki file across directories
  updates inbound links. Listed here as not-auto-fixed because
  correctness requires a link-rewrite pass across the whole wiki. If
  `compile_render` is re-run on every affected page, it might be safe
  — but that's a multi-entity transaction and outside the current
  fix-set scope.
- **Partial auto-fix failure policy.** Mirrors COMPILE's open question
  on LLM extraction failures: retry, skip, or abort the run? Should
  match COMPILE's eventual answer.
- **Entity-present, wiki-missing.** The design says "re-render stale
  pages"; the CRUD table says MAINTAIN is RUD on wiki (no C). The
  spec currently routes missing wiki files to COMPILE for first
  render. If that interpretation is wrong, either MAINTAIN's wiki
  reach becomes CRUD (narrowly, for first-render recovery) or the
  design text needs to carve out this case explicitly.

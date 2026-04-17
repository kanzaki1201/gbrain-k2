---
name: zettel-processor
version: 2.0.0
description: |
  Compile human zettels from human/zettel/ into wiki category pages. Detect
  archival candidates (wholesale + stable) and surface them for human approval
  via the maintenance channel. Execute archival moves to archive/human/zettel/
  only on explicit approval. Never writes to or modifies human/ otherwise.
triggers:
  - "process zettels"
  - "compile zettels"
  - "check zettel archival candidates"
  - "archive zettel"
  - new or updated file in human/zettel/
tools:
  - search
  - query
  - get_page
  - put_page
  - add_link
  - add_timeline_entry
mutating: true
---

# Zettel Processor Skill

Compile atomic human zettels into the wiki while keeping the zettels themselves
sacred. The wiki compounds; the zettels stay intact as primary-source evidence.

> **Filing rule:** Read `skills/_brain-filing-rules.md` before creating any new
> page. Read `~/gbrain-k2/K2_SCHEMA.md` Operating Principle 5 for the zettel/archival
> contract.

## Contract

- Zettels under `human/zettel/` are read-only. The only mutation permitted is
  the archival move, gated on explicit human approval.
- Every compiled zettel produces at least one artifact: a wiki page, a timeline
  entry on an existing wiki page, or an inbox flag for unclear content.
- Every compiled wiki page cites its contributing zettel(s) in a `## Sources`
  body section with markdown links to current paths.
- Updated zettels re-compile affected pages; stale compiled content is rewritten, not appended to.
- Archival candidates are queued for `maintain` to surface via messaging. This
  skill never messages the human directly in async mode.

## Iron Law: Back-Linking (MANDATORY)

Every entity mentioned in a compiled zettel gets a back-link from that entity's
page to the zettel (via the wiki page that cites it, transitively). An unlinked
mention is a broken brain. See `skills/_brain-filing-rules.md` for format.

## When To Fire

- New or updated file in `human/zettel/` detected by `maintain`
- User command: "process my zettels", "compile zettels"
- User approval of a specific archival candidate: "archive zettel X"

Does NOT fire on wiki-page edits (that's `enrich`), on imported sources under
`sources/` (that's bootstrap compile), or on low-notability captures like URL
clippings (that's `idea-ingest` / `media-ingest`).

## Phases

### 1. Discover

List zettels in `human/zettel/`. For each, classify as `new`, `updated`,
`stable-compiled`, or `candidate-for-archival`:

- **New** — no existing wiki page cites this zettel.
- **Updated** — wiki pages cite it AND mtime > last compile timestamp.
- **Stable-compiled** — wiki pages cite it AND mtime is older than 7 days.
- **Candidate** — stable-compiled AND exactly one wiki page cites it AND that
  page's Compiled Truth fully subsumes the zettel content.

### 2. Compile (new + updated)

For each zettel:

1. Read content. Apply `_brain-filing-rules.md` + `repo-architecture/SKILL.md`
   decision tree to find primary category + entities.
2. Decide shape:
   - **Wholesale** — content maps 1:1 to one wiki page. Create or update that
     page.
   - **Multi-target** — contributes to multiple pages (person timeline,
     project timeline, etc.). Fan out.
   - **Unclear** — flag in `inbox/` with a reason; do not guess.
3. For each affected wiki page: update `## Sources` with a markdown link to
   the zettel, append a dated timeline entry, and cross-link entities per
   Iron Law.
4. Do NOT modify the zettel itself. Preserve its mtime.

### 3. Queue archival candidates

Candidates from Phase 1 are packaged for `maintain` with: zettel path,
compiled-to path, stable-since date, one-sentence rationale. No move happens
here.

### 4. Execute archival (only on explicit approval)

When the human approves a specific candidate:

1. Re-verify candidacy — if the zettel has been edited since prompt emission,
   candidacy lapses; re-run Phase 3 next cycle.
2. `mv human/zettel/{name}.md archive/human/zettel/{name}.md`.
3. Rewrite markdown-link citations in affected wiki pages from the old path to
   the new path.
4. Log the move in `maintain`'s report.

If the human denies archival, record the denial and exclude from candidacy
for a 30-day cooldown.

## Output Format

- Per-run log line: `Zettels: N new, M updated, K inbox-flagged, C candidates`
- Async mode: structured candidate list handed to `maintain` (fields: path,
  compiled_to, stable_since, rationale)

## Interactions

- `signal-detector` — defers human zettels to this skill, does not touch them
- `enrich` — invoked by this skill when a compile needs person/company page
  creation
- `maintain` — calls this skill every cycle, surfaces candidates via messaging
- `ingest` — handles low-notability captures; zettels always route here

## Anti-Patterns

- Modifying a zettel's content. Never — not even typo fixes. Flag to human.
- Moving a zettel without explicit approval. Archival is human-gated per zettel.
- Classifying a multi-target or partially-compiled zettel as archival. Multiple
  citations or uncaptured content means it stays live.
- Bulk archival ("archive all stable zettels"). No batch operation exists.
- Scanning outside `human/zettel/`. This skill's scope is human-authored
  atomic zettels only.
- Silent drift. If updated zettel content contradicts existing Compiled Truth,
  rewrite the Compiled Truth and note the divergence in timeline — never
  append conflicting content silently.

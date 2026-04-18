---
name: zettel-processor
version: 2.0.0
description: |
  Compile human zettels from human/zettel/ into wiki category pages. Detect
  archival candidates (wholesale + stable, plus mature multi-target review
  cases) and surface them for human approval in the zettel-processor pass.
  Execute archival moves to human/zettel/archive/ only on explicit approval.
  Never writes to or modifies human/ otherwise.
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

> **Recommended cadence:** waking-hours scheduled pass (commonly evening) so the
> human can react to what was compiled.

> **Filing rule:** Read `skills/_brain-filing-rules.md` before creating any new
> page. Read `~/gbrain-k2/K2_SCHEMA.md` Operating Principle 5 for the zettel/archival
> contract.

## Contract

- Zettels under `human/zettel/` are read-only. The only mutation permitted is
  the archival move, gated on explicit human approval.
- Human intent outranks candidacy heuristics. A zettel that would not qualify as
  an archival candidate can still be archived when the human explicitly says so
  or manually moves it into `human/zettel/archive/`.
- Every compiled zettel produces at least one artifact: a wiki page, a timeline
  entry on an existing wiki page, or an inbox flag for unclear content.
- Every compiled wiki page cites its contributing zettel(s) in a `## Sources`
  body section with markdown links to current paths.
- Updated zettels re-compile affected pages; stale compiled content is rewritten, not appended to.
- Archival candidates are surfaced by the scheduled zettel-processor pass in
  its own report/output. This skill owns zettel compilation and zettel-review
  surfacing.

## Iron Law: Back-Linking (MANDATORY)

Every entity mentioned in a compiled zettel gets a back-link from that entity's
page to the zettel (via the wiki page that cites it, transitively). An unlinked
mention is a broken brain. See `skills/_brain-filing-rules.md` for format.

## When To Fire

- New or updated file in `human/zettel/` detected by the zettel-processor pass
- User command: "process my zettels", "compile zettels"
- User approval of a specific archival candidate: "archive zettel X"
- Human explicitly says a non-candidate zettel can be archived
- Human manually moved a zettel into `human/zettel/archive/`

Does NOT fire on wiki-page edits (that's `enrich`), on imported sources under
`sources/` (that's bootstrap compile), or on low-notability captures like URL
clippings (that's `idea-ingest` / `media-ingest`).

## Phases

### 1. Discover

**Discovery is a filesystem operation, not a semantic search.** The list of
zettels to process lives on disk under `human/zettel/`, and whether a zettel
has been compiled is determined by which wiki pages cite it via markdown links.
Do NOT use `gbrain query` or `gbrain search` for this — those are for content
lookup, not file tracking, and will return irrelevant results.

**List active zettels:**

```bash
find ~/brain-vault/human/zettel -maxdepth 1 -name "*.md" -type f
```

**For each zettel, find wiki pages that cite it:**

```bash
# Substitute <basename> with the zettel filename without extension
grep -rl "human/zettel/<basename>" ~/brain-vault \
  --include="*.md" \
  --exclude-dir=human \
  --exclude-dir=sources \
  --exclude-dir=.git \
  --exclude-dir=.obsidian
```

A zettel with zero matches is `new`. A zettel with matches AND `mtime >
last-compile timestamp on any citing page` is `updated`. Otherwise `stable-compiled`.

**Classification:**

- **New** — no existing wiki page cites this zettel.
- **Updated** — wiki pages cite it AND the zettel's mtime is newer than the
  last timeline entry on any citing page.
- **Stable-compiled** — wiki pages cite it AND mtime is older than 7 days.
- **Candidate for archival** — either:
  - stable-compiled AND exactly one wiki page cites it AND that page's
    Compiled Truth fully subsumes the zettel content, or
  - a mature multi-target zettel that is long, stable, and clearly functioning
    as a source reservoir rather than active live writing.

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

Candidates from Phase 1 are packaged into the zettel-processor pass output
with: zettel path, compiled-to path, stable-since date, one-sentence rationale.
No move happens here.

### 3.5 Respect explicit human archival intent

If the human explicitly says a specific zettel can be archived, archival may
proceed even when the zettel is multi-target, partial-use, or otherwise outside
the normal candidate heuristic.

If the human has already manually moved the zettel into `human/zettel/archive/`:

1. Treat the new archived path as authoritative.
2. Rewrite markdown-link citations in affected wiki pages from the old path to
   the archived path.
3. Do not second-guess the move with candidacy rules.

### 4. Execute archival (only on explicit approval)

When the human approves a specific candidate:

1. Re-verify candidacy — if the zettel has been edited since prompt emission,
   candidacy lapses; re-run Phase 3 next cycle.
2. `mv human/zettel/{name}.md human/zettel/archive/{name}.md`.
3. Rewrite markdown-link citations in affected wiki pages from the old path to
   the new path.
4. Log the move in the zettel-processor report.

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

- **Using `gbrain query` or `gbrain search` to discover zettels.** These are
  semantic/keyword search over COMPILED brain content, not a filesystem tracker.
  Asking "which zettels need compiling?" returns garbage because the DB has no
  concept of unprocessed files. Always use `find`/`ls` on `human/zettel/` and
  `grep -r` for citation lookup. If a past run reported "no zettels to compile"
  via `gbrain query`, that report was a hallucination — redo Phase 1 with the
  shell commands above.
- Modifying a zettel's content. Never — not even typo fixes. Flag to human.
- Moving a zettel without explicit approval. Archival is human-gated per zettel.
- Classifying a multi-target or partially-compiled zettel as archival. Multiple
  citations or uncaptured content means it stays live unless the human approves
  archival or maintenance deliberately surfaces it as a mature review candidate.
- Overriding explicit human archival intent with candidacy heuristics. Human
  intent is authoritative.
- Bulk archival ("archive all stable zettels"). No batch operation exists.
- Scanning outside `human/zettel/`. This skill's scope is human-authored
  atomic zettels only.
- Silent drift. If updated zettel content contradicts existing Compiled Truth,
  rewrite the Compiled Truth and note the divergence in timeline — never
  append conflicting content silently.

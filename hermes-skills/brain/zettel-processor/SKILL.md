---
name: zettel-processor
description: Compile human zettels from human/zettel/ into wiki category pages. Detect
  archival candidates (wholesale + stable, plus mature multi-target review cases)
  and surface them for human approval via the maintenance channel. Execute archival
  moves to human/zettel/archive/ only on explicit approval. Never writes to or modifies
  human/ otherwise.
version: 2.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - zettel-processor
    related_skills:
    - enrich
    - idea-ingest
    - ingest
    - maintain
    - media-ingest
    - query
    - repo-architecture
    - signal-detector
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/zettel-processor/SKILL.md
    blueprint_sha256: d743636aed0186f855200eb0870c7d65ef9ab5c6238e53780dd3560eddca504e
    generated_from: gbrain-k2/skills
---

# Zettel Processor Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `zettel-processor` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- process zettels
- compile zettels
- check zettel archival candidates
- archive zettel
- new or updated file in human/zettel/
- Blueprint source: `/home/k/gbrain-k2/skills/zettel-processor/SKILL.md`
- This projection keeps the source doctrine while translating execution into Hermes-standard tools and `gbrain` CLI commands.

## Quick Reference
| Need | Hermes move |
|---|---|
| Run `gbrain` commands | `terminal` |
| Read source blueprints or repo docs | `read_file` |
| Search markdown and docs | `search_files` |
| Edit local markdown or config | `patch` / `write_file` |
| Delegate a larger workflow | `delegate_task` |
| Schedule recurring checks | `cronjob` |

## Procedure
1. Read `references/blueprint.md` when exact K2 wording matters, then follow the source workflow exactly.
2. Use Hermes-native tools for execution: run `gbrain ...` through `terminal`, inspect local markdown with `read_file` and `search_files`, and patch files with `patch` or `write_file` when the task needs repository edits.
3. Keep the blueprint as the authority for filing rules, quality bar, and chaining behavior. Translate source-only tool names into Hermes capabilities instead of assuming custom GBrain tools exist inside Hermes.

### Blueprint Contract

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
- Archival candidates are queued for `maintain` to surface via messaging. This
  skill never messages the human directly in async mode.

### Blueprint Phases

### 1. Discover

List zettels in `human/zettel/`. For each, classify as `new`, `updated`,
`stable-compiled`, or `candidate-for-archival`:

- **New** — no existing wiki page cites this zettel.
- **Updated** — wiki pages cite it AND mtime > last compile timestamp.
- **Stable-compiled** — wiki pages cite it AND mtime is older than 7 days.
- **Candidate** — either:
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

Candidates from Phase 1 are packaged for `maintain` with: zettel path,
compiled-to path, stable-since date, one-sentence rationale. No move happens
here.

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
2. `mv human/zettel/{name}.md archive/human/zettel/{name}.md`.
3. Rewrite markdown-link citations in affected wiki pages from the old path to
   the new path.
4. Log the move in `maintain`'s report.

If the human denies archival, record the denial and exclude from candidacy
for a 30-day cooldown.

## Pitfalls
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

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
- Per-run log line: `Zettels: N new, M updated, K inbox-flagged, C candidates`
- Async mode: structured candidate list handed to `maintain` (fields: path,
  compiled_to, stable_since, rationale)
```

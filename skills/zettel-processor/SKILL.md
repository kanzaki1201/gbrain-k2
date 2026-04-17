---
name: zettel-processor
version: 1.0.0
description: |
  Process human zettels. Compiles zettels from human/zettel/ into wiki
  category pages, detects archival candidates (1:1 wholesale + stable),
  surfaces archival prompts via the maintenance messaging channel, and
  performs human-approved moves to sources/human/archive/zettel/. NEVER
  writes to, modifies, or moves files in human/ except the approved archival
  move. Fires during bootstrap AND on every maintenance cycle.
triggers:
  - "process zettels"
  - "compile zettels"
  - "check zettel archival candidates"
  - new or updated file in human/zettel/ (during maintenance)
tools:
  - search
  - query
  - get_page
  - put_page
  - add_link
  - add_timeline_entry
mutating: true
---

# Zettel Processor

Compiles human-authored atomic zettels into wiki category pages while keeping
the zettels themselves sacred. Detects archival candidates and surfaces them
for human approval via the maintenance messaging channel. Performs the
archival move only when the human explicitly approves.

> **Read first:** `docs/K2_SCHEMA.md` (Operating Principle 5) and
> `skills/_brain-filing-rules.md`. This skill is the one place in k2 that
> writes to `sources/`, and even then only via human-approved archival.

## Contract

This skill guarantees:

- Every zettel under `human/zettel/` is read-only from the agent's perspective
  except during an explicitly human-approved archival move.
- Every zettel produces or updates at least one compiled artifact: either a
  wiki category page, or entity timeline entries on existing wiki pages, or
  (for unclear content) an inbox flag for human review.
- Every wiki page compiled from a zettel has a `## Sources` body section
  citing the zettel by wikilink path.
- Archival candidates are surfaced via the maintenance messaging channel; the
  agent NEVER performs the archival move autonomously.
- Updated zettels trigger re-compile of affected wiki pages; stale compiled
  content is replaced (never silently kept).

## Iron rules (non-negotiable)

- **Never write to `human/`** except the one archival move, which requires
  explicit human approval and only moves files, never modifies content.
- **Never edit a zettel's content** — period. If the zettel has bad content,
  surface it to the human via maintenance channel, do NOT fix it.
- **Never delete a zettel.** Archival is a MOVE to `sources/human/archive/zettel/`,
  not a deletion. The file content is preserved unchanged.
- **Never infer archival approval.** The human must explicitly say "archive
  zettel X" (or equivalent) via the maintenance channel. Heuristic approval
  is forbidden.

## When to fire

| Trigger | Mode | Prompt channel |
|---------|------|----------------|
| Bootstrap intake (initial compile) | Synchronous, interactive. Per zettel: compile → ask human "keep live in human/zettel/ or archive to sources/human/archive/zettel/?" → act on answer. | Direct AskUserQuestion-style interaction in the intake session. |
| Maintenance cron | Asynchronous. Scan `human/zettel/` for zettels with mtime > last-run timestamp. Compile new/updated zettels. Queue archival candidates (stable + 1:1 wholesale). | Batched prompts via the maintenance skill's messaging channel (telegram/etc.). Human replies trigger the archival execution on the next cycle. |
| Human command: "process my zettels" | Synchronous. Same as maintenance cron but flushed immediately. | Interactive if in a session, messaging if not. |
| Human command: "archive zettel X" | Synchronous. Verify candidacy, execute move, update citations. | N/A — direct command. |
| Wiki page edited whose source was a zettel | No action from this skill. Normal enrich flow handles wiki-page changes. |

## Phases

### Phase 1: Discovery

1. List zettels in `human/zettel/` recursively. For each zettel, determine:
   - Is it NEW (no existing wiki page cites it)?
   - Is it UPDATED (existing wiki pages cite it AND its mtime exceeds last
     compile timestamp)?
   - Is it STABLE (no recent edits — threshold: 7 days since last mtime)?
2. Partition zettels into: `new`, `updated`, `stable-already-compiled`,
   `stable-candidates-for-archival`.

### Phase 2: Compile (for new and updated)

For each zettel:

1. Read the zettel content.
2. Apply `skills/_brain-filing-rules.md` + `skills/repo-architecture/SKILL.md`
   decision tree to determine primary category + entities mentioned.
3. Determine compile shape:
   - **Wholesale compile:** the zettel's entire content maps to ONE wiki page
     in one category (e.g., a "how to parent a rig" zettel → `how-to/parent-rig.md`).
     Create or update that wiki page.
   - **Partial / multi-target compile:** the zettel contributes to multiple
     wiki pages (e.g., a zettel describing a meeting with Alice about project
     X — contributes to `people/alice.md` timeline, `projects/x.md` timeline,
     possibly a meeting page). Fan out to all affected pages.
   - **Unclear:** cannot determine a clean category. Create an inbox entry
     with a flag and a pointer to the zettel.
4. For every affected wiki page:
   - Add or update the `## Sources` body section with a wikilink to the zettel
     at its `human/zettel/...` path.
   - Add a dated timeline entry citing the zettel.
   - Cross-link to related entities bidirectionally (Iron Law).
5. **Do NOT modify the zettel.** The zettel stays in `human/zettel/`
   untouched, with its exact current mtime preserved.

### Phase 3: Archival candidacy check

For each zettel classified `stable-already-compiled` in Phase 1:

1. Verify wholesale-compile status: exactly ONE wiki page cites this zettel,
   AND that wiki page's Compiled Truth fully subsumes the zettel's content
   (no material meaning left uncaptured).
2. Verify stability: mtime > 7 days ago, AND no new citations added to other
   wiki pages since last run.
3. If both checks pass, the zettel is an archival candidate. Record:
   - Zettel path
   - Destination path (`sources/human/archive/zettel/{basename}`)
   - Single compiled wiki page
   - Rationale (1-2 sentence summary of why this is a clean 1:1 promotion)

Archival candidates are NOT moved in this phase. They are queued for the
maintenance skill's prompt emission.

### Phase 4: Prompt emission (mode depends on trigger)

**Bootstrap / interactive mode.** Ask the human directly, per zettel, as the
compile happens:

> Zettel `2026-02-04-some-rigging-test.md` compiled into
> [[how-to/parent-rig-in-blender]]. The compile looks wholesale (single wiki
> page covers the content).
>
> Keep live in `human/zettel/`, or archive to `sources/human/archive/zettel/`?

Batch pragmatically — if a session has 100+ zettels to compile, group the
archival questions every ~10-20 zettels rather than blocking on each
individually. Ask: "Here are N zettels I compiled. Which should be archived
vs kept live?"

**Maintenance / async mode.** Return a structured result to the maintenance
skill:

```yaml
zettel-processor-result:
  run_at: 2026-04-16T18:00:00Z
  new_compiled: N
  updated_recompiled: M
  inbox_flagged: K
  archival_candidates:
    - path: human/zettel/2026-02-04-some-rigging-test.md
      compiled_to: how-to/parent-rig-in-blender.md
      stable_since: 2026-04-01
      rationale: "Zettel content fully captured in how-to page;
                  no edits in 14 days; no other wiki pages cite it."
    - path: human/zettel/2026-01-28-photopea-chroma-key.md
      compiled_to: how-to/photopea-chroma-key.md
      stable_since: 2026-03-20
      rationale: "Zettel fully expanded into standalone how-to page."
```

The maintenance skill formats these for the configured messaging channel
(telegram, email, etc.) and surfaces to the human. This skill does NOT
directly message the human in async mode; that's maintenance's responsibility.

### Phase 5: Archival execution (only on explicit human approval)

When the human replies with approval for a specific zettel (e.g., "archive
zettel 2026-02-04-some-rigging-test"), execute the move:

1. Verify the zettel is still an archival candidate at the time of move
   (content hasn't been re-edited since prompt emission; if it has, the
   candidacy lapses — re-run Phase 3 on next cycle).
2. `mv ~/brain-vault/human/zettel/{name}.md ~/brain-vault/sources/human/archive/zettel/{name}.md`
3. Update the citing wiki page's `## Sources` section and any timeline entries
   to use the new `sources/human/archive/zettel/` path.
4. Grep for any other wiki pages that might reference the old path and update
   them. (Obsidian basename-wikilinks continue to work without rewriting;
   full-path references in `## Sources` sections need explicit update.)
5. Log the move in the maintenance report for the human's confirmation.

If the human explicitly DENIES archival ("no, keep it live"), record that
denial in the zettel's record and exclude it from candidacy for a cooldown
period (e.g., 30 days).

## Interactions with other skills

- `signal-detector` — does NOT touch zettels directly. If signal-detector
  encounters a human zettel reference during stream processing, it notes it
  as deferred to zettel-processor and moves on.
- `enrich` — invoked by this skill to produce wiki pages when compile shape
  requires richer page creation (people, companies pages).
- `ingest` — routes low-notability inputs (clippings, quick URL captures);
  does NOT process zettels. Zettels always go through zettel-processor.
- `maintain` — invokes this skill on every cycle. Consumes the structured
  result and emits prompts to the messaging channel.

## Anti-Patterns

- **Modifying a zettel's content.** Never. Not even to fix typos.
- **Moving a zettel without explicit human approval.** Never. Archival is
  human-gated.
- **Classifying a partial-use zettel as archival candidate.** Multiple-page
  citations or uncaptured content means the zettel stays live.
- **Re-creating archived content.** If a zettel was archived, do NOT
  re-create it in `human/zettel/`. If the human wants to extend the content,
  they write a new zettel that references the archived one.
- **Silent content drift.** If updated zettel content contradicts existing
  wiki Compiled Truth, rewrite the Compiled Truth (never append conflicting
  content silently). Note the divergence in the timeline with a reference to
  the zettel's edit date.
- **Bulk autonomous archival.** Archival decisions are per-zettel and per-
  approval. No "archive all stable zettels" batch operation.
- **Scanning outside `human/zettel/`.** This skill only looks at human-authored
  zettels. Imported content (`sources/imports/`) is handled by standard
  bootstrap compile, not zettel-processor.

## Output Format

No direct visible output during compile phase — wiki pages are created/updated
silently.

Per-run log line (same shape as signal-detector):

```
Zettels: 3 new compiled, 2 updated recompiled, 1 inbox flagged, 5 archival candidates
```

Structured result for the maintenance skill (async mode only):

```yaml
zettel-processor-result:
  run_at: <ISO timestamp>
  new_compiled: N
  updated_recompiled: M
  inbox_flagged: K
  archival_candidates:
    - path: human/zettel/<basename>.md
      compiled_to: <category>/<slug>.md
      stable_since: <ISO date>
      rationale: <1-2 sentence summary>
```

Interactive bootstrap output is a series of AskUserQuestion prompts with the
compile result and archive-or-keep question, processed in batches.

## Tools Used

- Filesystem read of `human/zettel/` — non-mutating inspection.
- `search` — look for existing wiki pages citing a zettel.
- `query` — semantic search across the corpus for related content.
- `get_page` / `put_page` — read and write wiki pages.
- `add_link` / `add_timeline_entry` — cross-reference and timeline
  maintenance.
- Filesystem move for the archival step — ONLY after explicit human approval.

---
name: signal-detector
description: Always-on ambient signal capture. Fires on every inbound message to detect
  original thinking and entity mentions. Spawn as a cheap sub-agent in parallel, never
  block the main response.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - signal-detector
    related_skills:
    - enrich
    - query
    - zettel-processor
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/signal-detector/SKILL.md
    blueprint_sha256: 7210d0d0e1d0e525bb1216dd9d0f810caa7ef438b9b1fe6dd0172680606ced97
    generated_from: gbrain-k2/skills
---

# Signal Detector — Ambient Brain Capture — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `signal-detector` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- every inbound message (always-on)
- Blueprint source: `/home/k/gbrain-k2/skills/signal-detector/SKILL.md`
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

This skill guarantees:
- Fires on every message (no exceptions unless purely operational)
- Runs in parallel (spawned, never blocks main response)
- Captures ideas with the user's EXACT phrasing (no paraphrasing)
- Detects entity mentions and creates/enriches brain pages
- Logs a one-line summary of what was captured
- Back-links all entity mentions (Iron Law)
- Citations on every fact written

### Blueprint Phases

### Phase 1: Idea/Observation Detection (PRIMARY)

When the user expresses a novel thought, observation, thesis, or framework,
route by content type:

- **Reusable framework or mental model** they could teach → `concepts/{slug}`
- **Unexecuted product or business idea** → `ideas/{slug}`
- **Long-form prose** (essay, draft, argument) → `writing/{slug}`
- **Private reflection** (health, habits, body, personal notes) → `personal/{slug}`
- **Decision record** (option, rationale, outcome tracking) → `decisions/{slug}`
- **How-to / process / troubleshoot fix** → `how-to/{slug}`
- **Atomic thought** that doesn't cleanly fit the above → stays in
  `human/zettel/` (the zettel-processor skill handles ongoing compile and
  archival for human zettels; signal-detector does NOT file atomic thoughts
  into the wiki directly).

**Capture exact phrasing.** The user's language IS the insight. Don't paraphrase.

**Never write to, modify, or move anything in `human/`.** Signal-detector
reads from human/ and enriches downstream category pages. Zettel archival is
gated through the zettel-processor skill with explicit human approval.

**Cross-linking (MANDATORY):** Every compiled thinking page MUST link to related
people, companies, meetings, and concepts. A compiled page without cross-links
is a dead page.

### Phase 2: Entity Detection (SECONDARY)

1. Extract entity mentions (people, companies, media titles)
2. For each entity:
   - `gbrain search "name"` — does a page exist?
   - If NO page → check notability. If notable, create page with enrichment.
   - If page exists but THIN → trigger enrich
   - If page exists and RICH → no action
3. For new FACTS about existing entities → add timeline entry

### Phase 3: Signal Logging

Always log a one-line summary:
- `Signals: 0 ideas, 0 entities, 0 facts (skipped: operational)`
- `Signals: 1 idea (captured → concepts/x), 2 entities (enriched → people/y, companies/z)`
- `Signals: 1 zettel noted (→ deferred to zettel-processor)`

This makes the ambient capture loop debuggable.

### Source Tool Intent

These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.

- `search` — check if entity page exists
- `query` — semantic search for related context
- `get_page` — load existing entity pages
- `put_page` — create/update brain pages
- `add_link` — cross-reference entities
- `add_timeline_entry` — record events on entity timelines

## Pitfalls
- Blocking the main response to wait for signal detection to complete
- Paraphrasing the user's original thinking instead of capturing exact phrasing
- Creating pages for non-notable entities (one-off mentions)
- Skipping back-links after creating/updating pages
- Running on purely operational messages ("ok", "thanks", "do it")
- Writing to, modifying, or moving anything under `human/`
- Moving source pages out of `sources/` — compile a parallel wiki page that
  cites the source; leave the source in place
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
No visible output to the user. This skill runs silently in the background.
The output is brain pages created/updated and the signal log line.
```

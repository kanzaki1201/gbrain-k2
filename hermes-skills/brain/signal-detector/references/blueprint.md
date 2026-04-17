---
name: signal-detector
version: 1.0.0
description: |
  Always-on ambient signal capture. Fires on every inbound message to detect
  original thinking and entity mentions. Spawn as a cheap sub-agent in parallel,
  never block the main response.
triggers:
  - every inbound message (always-on)
tools:
  - search
  - query
  - get_page
  - put_page
  - add_link
  - add_timeline_entry
mutating: true
---

# Signal Detector — Ambient Brain Capture

Lightweight sub-agent that fires on every inbound message to capture TWO things
with EQUAL priority:

1. **Original thinking** — the user's ideas, observations, theses, frameworks
2. **Entity mentions** — people, companies, media references

Original thinking is AT LEAST as valuable as entity extraction. Ideas are the
intellectual capital. Entities are bookkeeping. Both compound over time.

## Contract

This skill guarantees:
- Fires on every message (no exceptions unless purely operational)
- Runs in parallel (spawned, never blocks main response)
- Captures ideas with the user's EXACT phrasing (no paraphrasing)
- Detects entity mentions and creates/enriches brain pages
- Logs a one-line summary of what was captured
- Back-links all entity mentions (Iron Law)
- Citations on every fact written

## Iron Law: Back-Linking (MANDATORY)

Every time this skill creates or updates a brain page that mentions a person or company:
1. Check if that person/company has a brain page
2. If yes → add a back-link FROM their page TO the page you just created/updated
3. Format: `- **YYYY-MM-DD** | Referenced in [page title](path) — brief context`
4. An unlinked mention is a broken brain.

## Phases

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

## Output Format

No visible output to the user. This skill runs silently in the background.
The output is brain pages created/updated and the signal log line.

## Anti-Patterns

- Blocking the main response to wait for signal detection to complete
- Paraphrasing the user's original thinking instead of capturing exact phrasing
- Creating pages for non-notable entities (one-off mentions)
- Skipping back-links after creating/updating pages
- Running on purely operational messages ("ok", "thanks", "do it")
- Writing to, modifying, or moving anything under `human/`
- Moving source pages out of `sources/` — compile a parallel wiki page that
  cites the source; leave the source in place

## Tools Used

- `search` — check if entity page exists
- `query` — semantic search for related context
- `get_page` — load existing entity pages
- `put_page` — create/update brain pages
- `add_link` — cross-reference entities
- `add_timeline_entry` — record events on entity timelines

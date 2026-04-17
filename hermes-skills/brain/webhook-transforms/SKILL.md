---
name: webhook-transforms
description: Generic framework for converting external events (SMS, meetings, social
  mentions) into brain-ingestible signals. Define a transform function, register a
  webhook URL, and incoming events get processed through the brain pipeline.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - webhook-transforms
    related_skills:
    - enrich
    - ingest
    - meeting-ingestion
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/webhook-transforms/SKILL.md
    blueprint_sha256: b774293297af4d513c7efa92a79cf65b8438a714adafc16802b492613e679d17
    generated_from: gbrain-k2/skills
---

# Webhook Transforms — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `webhook-transforms` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- set up webhook
- process webhook event
- transform this event
- Blueprint source: `/home/k/gbrain-k2/skills/webhook-transforms/SKILL.md`
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
- External events are transformed into brain pages with proper citations
- Raw payloads are preserved (dead-letter queue if transform fails)
- Entity extraction runs on every transformed event
- Input sanitization: no raw HTML/script passes to brain pages
- Error handling: transform failure logs raw payload, retries once

### Blueprint Phases

1. **Define transform.** Map event schema to brain page format:
   - Input: raw webhook payload (JSON)
   - Output: brain page content (markdown) + metadata (slug, type, citations)
   - Must sanitize: strip HTML tags, escape script content

2. **Register webhook URL.** Provide the external service with the webhook endpoint.

3. **On event received:**
   - Parse payload
   - Run transform function
   - Write brain page via `gbrain put`
   - Extract entities, run enrichment
   - Add timeline entries to mentioned entities
   - Sync: `gbrain sync`

4. **Error handling:**
   - If transform throws: log raw payload to `_dead-letter/{timestamp}.md`
   - Surface error type to agent
   - Retry once
   - Don't lose events

## Pitfalls
- Passing raw HTML/script to brain pages (XSS risk)
- Silently dropping events when transform fails (use dead-letter queue)
- Processing webhooks without entity extraction
- Not sanitizing external input before brain writes
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
Event transformed and written to brain. Report: "Webhook: {event_type} from {source}
→ {brain_page_path}"
```

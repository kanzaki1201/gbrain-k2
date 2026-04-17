---
name: ingest
description: Route content to specialized ingestion skills. Detects input type and
  delegates.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - ingest
    related_skills:
    - enrich
    - idea-ingest
    - media-ingest
    - meeting-ingestion
    - testing
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/ingest/SKILL.md
    blueprint_sha256: 96353318e3eea6b67723a9ce1c0ffbc6365e13a46c98870ca1202c33e5a693e8
    generated_from: gbrain-k2/skills
---

# Ingest Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `ingest` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- ingest this
- save this to brain
- process this meeting
- Blueprint source: `/home/k/gbrain-k2/skills/ingest/SKILL.md`
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

- Every fact written to a brain page carries an inline `[Source: ...]` citation with date and provenance.
- Every entity mention creates a back-link from the entity's page to the page mentioning them (Iron Law).
- Raw sources are preserved for provenance via `gbrain files upload-raw` with automatic size routing.
- State sections are rewritten with current best understanding, never appended to.
- Entity detection fires on every inbound message; notable entities get pages or updates.

### Blueprint Phases

> **Router note:** This skill is a router. For specialized ingestion, see: idea-ingest, media-ingest, meeting-ingestion.

1. **Parse the source.** Extract people, companies, dates, and events from the input.
2. **For each entity mentioned:**
   - Read the entity's page from gbrain to check if it exists
   - If exists: update compiled_truth (rewrite State section with new info, don't append)
   - If new: check notability gate, then store the page in gbrain with the appropriate type and slug
3. **Append to timeline.** Add a timeline entry in gbrain for each event, with date, summary, and source citation.
4. **Create cross-reference links.** Link entities in gbrain for every entity pair mentioned together, using the appropriate relationship type.
5. **Back-link all entities.** Update EVERY mentioned entity's page with a back-link to this page (Iron Law).
6. **Timeline merge.** The same event appears on ALL mentioned entities' timelines. If Alice met Bob at Acme Corp, the event goes on Alice's page, Bob's page, and Acme Corp's page.

### Source Tool Intent

These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.

- Read a page from gbrain (get_page)
- Store/update a page in gbrain (put_page)
- Add a timeline entry in gbrain (add_timeline_entry)
- Link entities in gbrain (add_link)
- List tags for a page (get_tags)
- Tag a page in gbrain (add_tag)
- Store raw data in gbrain (put_raw_data)
- Check backlinks in gbrain (get_backlinks)

## Pitfalls
- **Appending to State sections.** State is rewritten with the current best understanding on every update. Append-only State sections grow stale and contradictory.
- **Ingesting without back-links.** An unlinked mention is a broken brain. Every entity mentioned must have a back-link from their page to the page mentioning them.
- **Skipping raw source preservation.** Every ingested item must have its raw source preserved. A brain page without provenance is unverifiable.
- **Bulk processing without sample test.** Test on 3-5 items first. Fix quality issues in the approach, not via one-off patches.
- **Paraphrasing the user's original thinking.** The user's exact language IS the insight. Capture verbatim phrasing for ideas, theses, and frameworks.
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```
INGESTED: [title]
==================

Page: [slug]
Type: [person / company / meeting / media / concept]
Source: [source description]

Entities detected: N
- [entity] -> [created / updated] ([slug])

Back-links created: N
Timeline entries: N
Raw source: [preserved at path / uploaded to cloud]
```
```

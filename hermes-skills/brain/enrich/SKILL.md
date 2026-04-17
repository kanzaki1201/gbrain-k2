---
name: enrich
description: Enrich brain pages with tiered enrichment protocol. Creates and updates
  person/company pages with compiled truth, timeline, and cross-links. Use when a
  new entity is mentioned or an existing page needs updating.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - enrich
    related_skills:
    - ingest
    - query
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/enrich/SKILL.md
    blueprint_sha256: c59e7de6f1311d576db3172c0228698caca97950b4ead4ab1ee78400cbc6c2ea
    generated_from: gbrain-k2/skills
---

# Enrich Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `enrich` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- enrich
- create person page
- update company page
- who is this person
- look up this company
- Blueprint source: `/home/k/gbrain-k2/skills/enrich/SKILL.md`
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
- Every enriched page has compiled truth (State section) with inline citations
- Every enriched page has a timeline with dated entries
- Back-links are created bidirectionally
- Tiered enrichment: Tier 1 (full), Tier 2 (medium), Tier 3 (minimal) based on notability
- No stubs: every new page has meaningful content from web search or existing brain context

> **Filing rule:** Read `skills/_brain-filing-rules.md` before creating any new page.

### Source Tool Intent

These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.

- Read a page from gbrain (get_page)
- Store/update a page in gbrain (put_page)
- Add a timeline entry in gbrain (add_timeline_entry)
- List pages in gbrain by type (list_pages)
- Store raw API data in gbrain (put_raw_data)
- Retrieve raw data from gbrain (get_raw_data)
- Link entities in gbrain (add_link)
- Check backlinks in gbrain (get_backlinks)

## Pitfalls
- Creating stub pages with no content
- Enriching without checking brain first
- Overwriting user's direct statements with API data
- Creating pages for non-notable entities
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
An enriched person page contains:
- **Frontmatter** with type, tags, company, relationship, and contact fields
- **Executive summary** (1 paragraph: how you know them, why they matter, relationship state)
- **State** section with hard facts and inline `[Source: ...]` citations
- **Texture sections** (What They Believe, What They're Building, What Motivates Them, Hobby Horses)
- **Assessment** with trajectory read
- **Relationship** history and contact info
- **Network** connections and mutual contacts
- **Timeline** in reverse chronological order, every entry dated with source citation

An enriched company page contains:
- **Frontmatter** with type and tags
- **Executive summary** (1 paragraph)
- **State** section (what they do, stage, key people, metrics, your connection)
- **Open Threads** (active items, pending decisions)
- **Timeline** in reverse chronological order with dated, cited entries

Both page types have bidirectional back-links to every entity they mention.
```

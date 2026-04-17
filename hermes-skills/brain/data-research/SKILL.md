---
name: data-research
description: 'Structured data research: search sources, extract structured data, archive
  raw sources, maintain canonical tracker pages, deduplicate. Parameterized via YAML
  recipes for investor updates, donations, company updates, or any email-to-structured-data
  pipeline.'
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - data-research
    related_skills:
    - enrich
    - maintain
    - query
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/data-research/SKILL.md
    blueprint_sha256: 9dc34392e954c688bd860872d5e169a6db9348c21b9b7696bd15a111b329ecf5
    generated_from: gbrain-k2/skills
---

# Data Research — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `data-research` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- research
- track
- extract from email
- investor updates
- donations
- build a tracker
- data dig
- Blueprint source: `/home/k/gbrain-k2/skills/data-research/SKILL.md`
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

One skill for any email-to-structured-data pipeline. The only differences
between tracking investor updates, expenses, and company metrics
are the **search queries**, **extraction schemas**, and **tracker page format**.
All three use the same 7-phase pipeline with parameterized recipes.

### Blueprint Phases

### Phase 1: Define Research Recipe

Ask the user what they want to track. Either:
- Pick a built-in recipe: investor-updates, expense-tracker, company-updates
- Define a custom recipe with: source queries, classification rules, extraction schema,
  tracker page path, tracker format

Recipes are YAML files at `~/.gbrain/recipes/{name}.yaml`. Use `gbrain research init`
to scaffold a new one.

### Phase 2: Search Sources

Brain first (maybe we already have this data). Then:
- **Email** via credential gateway: windowed queries (quarterly, monthly if truncated)
- **Web** via search: public filings, press releases, regulatory data
- **APIs**: any structured data source the recipe defines
- **Attachments**: PDF extraction, HTML stripping

### Phase 3: Classify

Deterministic first (regex patterns from recipe), LLM fallback.
Log every LLM fallback for future regex improvement (fail-improve loop).
Skip marketing, newsletters, noise based on recipe's classification rules.

### Phase 4: Extract Structured Data

**EXTRACTION INTEGRITY RULE:**
1. Save raw source immediately (before any extraction)
2. Extract fields using deterministic regex first, LLM fallback
3. When summarizing batch results: **re-read from saved files**
4. Never trust LLM working memory after batch processing

This prevents a known hallucination bug where batch-processed amounts were
13/13 wrong from LLM working memory while saved files were correct.

### Phase 5: Archive Raw Sources

- `put_raw_data` for email bodies, API responses
- `file_upload` for PDF attachments, documents
- Create `.redirect.yaml` pointers for large files in storage
- Every tracker entry must link back to its raw source

### Phase 6: Deduplicate

Before adding to tracker:
- Exact match (same key fields) → skip
- Fuzzy match (same entity + date + similar amount within tolerance) → flag for review
- Different amount for same entity+date → add with note (could be correction)

### Phase 7: Update Canonical Tracker + Backlink

- Parse existing tracker page (markdown table)
- Append new entries in correct section (grouped by year/quarter/entity)
- Compute running totals
- Backlink every mentioned entity (person → people/ page, company → companies/ page)
- Uses enrichment service for entity pages

## Pitfalls
- Trusting LLM working memory for amounts after batch processing (use extraction integrity rule)
- Creating tracker entries without raw source links
- Running without deduplication (leads to double-counted entries)
- Hardcoding source-specific patterns in the pipeline code (use recipes)
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
Brain page at the recipe's `tracker_page` path with markdown tables:

```markdown
### 2026

| Date | Company | MRR | ARR | Growth | Status |
|------|---------|-----|-----|--------|--------|
| 2026-04-01 | Example Co | $188K | $2.3M | +14.7% MoM | [Source](link) |
```

Each entry links to its raw source. Running totals at the bottom of each section.
```

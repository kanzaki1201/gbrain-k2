---
name: idea-ingest
description: Ingest links, articles, tweets, and ideas into the brain. Fetch content,
  save to brain with analysis, create author people page, and cross-link. Use when
  the user shares a link or says "read this", "save this", "think about this".
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - idea-ingest
    related_skills:
    - ingest
    - publish
    - query
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/idea-ingest/SKILL.md
    blueprint_sha256: 536b05ada0e48b58b58f6711c23a94ff83ca807773341c92c9e3056af2d95030
    generated_from: gbrain-k2/skills
---

# Idea Ingest Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `idea-ingest` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- shares a link or URL
- read this
- save this
- think about this
- put this in brain
- Blueprint source: `/home/k/gbrain-k2/skills/idea-ingest/SKILL.md`
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
- Every ingested item has a brain page with genuine analysis (not just a summary)
- The author gets a people page (MANDATORY for anyone whose thinking is worth ingesting)
- Cross-links created bidirectionally (source ↔ author, source ↔ mentioned entities)
- Raw source preserved for provenance via `gbrain files upload-raw`
- Every fact has an inline `[Source: ...]` citation
- Filing follows primary subject rules (not format-based)

### Blueprint Phases

1. **Fetch the content.** Use appropriate tools for the content type (web fetch for articles, API for tweets, PDF reader for documents).

2. **Upload raw source.** Save the fetched content for provenance: `gbrain files upload-raw <file> --page <slug>`

3. **Identify the author — MANDATORY people page.** Anyone whose thinking is worth ingesting is worth tracking.
   - Search brain for existing author page
   - If no page → CREATE ONE with compiled truth + timeline format
   - If page exists → update timeline with this new publication
   - Cross-link both directions

4. **Save to brain.** File by PRIMARY SUBJECT (read `skills/_brain-filing-rules.md`):
   - About a person → `people/`
   - About a company → `companies/`
   - A reusable framework → `concepts/`
   - Raw data dump → `sources/`

5. **Analyze for the user.** Reply with analysis that connects the content to what the brain knows. Think about:
   - Active projects — is this relevant?
   - Contradictions — does this challenge existing brain knowledge?
   - Connections — does this involve known people/companies?
   - Don't just summarize. Tell the user things they wouldn't have noticed.

6. **Sync.** `gbrain sync` to update the index.

## Pitfalls
- Just summarizing without connecting to brain knowledge
- Filing everything in `sources/` (sources is for raw data dumps only)
- Skipping the author people page
- Not cross-linking to mentioned entities
- Ingesting without checking brain first for existing coverage
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```markdown
# {Title} — {Author}

**Source:** {URL}
**Author:** {Author}, {role}
**Published:** {date}
**Ingested:** {date}
```

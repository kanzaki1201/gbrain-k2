---
name: citation-fixer
description: 'Audit and fix citation formatting across brain pages. Ensures every
  fact has an inline [Source: ...] citation matching the standard format.'
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - citation-fixer
    related_skills: []
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/citation-fixer/SKILL.md
    blueprint_sha256: 8ab381e2aafd2c87a207daf6126e5574960e074919680c4ba4cb8a3287444e53
    generated_from: gbrain-k2/skills
---

# Citation Fixer Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `citation-fixer` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- fix citations
- citation audit
- check citations
- Blueprint source: `/home/k/gbrain-k2/skills/citation-fixer/SKILL.md`
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
- Every brain page is scanned for citation compliance
- Missing citations are flagged with specific location
- Malformed citations are fixed to match the standard format
- Results reported with counts (scanned, fixed, remaining)

### Blueprint Phases

1. **Scan pages.** List pages and read each one, checking for inline `[Source: ...]` citations.
2. **Identify issues:**
   - Facts without any citation
   - Citations missing date
   - Citations missing source type
   - Citations with wrong format
3. **Fix format issues.** Rewrite malformed citations to match `skills/conventions/quality.md`.
4. **Report results.** Count: pages scanned, citations found, issues fixed, remaining gaps.

## Pitfalls
- Inventing citations for facts that have no source
- Removing facts that lack citations (flag them, don't delete)
- Fixing citations without reading the full page context
- Batch-fixing without checking quality (test-before-bulk convention)
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```
Citation Audit Report
=====================
Pages scanned: N
Citations found: N
Issues fixed: N
Remaining gaps: N (pages with uncitable facts)
```
```

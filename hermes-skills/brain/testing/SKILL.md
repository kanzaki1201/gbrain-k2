---
name: testing
description: Skill validation framework. Validates every skill has SKILL.md with frontmatter,
  every reference exists, every env var is declared. The testing contract for the
  skill system itself.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - testing
    related_skills: []
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/testing/SKILL.md
    blueprint_sha256: 34e335c51d624a30c968b1d58091e523d1378c387b5f80960b90e5c56c51e6f8
    generated_from: gbrain-k2/skills
---

# Testing Skill — Skill Validation Framework — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `testing` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- validate skills
- test skills
- skill health check
- run conformance tests
- Blueprint source: `/home/k/gbrain-k2/skills/testing/SKILL.md`
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
- Every skill directory has a SKILL.md file
- Every SKILL.md has valid YAML frontmatter (name, description)
- Every SKILL.md has required sections (Contract, Anti-Patterns, Output Format)
- manifest.json lists every skill directory
- RESOLVER.md references every skill in the manifest
- No MECE violations (duplicate triggers across skills)

### Blueprint Phases

1. **Walk skills directory.** List all subdirectories containing SKILL.md.
2. **Validate frontmatter.** Parse YAML, check required fields.
3. **Validate sections.** Check for Contract, Anti-Patterns, Output Format headings.
4. **Check manifest.** Every skill directory must be listed in manifest.json.
5. **Check resolver.** Every manifest skill must have a RESOLVER.md entry.
6. **Report results.**

Automated: `bun test test/skills-conformance.test.ts test/resolver.test.ts`

## Pitfalls
- Skipping validation after adding a new skill
- Adding skills to manifest without adding to resolver
- Creating skills without the conformance template
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```
Skill Validation Report
========================
Skills found: N
Conformance: N/N pass
Manifest coverage: N/N
Resolver coverage: N/N
MECE violations: N

Issues:
- {skill}: {issue}
```
```

---
name: skill-creator
description: Create new skills following the GBrain conformance standard. Generates
  SKILL.md with frontmatter, Contract, Phases, Output Format, and Anti-Patterns. Checks
  MECE against existing skills. Updates manifest and resolver.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - skill-creator
    related_skills: []
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/skill-creator/SKILL.md
    blueprint_sha256: 4a11f8935d4214b21b4664a5c0c03149733731020ec0d5d09dc9fd8c40bd92f6
    generated_from: gbrain-k2/skills
---

# Skill Creator — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `skill-creator` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- create a skill
- new skill
- improve this skill
- Blueprint source: `/home/k/gbrain-k2/skills/skill-creator/SKILL.md`
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
- New skill follows conformance standard (frontmatter + required sections)
- MECE check: no overlap with existing skills' triggers
- Manifest.json updated
- RESOLVER.md updated with routing entry
- Skill passes conformance tests (`bun test test/skills-conformance.test.ts`)

### Blueprint Phases

1. **Identify the gap.** What capability is missing? What user intent has no skill?
2. **MECE check.** Review `skills/manifest.json` and `skills/RESOLVER.md`. Does any existing skill already cover this? If so, extend it instead of creating a new one.
3. **Create SKILL.md.** Use this template:

```yaml
---
name: {skill-name}
version: 1.0.0
description: |
  {One paragraph describing what the skill does and when to use it.}
triggers:
  - "{trigger phrase 1}"
  - "{trigger phrase 2}"
tools:
  - {tool1}
  - {tool2}
mutating: {true|false}
---

# {Skill Title}

### Source Tool Intent

These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.

{GBrain operations used, with descriptions}
```

4. **Add to manifest.** Update `skills/manifest.json` with name, path, description.
5. **Add to resolver.** Update `skills/RESOLVER.md` with routing entry in the appropriate category.
6. **Verify.** Run `bun test test/skills-conformance.test.ts` to confirm the new skill passes.

## Pitfalls
{What NOT to do — 3-5 items}
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
{What good output looks like}
```

---
name: daily-task-prep
description: Morning preparation. Calendar lookahead, meeting context loading, open
  threads from yesterday, active task review. Extends briefing with actionable prep.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - daily-task-prep
    related_skills:
    - briefing
    - query
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/daily-task-prep/SKILL.md
    blueprint_sha256: 9fe89f85fae139adac25c3bdc6f23bbf64239f3738a9e679c447e686175516f0
    generated_from: gbrain-k2/skills
---

# Daily Task Prep — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `daily-task-prep` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- morning prep
- prepare for today
- what's on my plate
- day prep
- Blueprint source: `/home/k/gbrain-k2/skills/daily-task-prep/SKILL.md`
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
- Calendar/meetings for today are loaded with brain context per attendee
- Open threads from yesterday are surfaced
- Active tasks reviewed with priority ordering
- Prep briefing is actionable (not just informational)

### Blueprint Phases

1. **Load calendar.** Check today's meetings. For each: load attendee brain pages, recent timeline, open threads.
2. **Check yesterday's threads.** Search brain for yesterday's timeline entries. Flag anything unresolved.
3. **Review active tasks.** Load `ops/tasks` from brain. Surface P0 and P1 items.
4. **Compile prep briefing.** Per-meeting context cards + open threads + task priorities.

## Pitfalls
- Listing meetings without loading attendee context from brain
- Ignoring yesterday's unresolved threads
- Presenting tasks without priority ordering
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```
Morning Prep — {date}
======================
Meetings today: {N}
```

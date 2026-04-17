---
name: daily-task-manager
description: Task lifecycle management. Add, complete, defer, remove, and review tasks.
  Maintains a running task list as a brain page.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - daily-task-manager
    related_skills:
    - maintain
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/daily-task-manager/SKILL.md
    blueprint_sha256: e616f74a6befffc7bb64c0e29b2d2caa37c51bc470bca96df70101c772429d83
    generated_from: gbrain-k2/skills
---

# Daily Task Manager — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `daily-task-manager` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- add task
- complete task
- what are my tasks
- task list
- defer task
- Blueprint source: `/home/k/gbrain-k2/skills/daily-task-manager/SKILL.md`
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
- Tasks stored as a brain page (`ops/tasks.md`) with structured format
- Task lifecycle: add → in-progress → complete | defer
- Priority levels: P0 (urgent), P1 (today), P2 (this week), P3 (backlog)
- Completed tasks archived with completion date
- Deferred tasks carry forward with reason

### Blueprint Phases

1. **Load current tasks.** `gbrain get ops/tasks` — read the task list.
2. **Execute the requested action:**
   - **Add:** Append task with priority, description, due date. Add timeline entry.
   - **Complete:** Mark as done, move to completed section with date.
   - **Defer:** Move to next day/week with reason.
   - **Remove:** Delete from list (rare, prefer complete or defer).
   - **Review:** Display all active tasks by priority.
3. **Save.** `gbrain put ops/tasks` — write updated task list.

## Pitfalls
- Adding tasks without a priority level
- Completing tasks without recording the completion date
- Deferring tasks without a reason
- Letting the task list grow unbounded (review weekly)
- Storing tasks outside the brain (they should be searchable)
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```markdown
# Tasks
```

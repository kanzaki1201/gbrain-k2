---
name: update-k2
description: Pull upstream gbrain changes into the k2 fork safely, preserving k2 customizations.
  Preview, selective cherry-pick, backup, conflict resolution, validation. Never pushes
  to upstream.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - update-k2
    related_skills:
    - install
    - repo-architecture
    - signal-detector
    - zettel-processor
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/update-k2/SKILL.md
    blueprint_sha256: 3ab515e7bb492d4ea7a8d8f4859ff067b39c2a653a2c079d280539f8c45fefb9
    generated_from: gbrain-k2/skills
---

# Update K2 — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `update-k2` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- update k2
- pull upstream gbrain
- merge upstream
- sync with gbrain
- Blueprint source: `/home/k/gbrain-k2/skills/update-k2/SKILL.md`
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
- Clean worktree check and upstream fetch-only remote before any operation
- Backup branch + tag created before any merge/rebase/cherry-pick
- K2-divergent files preserve their k2 content during conflict resolution
- Validation (bun install + build + test) after merge
- Hermes brain-skill projections regenerated and audited after any `skills/` changes
- Breaking-changes prompt if CHANGELOG entries mark [BREAKING]
- Rollback instructions printed at the end of every run
- Never pushes to upstream — push URL is a poison pill

### Blueprint Phases

See the full step-by-step workflow below under Step 0 through Step 7.

## Pitfalls
- Pushing to `upstream` (never — the push URL is the poison-pill guard)
- Overwriting k2-divergent files with upstream versions without reviewing
  per-section intent
- Making "cleanup" refactors while resolving merge conflicts
- Skipping the backup step (step 1) "because it's a small update"
- Merging without running validation
- Running `git merge --abort` and calling it a successful update
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
- Printed diff summary (bucketed by file area)
- Printed list of conflicts resolved
- Printed list of breaking changes + skills invoked
- Rollback tag name + command
- Remaining local diff vs upstream
```

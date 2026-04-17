---
name: cross-modal-review
description: 'Quality gate via second model. Spawn a different AI model to review
  work before committing. Includes refusal routing: if one model refuses, silently
  switch to the next.'
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - cross-modal-review
    related_skills:
    - query
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/cross-modal-review/SKILL.md
    blueprint_sha256: 42592ea212d15983c3b53d2415f3c5b4dc873f3e9f8995e0b297405aa0280c8d
    generated_from: gbrain-k2/skills
---

# Cross-Modal Review — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `cross-modal-review` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- second opinion
- cross-modal review
- double check this
- get another perspective
- Blueprint source: `/home/k/gbrain-k2/skills/cross-modal-review/SKILL.md`
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
- Work product is reviewed by a different model before finalizing
- Review grades against the originating skill's Contract section
- Agreement and disagreement are reported transparently
- Refusal from one model triggers silent switch to next in chain
- User always makes the final decision (user sovereignty)

### Blueprint Phases

1. **Capture the work product.** The brain page, analysis, or decision to be reviewed.
2. **Load the Contract.** Read the originating skill's Contract section (what was promised).
3. **Spawn review model.** Send the work + Contract to a different model. Use `skills/conventions/model-routing.md` for model selection.
4. **Grade.** Model evaluates: did the output follow the Contract? Pass/fail with specific citations.
5. **Report.** Present agreement/disagreement to the user. Never auto-apply the reviewer's suggestions.

## Pitfalls
- Auto-applying reviewer suggestions without user approval
- Showing model refusals to the user
- Using the same model for review and generation
- Skipping the Contract reference (reviewing vibes, not guarantees)
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```
Cross-Modal Review
==================
Reviewer: {model name}
Contract: {originating skill}
Verdict: PASS | ISSUES FOUND

Findings:
- {finding with evidence}

Agreement with primary: {X}%
```
```

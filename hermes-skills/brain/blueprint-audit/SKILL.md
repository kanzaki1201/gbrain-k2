---
name: blueprint-audit
description: Audit Hermes brain skill projections against the canonical gbrain-k2
  skill blueprints. Detect drift, regenerate projections when needed, verify Hermes
  runtime discovery, and write reports outside the brain-vault.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - blueprint-audit
    related_skills:
    - brain-ops
    - reports
    - signal-detector
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/blueprint-audit/SKILL.md
    blueprint_sha256: 4389ae09671575fc648650862b06acc113925aedb70baba2ece0a1b31809c72d
    generated_from: gbrain-k2/skills
---

# Blueprint Audit — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `blueprint-audit` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- audit brain projections
- audit Hermes brain skills
- check blueprint drift
- regenerate Hermes brain skills
- Blueprint source: `/home/k/gbrain-k2/skills/blueprint-audit/SKILL.md`
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
- Source blueprints in `~/gbrain-k2/skills/` are treated as canonical
- Projection drift is detected mechanically before any semantic review
- Hermes runtime discovery is checked after projection generation
- Audit reports are written under `~/gbrain-k2/reports/hermes-skill-audits/`
- No audit output is written into the user brain-vault

### Blueprint Phases

1. **Mechanical parity audit**
   - Run:
     ```bash
     python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py --write-report
     ```
   - Read the report path and note missing projections, extra projections, hash mismatches, and missing Hermes sections.

2. **Regenerate when drift exists**
   - If the audit reports drift, run:
     ```bash
     python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py --fix --write-report
     ```
   - This rebuilds the Hermes projection pack from the current source blueprints.

3. **Hermes runtime health check**
   - Confirm Hermes is loading the generated pack from `skills.external_dirs`.
   - Run a runtime check with Hermes tools:
     - `skills_list(category="brain")`
     - `skill_view("brain-ops")`
     - `skill_view("signal-detector")`
     - `skill_view("blueprint-audit")`
   - Confirm those resolve to `~/gbrain-k2/hermes-skills/brain/...`.

4. **Interpret the result**
   - Mechanical parity clean + runtime discovery clean = healthy
   - Mechanical parity clean + runtime discovery broken = Hermes loading/config issue
   - Mechanical drift + runtime drift = regenerate first, then re-check

5. **Document the outcome**
   - Keep the markdown report in `~/gbrain-k2/reports/hermes-skill-audits/`
   - For cron runs, deliver locally and keep the final human-facing note short

## Pitfalls
- Treating `~/.hermes/skills/brain/` as the source of truth
- Writing audit reports into the brain-vault
- Reporting a clean state before the Hermes runtime check finishes
- Regenerating projections and skipping the second audit pass
- Mixing semantic review comments into the mechanical audit report
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
- Audit status: `clean` or `drift`
- Report path under `~/gbrain-k2/reports/hermes-skill-audits/`
- If drift exists: bullet list of mismatches
- If runtime discovery fails: bullet list of missing or misloaded skills
```

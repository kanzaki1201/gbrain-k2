---
name: blueprint-audit
version: 1.0.0
description: |
  Audit Hermes brain skill projections against the canonical gbrain-k2 skill
  blueprints. Detect drift, regenerate projections when needed, verify Hermes
  runtime discovery, and write reports outside the brain-vault.
triggers:
  - "audit brain projections"
  - "audit Hermes brain skills"
  - "check blueprint drift"
  - "regenerate Hermes brain skills"
tools:
  - terminal
  - read_file
  - search_files
mutating: true
---

# Blueprint Audit

Keep the Hermes-facing brain skillpack aligned with the canonical K2 skills.
This workflow treats `~/gbrain-k2/skills/` as the source of truth and
`~/.hermes/skills/brain/` as the Hermes-owned projection pack.

## Contract

This skill guarantees:
- Source blueprints in `~/gbrain-k2/skills/` are treated as canonical
- Projection drift is detected mechanically before any semantic review
- Hermes runtime discovery is checked after projection generation
- Audit reports are written under `~/gbrain-k2/reports/hermes-skill-audits/`
- No audit output is written into the user brain-vault

## Phases

1. **Mechanical parity audit**
   - Compare `~/gbrain-k2/skills/` against `~/.hermes/skills/brain/` with Hermes file tools.
   - Check for missing projections, extra projections, stale `references/blueprint.md`, and obvious body drift.

2. **Regenerate when drift exists**
   - If the audit reports drift, refresh the projections through Hermes:
     ```text
     /run-project-hermes-skills
     ```
   - This asks Hermes to read the canonical blueprint and rewrite the Hermes-owned projection pack.

3. **Hermes runtime health check**
   - Confirm Hermes can load the refreshed pack from `~/.hermes/skills/brain/`.
   - Run a runtime check with Hermes tools:
     - `skills_list(category="brain")`
     - `skill_view("brain-ops")`
     - `skill_view("signal-detector")`
     - `skill_view("blueprint-audit")`
   - Confirm those resolve under `~/.hermes/skills/brain/...`.

4. **Interpret the result**
   - Mechanical parity clean + runtime discovery clean = healthy
   - Mechanical parity clean + runtime discovery broken = Hermes loading/config issue
   - Mechanical drift + runtime drift = regenerate first, then re-check

5. **Document the outcome**
   - Keep the final note short and local unless the user asked for a fuller report.
   - For cron runs, deliver locally.

## Output Format

- Touched projected skills read like Hermes-native procedures
- Each touched projection has a fresh `references/blueprint.md`
- `skills_list(category="brain")` exposes the touched skills in a fresh Hermes session
- No unresolved source-only tool path remains in the rewritten procedure

## Anti-Patterns

- Treating `~/.hermes/skills/brain/` as the source of truth
- Writing audit reports into the brain-vault
- Reporting a clean state before the Hermes runtime check finishes
- Regenerating projections and skipping the second audit pass
- Mixing semantic review comments into the mechanical audit report

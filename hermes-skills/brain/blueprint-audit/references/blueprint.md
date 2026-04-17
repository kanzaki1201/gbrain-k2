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
`~/gbrain-k2/hermes-skills/brain/` as the generated Hermes projection pack.

## Contract

This skill guarantees:
- Source blueprints in `~/gbrain-k2/skills/` are treated as canonical
- Projection drift is detected mechanically before any semantic review
- Hermes runtime discovery is checked after projection generation
- Audit reports are written under `~/gbrain-k2/reports/hermes-skill-audits/`
- No audit output is written into the user brain-vault

## Phases

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

## Output Format

- Audit status: `clean` or `drift`
- Report path under `~/gbrain-k2/reports/hermes-skill-audits/`
- If drift exists: bullet list of mismatches
- If runtime discovery fails: bullet list of missing or misloaded skills

## Anti-Patterns

- Treating `~/.hermes/skills/brain/` as the source of truth
- Writing audit reports into the brain-vault
- Reporting a clean state before the Hermes runtime check finishes
- Regenerating projections and skipping the second audit pass
- Mixing semantic review comments into the mechanical audit report

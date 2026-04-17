---
name: soul-audit
description: 6-phase interactive interview that generates the agent's identity (SOUL.md),
  user profile (USER.md), access control (ACCESS_POLICY.md), and operational cadence
  (HEARTBEAT.md). Re-runnable anytime to update any section.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - soul-audit
    related_skills:
    - briefing
    - install
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/soul-audit/SKILL.md
    blueprint_sha256: 7f162dddcc511e97a24db3a46136295fcbda76023019ad8994546744d7b8eb0a
    generated_from: gbrain-k2/skills
---

# Soul Audit — Agent Identity Builder — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `soul-audit` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- soul audit
- customize agent
- who am I
- set up identity
- change my agent's personality
- Blueprint source: `/home/k/gbrain-k2/skills/soul-audit/SKILL.md`
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
- SOUL.md generated from user's description of agent identity, vibe, mission
- USER.md generated from user's self-description (role, projects, key people)
- ACCESS_POLICY.md generated with configurable access tiers
- HEARTBEAT.md generated with operational cadence the user chooses
- Each phase is independent and re-runnable
- Default mode (skip soul-audit): installs minimal templates from `templates/`

### Blueprint Phases

### Phase 1: Identity Interview
Ask: "What is this agent to you? Research partner? Executive assistant? Thinking partner? All of the above?"
Generate: SOUL.md identity section.

### Phase 2: Vibe Calibration
Show 3-4 communication style examples:
- **Formal:** "I've prepared a comprehensive analysis of the situation..."
- **Direct:** "Here's what's happening. Three things matter."
- **Technical:** "The root cause is in the connection pooling. Here's the fix."
- **Casual:** "Yeah so basically the thing is broken because X. Easy fix."
Ask which feels right. Generate: SOUL.md vibe + communication style sections.

### Phase 3: Mission Mapping
Ask: "What are your top 3-5 goals? What are you trying to accomplish?"
Generate: SOUL.md mission + operating principles sections.

### Phase 4: User Profile
Ask: "Tell me about yourself. What do you do? What are you working on? Who are the key people in your world?"
Generate: USER.md with role, projects, key people, communication preferences.

### Phase 5: Boundaries
Ask: "Who should have access to your brain? Are there people who should see some but not all? Anyone to keep out entirely?"
Generate: ACCESS_POLICY.md with 4 tiers (Full/Work/Family/None).

### Phase 6: Operational Cadence
Ask: "How often should the agent check in? Morning briefing? End of day summary? What recurring jobs do you want?"
Generate: HEARTBEAT.md with operational cadence.

## Pitfalls
- Shipping pre-filled SOUL.md or USER.md content (privacy violation)
- Making soul-audit mandatory on first boot (high friction, optional is better)
- Asking all 6 phases in one go (overwhelming, each is independent)
- Not offering to re-run individual phases
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
Four files generated/updated. Report: "Soul audit complete: SOUL.md, USER.md,
ACCESS_POLICY.md, HEARTBEAT.md created. Re-run any phase anytime to update."
```

---
name: briefing
description: Compile daily briefing with meeting context, active deals, and citation
  tracking
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - briefing
    related_skills:
    - daily-task-prep
    - enrich
    - install
    - query
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/briefing/SKILL.md
    blueprint_sha256: 7fa31004a9dcb327cb36c88022a82c43bd13e161318d746f8493c34239856eae
    generated_from: gbrain-k2/skills
---

# Briefing Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `briefing` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- daily briefing
- morning briefing
- what's happening today
- Blueprint source: `/home/k/gbrain-k2/skills/briefing/SKILL.md`
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

- Every fact in the briefing includes an inline `[Source: slug, updated DATE]` citation.
- Meeting participants are resolved against the brain; gaps are explicitly flagged.
- Active deals and action items include deadlines and recency context.
- The briefing is read-only: no brain pages are created or modified unless the user explicitly requests it.
- Stale alerts surface pages relevant to today's context, not just all stale pages.

### Blueprint Phases

1. **Today's meetings.** For each meeting on the calendar:
   - Search gbrain for each participant by name
   - Read their pages from gbrain for compiled_truth context
   - Summarize: who they are, recent timeline, relationship to you
2. **Active deals.** List deal pages in gbrain filtered to active status:
   - Deadlines approaching in the next 7 days
   - Recent timeline entries (last 7 days)
3. **Time-sensitive threads.** Open items from timeline entries:
   - Items with deadlines in the next 48 hours
   - Follow-ups that are overdue
4. **Recent changes.** Pages updated in the last 24 hours:
   - What changed and why (read timeline entries from gbrain)
5. **People in play.** List person pages in gbrain sorted by recency:
   - Updated in last 7 days
   - Have high activity (many recent timeline entries)
6. **Stale alerts.** From gbrain health check:
   - Pages flagged as stale that are relevant to today's meetings

### Source Tool Intent

These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.

- Search gbrain by name (query)
- Read a page from gbrain (get_page)
- List pages in gbrain by type (list_pages)
- Check gbrain health (get_health)
- View timeline entries in gbrain (get_timeline)

## Pitfalls
- **Briefing without brain queries.** Never generate a briefing from memory alone; always query gbrain for current data.
- **Uncited facts.** Every claim must include `[Source: slug, updated DATE]`. A fact without a citation is unverifiable.
- **Stale context presented as current.** If a page hasn't been updated in 30+ days, flag the staleness explicitly rather than presenting it as fresh.
- **Modifying brain pages unprompted.** The briefing is read-only by default. Do not create or update pages unless the user explicitly requests it.
- **Ignoring coverage gaps.** When a meeting participant has no brain page, say so. Silence about gaps hides ignorance.
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```
DAILY BRIEFING -- [date]
========================

MEETINGS TODAY
- [time] [meeting name]
  Participants: [name] (slug: people/name, [key context])

ACTIVE DEALS
- [deal name] -- [status], deadline: [date]
  Recent: [latest timeline entry]

ACTION ITEMS
- [item] -- due [date], related to [slug]

RECENT CHANGES (24h)
- [slug] -- [what changed]

PEOPLE IN PLAY
- [name] -- [why they're active]
```
```

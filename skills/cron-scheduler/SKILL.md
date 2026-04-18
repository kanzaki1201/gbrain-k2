---
name: cron-scheduler
version: 1.0.0
description: |
  Schedule management with staggering, quiet hours, and wake-up override.
  Validates schedules, prevents collisions, and gates delivery during quiet hours.
triggers:
  - "schedule a job"
  - "cron"
  - "quiet hours"
  - "what jobs are running"
tools:
  - search
  - get_page
  - put_page
mutating: true
---

# Cron Scheduler

> **Convention:** See `skills/conventions/test-before-bulk.md` — test every cron job on 3-5 items first.

## Contract

This skill guarantees:
- Schedule staggering: max 1 job per 5-minute slot, no collisions
- Quiet hours gating: timezone-aware, with user-awake override
- Thin job prompts: jobs say "Read skills/X/SKILL.md and run it" (no inline 3000-word prompts)
- Idempotency: jobs can run twice without duplicate side effects
- Results saved as reports: `reports/{job-name}/{YYYY-MM-DD-HHMM}.md`
- K2 baseline cadence stays coherent: morning briefing, waking-hours zettel processing, nightly maintain pass, weekly deeper maintenance

## Phases

1. **Define job.** Name, schedule (cron expression), skill to run, timeout.
2. **Validate schedule.** Check no collision with existing jobs (5-minute offset rule).
   - Slots: :05, :10, :15, :20, :25, :30, :35, :40, :45, :50
   - If collision detected, suggest the next available slot
3. **Check quiet hours.** Default: 11 PM - 8 AM local time.
   - Override: user-awake flag (if user is active, quiet hours suspended)
   - During quiet hours: save output to held queue
   - Morning contact releases the backlog
4. **Register with host scheduler.** OpenClaw cron, Railway cron, crontab, or process manager.
5. **Write thin prompt.** Job prompt is one line: "Read skills/{name}/SKILL.md and run it."

## K2 Baseline Jobs

Document the standing cadence in the skills themselves so operators can inspect
the intended schedule from inside the repo:

| Cron | Skill(s) | Purpose |
|---|---|---|
| `0 9 * * *` | `briefing` | Morning wiki interaction prompts |
| `0 12 * * *` | `gbrain check-update --json` | Report update availability; never auto-install |
| `0 */4 * * *` | `recompile` | Catch file changes in human/ and sources/ throughout the day |
| `0 20 * * *` | `recompile` → `maintain` → `zettel-status-check` | **Evening pass** — compile changes, audit health + fix issues, surface zettel archival candidates. Runs as a chained sequence (each completes before the next starts). Report delivered via messaging. |
| `0 6 * * 1` | `maintain` (deeper) + `gbrain doctor` + `gbrain embed --stale` | Weekly deeper maintenance and substrate verification |

The evening pass is the primary human-facing maintenance window — its
report lands in the messaging channel during waking hours so the user can
react to archival candidates and flagged issues.

Keep this table aligned with the live Hermes cron jobs.

## Idempotency Requirement

Every cron job MUST be idempotent:
- Running the same job twice produces the same result (no duplicate pages, no duplicate timeline entries)
- Use checkpoint state files to track progress and resume interrupted runs
- Check for existing output before creating new output

## Output Format

Job configuration saved. Report: "Job '{name}' scheduled at {cron expression}. Next run: {time}."

## Anti-Patterns

- Scheduling jobs at the same minute (:00 for everything)
- Inline 3000-word prompts in cron jobs (use skill file references)
- Running cron jobs without testing on 3-5 items first
- Jobs that produce different output on re-run (not idempotent)
- Sending notifications during quiet hours (save to held queue instead)

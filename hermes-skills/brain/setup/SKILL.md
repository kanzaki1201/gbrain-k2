---
name: setup
description: Set up GBrain with auto-provision Supabase or PGLite, AGENTS.md injection,
  first import
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - setup
    related_skills:
    - enrich
    - ingest
    - install
    - maintain
    - migrate
    - query
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/setup/SKILL.md
    blueprint_sha256: e7a201260b6a258f5b089ed626f9f7169c8fc88b057751d7a5e81d37579e1faa
    generated_from: gbrain-k2/skills
---

# Setup GBrain — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `setup` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- set up gbrain
- initialize brain
- gbrain setup
- Blueprint source: `/home/k/gbrain-k2/skills/setup/SKILL.md`
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

- Setup completes with a working brain verified by `gbrain doctor --json` (all checks OK).
- The brain-first lookup protocol is injected into the project's AGENTS.md or equivalent.
- Live sync is configured and verified (a test change pushed and found via search).
- Schema state is tracked in `~/.gbrain/update-state.json` so future upgrades know what the user adopted or declined.
- No Supabase anon key is requested; GBrain uses only the database connection string.

### Source Tool Intent

These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.

- `gbrain init --non-interactive --url ...` -- create brain
- `gbrain import <dir> --no-embed [--workers N]` -- import files
- `gbrain search <query>` -- search brain
- `gbrain doctor --json` -- health check
- `gbrain check-update --json` -- check for updates
- `gbrain embed refresh` -- generate embeddings
- `gbrain embed --stale` -- backfill missing embeddings
- `gbrain sync --repo <path>` -- one-shot sync from brain repo
- `gbrain sync --watch --repo <path>` -- continuous sync polling
- `gbrain config get sync.last_run` -- check last sync timestamp
- `gbrain stats` -- page count + embed coverage

## Pitfalls
- **Asking for the Supabase anon key.** GBrain connects directly to Postgres over the wire protocol, not through the REST API. Only the database connection string is needed.
- **Skipping live sync setup.** If sync doesn't run automatically, the vector DB falls behind and search returns stale answers. Phase H is not optional.
- **Declaring setup complete without verification.** "The command ran" is not the same as "it worked." Push a test change, wait for sync, search for the corrected text.
- **Using Transaction mode pooler.** Sync uses transactions on every import. Transaction mode pooler causes `.begin() is not a function` errors and silently skips pages. Always use Session mode (port 6543).
- **Importing without proving search.** The magical moment is the user seeing search find things grep couldn't. Don't skip it.
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```
GBRAIN SETUP COMPLETE
=====================

Engine: [PGLite / Supabase Postgres]
Connection: [verified / pooler mode confirmed]
Pages imported: N
Embeddings: N/N (keyword search active, semantic improving)
Live sync: [configured / method]
Health check: all OK / [specific failures]
Verification: [GBRAIN_VERIFY.md results]

Next steps:
- Read docs/GBRAIN_SKILLPACK.md for production agent patterns
- [any pending items]
```
```

# K2 Brain — Hermes Handover

Post-intake handover guide for Hermes (or any clawlike agent) taking over
operational maintenance of `~/brain-vault/`. Read end to end before acting.

This is the k2 complement to `INSTALL_FOR_AGENTS.md`, not a replacement.
`INSTALL_FOR_AGENTS.md` describes the generic gbrain first-time install (fresh
clone, initial import, recommended schema). This file picks up where that
leaves off for the k2 fork specifically: the vault already exists, the wiki
is already compiled by a Claude Code intake session, and Hermes needs to wire
itself in as the ongoing operator.

**Prerequisite:** Initial import and first-pass wiki compilation are done by
a separate Claude Code session. If the vault is empty, STOP and run the
Claude-side intake first.

**Target:** ~30 min to a Hermes-managed vault with autopilot daemon running,
skills discoverable, and cron jobs wired.

**Fork:** https://github.com/kanzaki1201/gbrain-k2 (never push to upstream)

---

## Pre-flight — verify the vault is already compiled

```bash
test -d ~/brain-vault && echo "vault OK"
test -d ~/brain-vault/human && echo "human OK"
test -d ~/brain-vault/sources && echo "sources OK"
test -d ~/brain-vault/archive && echo "archive OK"
ls ~/brain-vault/people/*.md 2>/dev/null | head -3 && echo "people pages OK" || echo "MISSING: no people pages — intake not done"
ls ~/brain-vault/inbox/k2-install-report.md && echo "intake report OK"
```

If any fails, STOP and tell the user the Claude-side intake hasn't finished.
Do not attempt to re-do it from Hermes.

---

## Step 1: Install the gbrain CLI from the k2 fork

```bash
test -d ~/gbrain-k2 || git clone https://github.com/kanzaki1201/gbrain-k2.git ~/gbrain-k2
cd ~/gbrain-k2
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
bun install && bun link
gbrain --version
```

**Do NOT `bun install gbrain` inside `~/brain-vault/`.** The CLI must run from
the fork via `bun link`. A vault-local npm install would shadow the fork's
skills and schema, and `gbrain upgrade` would overwrite k2 mods.

## Step 2: API keys

Ask the user for:

```bash
export OPENAI_API_KEY=sk-...          # required for vector search
export ANTHROPIC_API_KEY=sk-ant-...   # optional, improves query quality
```

Save to shell profile or `~/.hermes/.env`. Without OpenAI, keyword search
still works; vector search is disabled.

## Step 3: Symlink k2 skills into Hermes's skill dir

Hermes discovers skills from `~/.hermes/skills/<category>/<skill>/SKILL.md`.
Expose the k2 fork's skills as the `brain` category:

```bash
ln -s ~/gbrain-k2/skills ~/.hermes/skills/brain
hermes skills list | grep ^brain/    # verify discovery
```

All 27+ k2 skills now appear as `brain/brain-ops`, `brain/enrich`,
`brain/zettel-processor`, etc. Because this is a symlink, any fork update
(via `/update-k2` or direct edit) is live to Hermes on the next session.

If `hermes skills list` misses the symlinked skills, some Hermes builds
require explicit enable per skill — batch-enable with:

```bash
for d in ~/.hermes/skills/brain/*/; do
  name=$(basename "$d")
  [ -f "$d/SKILL.md" ] && hermes skills enable "brain/$name"
done
```

## Step 4: Read the K2 schema

Before any brain operations, read these three files:

1. `~/gbrain-k2/docs/K2_SCHEMA.md` — authoritative schema (v0.4.0+)
2. `~/gbrain-k2/skills/_brain-filing-rules.md` — filing decisions
3. `~/gbrain-k2/skills/RESOLVER.md` — skill dispatcher

Save RESOLVER.md to Hermes's persistent memory.

Non-negotiables from K2_SCHEMA.md:

- Never write to, modify, or move anything under `human/` except the zettel
  archival move (`human/zettel/foo.md` → `archive/human/zettel/foo.md`),
  which requires explicit human approval per zettel.
- Never write to `sources/`. `sources/` is strictly immutable reference.
- Entity cross-refs use markdown links `[Name](../category/slug.md)`, NOT
  wikilinks. `[[YYYY-MM-DD]]` wikilinks are reserved for date stubs only.
- Sources go in a `## Sources` body section, NOT frontmatter.
- Imported tags, PARA fields, folder location are evidence, not truth.

## Step 5: Sanity-check the brain

```bash
cd ~/brain-vault
gbrain doctor --json              # health check
gbrain query "who is the user"    # should return meaningful results
gbrain import ~/brain-vault/ --no-embed    # pick up anything missed
gbrain embed --stale              # re-embed any stale chunks
```

If `doctor` reports issues or `query` returns nothing, STOP and diagnose.
The brain should be fully populated from the Claude-side intake.

## Step 6: Start the autopilot daemon

Autopilot is a code-only loop: sync → extract → embed → health check on an
adaptive interval. Replaces the upstream "live sync every 15 min" cron.
Keeps the DB consistent with the filesystem. No LLM cost.

```bash
gbrain autopilot --install --repo ~/brain-vault
gbrain autopilot --status
```

Logs land in `~/.gbrain/autopilot.log`. Self-restarts on crash. On Linux
installs as a systemd user unit; on macOS as a launchd job.

## Step 7: Wire the scheduled jobs

Hermes's cron config lives in `~/.hermes/config.yaml` (or
`~/.hermes/hermes-agent/cron/jobs.py` depending on version). The baseline
schedule mirrors upstream gbrain with k2-specific additions:

| Cadence | Action | Notes |
|---------|--------|-------|
| Daily (morning) | `brain/briefing` + `brain/daily-task-prep` | User's morning channel |
| Daily (evening) | `brain/zettel-processor` maintenance scan | Queues archival candidates; surfaces to user via messaging |
| Daily | `gbrain check-update --json` | Tell user if a k2 update is available; never auto-install |
| Nightly | Dream cycle | Entity sweep, citation fixes, memory consolidation. See `~/gbrain-k2/docs/guides/cron-schedule.md` for the full protocol. |
| Weekly | `brain/maintain` full lint + `gbrain doctor --json` + `gbrain embed --stale` | Post a report |

**NOT cron:**
- `signal-detector` — always-on per-message hook, fires on every inbound
  signal during active sessions. Configure as a message-level trigger, not
  a scheduler.
- `brain-ops` — per-request read/enrich/write loop. Invoked by other skills
  when a brain interaction happens. Not a standalone cron.

Cron design rules (from K2_SCHEMA.md operational pipeline):
- Silent when nothing happens — no "nothing to report" noise
- Respect quiet hours defined in HEARTBEAT.md (if present) or user prefs
- Idempotent: each cron tracks what it has processed
- Every ingest cron must call `enrich` on the entities it touches

## Step 8: Integrations (optional, per user need)

```bash
gbrain integrations list       # see available recipes
gbrain integrations doctor     # check existing config
```

Each recipe in `~/gbrain-k2/recipes/` is a self-contained installer. Ask
the user which they want (email, calendar, Telegram, X, etc.) — don't
install all by default.

## Step 9: Verify

- `gbrain doctor --json` — all checks pass
- `gbrain autopilot --status` — daemon running, last cycle recent
- `hermes skills list | grep ^brain/` — 27+ skills discoverable
- A test message to the Telegram channel produces an expected reply
- `gbrain query "recent themes"` returns coherent output

Report status to the user. Flag anything that didn't verify cleanly.

---

## Upgrade the fork later

```bash
cd ~/gbrain-k2
git pull origin master   # upstream k2 mods
# OR use the update-k2 skill for upstream gbrain merges:
#   Read ~/gbrain-k2/skills/update-k2/SKILL.md and follow it
bun install
gbrain init              # idempotent schema migrations
```

The skill symlink at `~/.hermes/skills/brain` auto-picks up skill changes.
For CLI changes, the user may need to re-run `bun link` from `~/gbrain-k2`.

## Non-goals for this install

- **Initial wiki compilation** — done by Claude Code intake, not Hermes
- **Rebuilding the Obsidian vault** — sources are immutable, wiki pages are
  already compiled
- **Fork maintenance** — push to upstream is forbidden; use `/update-k2` skill
- **Obsidian base queries** — the user recreates those in Obsidian directly

## Safety rails

- Never write to `sources/`. Not metadata, not file moves, not deletions.
- Never write to `human/` except the gated zettel archival move.
- Never push any git remote other than `origin` on `~/gbrain-k2`. Upstream
  (`garrytan/gbrain`) is not a PR target.
- Unsure about a category decision → `inbox/` with `flagged: human-review`,
  never a guess.
- If `gbrain doctor` reports errors, STOP and ask the user before taking
  corrective action.

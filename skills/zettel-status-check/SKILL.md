---
name: zettel-status-check
version: 1.0.0
description: |
  Check zettel lifecycle state: surface archival candidates, execute approved
  archival moves, and handle orphan citations when zettels are manually moved
  into archive. Scope is human/zettel/ only. Does NOT compile — that belongs
  to maintain's content-recompile phase.
triggers:
  - "check zettel archival candidates"
  - "archive zettel"
  - "zettel status"
  - "process zettel archival"
  - human manually moved a zettel to human/zettel/archive/
tools:
  - bash
mutating: true
---

# Zettel Status Check Skill

Zettel lifecycle management: archival candidacy, approved archival, and
citation rewriting after manual archive moves. Compilation of zettel content
into wiki pages is handled by `maintain` (content-recompile phase), not here.

> **Filing rule:** Read `skills/_brain-filing-rules.md` before any edit.
> **Schema:** See `~/gbrain-k2/K2_SCHEMA.md` Operating Principle 6.

## Contract

- Zettels under `human/zettel/` are read-only. Only mutation permitted is the
  archival move (`human/zettel/X.md` → `human/zettel/archive/X.md`), gated on
  explicit human approval.
- Human intent outranks candidacy heuristics. Explicit approval trumps any rule.
- Archival candidates are surfaced to the messaging channel. This skill never
  auto-archives.
- **Citation rewrites in wiki pages are handled by `maintain`, not here.**
  After this skill moves a zettel, maintain's next run detects the `D`
  (delete) + `A` (add under archive/) pair and rewrites citations. This skill
  never touches agent-owned wiki pages.

## Iron Law: Back-Linking (MANDATORY)

When a zettel archival rewrites citations, any back-links pointing to affected
pages remain valid. See `skills/conventions/quality.md` for citation format.

## When To Fire

- Scheduled evening pass: surface archival candidates for human review
- User command: "check zettel archival candidates", "archive zettel X"
- Human approves a specific candidate
- Human manually moved a zettel into `human/zettel/archive/`

Does NOT fire for:
- Zettel compilation into wiki pages — use `maintain` (recompile phase)
- General brain maintenance — use `maintain` (health check dimensions)

## Phases

### 1. Discover

Discovery is a filesystem operation, not a semantic search. Never use
`gbrain query` or `gbrain search` to find zettels — those return compiled
wiki content, not filesystem state.

**List active zettels (not already archived):**

```bash
find ~/brain-vault/human/zettel -maxdepth 1 -name "*.md" -type f
```

**For each zettel, find wiki pages that cite it:**

```bash
# Substitute <basename> with the zettel filename without extension
grep -rl "human/zettel/<basename>" ~/brain-vault \
  --include="*.md" \
  --exclude-dir=human \
  --exclude-dir=sources \
  --exclude-dir=.git \
  --exclude-dir=.obsidian
```

Output: list of `(zettel_path, [citing_pages], zettel_mtime)` tuples.

### 2. Classify

For each tuple, assign one label:

- **Uncompiled** — `citing_pages` is empty. The zettel has no wiki page yet.
  → NOT this skill's responsibility. `maintain`'s content-recompile phase
    handles compilation. Surface as a note in the report but do not act.
- **Active** — `citing_pages` non-empty AND `zettel_mtime` within last 7 days.
  The zettel is still being developed. No archival action.
- **Stable-compiled** — `citing_pages` non-empty AND `zettel_mtime` older than
  7 days. Candidate for archival review, conditions apply below.
- **Candidate for archival** — stable-compiled AND one of:
  - exactly one citing page AND that page's Compiled Truth fully subsumes
    the zettel content (wholesale-compiled), or
  - mature multi-target zettel: long, stable, functioning as a source
    reservoir rather than active live writing.
  → Phase 3.
- **Orphan (archived without citation rewrite)** — `citing_pages` mention the
  zettel at `human/zettel/<name>.md` but the file has moved to
  `human/zettel/archive/<name>.md`. → Phase 5.

### 3. Surface candidates

Package each `candidate for archival` into the output report:

```
- path: human/zettel/<name>.md
  compiled_to: <category>/<page-slug>.md
  stable_since: YYYY-MM-DD
  rationale: <one sentence — wholesale or mature-multi-target>
```

Deliver via the configured messaging channel. Do NOT execute any move here.

### 4. Execute approved archival

Only when the human explicitly approves a specific candidate:

1. **Re-verify candidacy** — if the zettel has been edited since prompt
   emission, candidacy lapsed. Skip and re-surface next cycle.
2. **Move the file:**
   ```bash
   mv ~/brain-vault/human/zettel/<name>.md \
      ~/brain-vault/human/zettel/archive/<name>.md
   ```
3. **Log the move** in the status-check report.
4. **Stop here.** Citation rewrites happen in maintain's next run: it will
   detect the `D human/zettel/<name>.md` + `A human/zettel/archive/<name>.md`
   pair and rewrite citations in affected wiki pages. Do NOT rewrite them
   from this skill — keep agent-owned wiki mutations in maintain.
5. **Denial path:** if the human denies archival, record the denial and
   exclude from candidacy for a 30-day cooldown.

### 5. Flag orphans for maintain

If Phase 2 found orphan zettels (manually moved to archive, citations not
yet updated), **do not rewrite citations here**. Log the orphan paths in the
status-check report so `maintain` picks them up on its next run via the
same D+A file-change detection pipeline.

If the orphan predates the last maintain checkpoint and maintain missed it
(e.g. manual archive move happened while maintain was disabled), surface
the orphan paths to the report as a note: "Pre-checkpoint orphan, run
maintain with `--reset-checkpoint` to pick up."

## Output Format

Per-run log line:
```
Zettel status: N total, C candidates, O orphans fixed, A archived, D denied
```

Full report sections:
- Archival candidates surfaced (awaiting human decision)
- Archival executions completed (approved this cycle)
- Orphan citations fixed (zettels manually archived)
- Uncompiled zettels flagged (for maintain's next recompile pass)
- Denials recorded (for cooldown tracking)

## Interactions

- `maintain` — content-recompile phase handles zettel → wiki compilation.
  This skill never compiles. If a zettel appears uncompiled in Phase 2, note
  it and let maintain handle it.
- `signal-detector` — runs per-message in Hermes, handles ambient capture.
  Unrelated to zettel lifecycle.

## Anti-Patterns

- **Using `gbrain query` for discovery.** Semantic search over content has no
  concept of filesystem state or archival status. Use `find`/`grep`.
- **Compiling zettels into wiki pages from this skill.** That's `maintain`'s
  recompile phase. This skill is lifecycle only.
- **Modifying a zettel's content.** Never — not typo fixes, not reformatting.
- **Auto-archiving without explicit human approval.** Bulk archival does not
  exist. Every archival is per-zettel human-approved.
- **Overriding explicit human archival intent with candidacy heuristics.**
  If the human said "archive this," the rules defer to human intent.
- **Scanning outside `human/zettel/`.** This skill's scope is zettel lifecycle
  only.

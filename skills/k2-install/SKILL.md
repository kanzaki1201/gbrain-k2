---
name: k2-install
version: 1.0.0
description: |
  One-time install and migrate prompt for the k2 brain vault. Run this in
  hermes-agent (or equivalent) when setting up a fresh brain-vault/ from an
  imported Obsidian snapshot. Installs gbrain-k2, runs first compile pass,
  validates frontmatter, reports state.
triggers:
  - "install k2 brain"
  - "set up k2 vault"
  - "migrate obsidian to k2"
  - "first compile pass"
tools:
  - bash
  - file_read
  - file_write
  - search
mutating: true
---

# K2 Brain Install + First Migrate

This skill is run ONCE by the human's external agent (hermes, openclaw, or
equivalent) to set up a fresh k2 brain vault from an imported Obsidian snapshot.

**Run order:** the human has already completed vault creation (steps 0a-0c below).
This skill starts from step 1.

## Contract

This skill guarantees:
- gbrain CLI is installed and pointed at the brain-vault
- `docs/K2_SCHEMA.md` and `skills/_brain-filing-rules.md` are both read and
  understood before any compile work begins
- The first compile pass reads ONLY from `sources/` and writes ONLY to category
  folders (never to `sources/`)
- Every generated wiki page has Obsidian-compatible frontmatter per K2_SCHEMA.md
- A completion report enumerates pages created, pages flagged for review, and
  source files skipped (with reasons)

## Pre-flight: Human-Completed Setup

Before running this skill, the human should have already:

- **0a.** Created `~/brain-vault/` manually.
- **0b.** Copied `.obsidian/` and plugin dotfolders from the original Obsidian
  vault into `~/brain-vault/`.
- **0c.** Opened `~/brain-vault/` in Obsidian and moved all non-dotfile content
  from vault root into `sources/YYYY-MM-DD-obsidian-import/` via Obsidian's
  move operation (so internal wikilinks rewrite).

If any of these are incomplete, STOP and tell the human what to do. Do not
attempt to perform steps 0a-0c — filesystem-level moves from this agent could
break wikilink integrity.

## Phase 1 — Install gbrain-k2

1. Confirm the k2 fork is accessible (public repo: `kanzaki1201/gbrain-k2`).
2. Install gbrain (the tool) per its README. If using a system gbrain binary,
   verify it's compatible with the k2 fork version.
3. Point gbrain at `~/brain-vault/`:
   ```bash
   cd ~/brain-vault && gbrain init
   ```
4. Link the k2 skill pack:
   ```bash
   # Option A (recommended): clone the fork as a sibling
   git clone https://github.com/kanzaki1201/gbrain-k2.git ~/gbrain-k2
   # Then point gbrain at the fork's skills/ directory per gbrain's config
   # Option B: run install from within the fork checkout if the tool supports it
   ```
5. Verify: `gbrain status` should show brain-vault as the active brain and
   list the k2 skills.

## Phase 2 — Read the K2 schema (MANDATORY)

Before any compile work:

1. Read `docs/K2_SCHEMA.md` (in the fork) end to end.
2. Read `skills/_brain-filing-rules.md` end to end.
3. Read `skills/repo-architecture/SKILL.md` end to end.
4. Internalize these non-negotiables:
   - Never write to `sources/`.
   - Treat imported frontmatter tags, PARA, archive status as evidence only.
   - Emit Obsidian-compatible frontmatter on every generated page.
   - Use `[[YYYY-MM-DD]]` date-link syntax for semantic dates; plain ISO for
     technical metadata (`created`, `updated`).
   - Unified status vocabulary: `todo | doing | done | cancelled | paused`
     for projects and media. `usage: active | trying | abandoned` for tools.

## Phase 3 — Dry-run the first compile pass

1. List all source files under `sources/YYYY-MM-DD-obsidian-import/`:
   ```bash
   find ~/brain-vault/sources -name "*.md" | wc -l
   ```
2. Sample 20 random source files. For each, determine (without writing anything):
   - Which category would the compiled wiki page go in?
   - What would the frontmatter be?
   - What are the source citations?
3. If ≥ 15 of 20 samples have clear category decisions and well-formed
   frontmatter, proceed to Phase 4. If < 15, STOP and report the ambiguities
   to the human for schema refinement.

## Phase 4 — First compile pass

Process sources in this order (highest-signal first):

1. **People.** Walk sources for named humans. Create `people/{slug}.md` pages
   with State, What They Believe, What They're Building, Timeline, Sources.
   Merge aliases. Check for duplicates via grep before creating.
2. **Companies.** Extract orgs mentioned. Create `companies/{slug}.md`.
3. **Places.** Extract locations. Create `places/{slug}.md`.
4. **Tools.** Extract software/hardware/apps. Create `tools/{slug}.md` with
   `tool-type`, `usage`, `stack` frontmatter.
5. **Media.** Films, TV, anime, games, books etc. Create `media/{slug}.md`
   with `media-type` frontmatter.
6. **Concepts.** Extract mental models, theory. Create `concepts/{slug}.md`.
7. **How-tos.** Extract process docs. Create `how-to/{slug}.md` with
   `tools-needed`, `verified` frontmatter.
8. **Projects.** Active builds. Create `projects/{slug}.md`.
9. **Ideas.** Unexecuted possibilities. Create `ideas/{slug}.md`.
10. **Household, personal, decisions, meetings, writing, org.** Lower volume;
    handle last.
11. **Flagged / unclear.** File in `inbox/` with a `flagged: human-review`
    frontmatter field and a comment explaining the ambiguity.

For each generated page:
- Populate `sources` frontmatter with paths to every contributing source file.
- Add timeline entries citing each source with dates.
- Cross-link to other generated entities bidirectionally.
- Emit wikilinks `[[target]]` for intra-vault references when the target exists
  or is being created in this pass.

## Phase 5 — Validate frontmatter

Run a validator (manual if no skill exists) that checks every generated wiki
page for:

- Required global fields present: `title`, `type`, `tags`, `created`, `updated`, `sources`
- `type` matches folder name
- `sources` list is non-empty
- Category-specific required fields present (see K2_SCHEMA.md per-category)
- Date fields using correct format (`[[YYYY-MM-DD]]` for semantic dates, plain
  ISO for technical metadata)

Any page failing validation: move to `inbox/` with `flagged: invalid-frontmatter`
and note the specific issue. Do not delete.

## Phase 6 — Report

Write a report to `~/brain-vault/inbox/k2-install-report.md` with:

```markdown
# K2 Install Report — YYYY-MM-DD

## Summary
- Sources scanned: N
- Wiki pages created: M
- Pages flagged for human review: K
- Source files skipped (with reason): J

## Pages created per category
| Category | Count |
|----------|-------|
| people | ... |
| places | ... |
| ...    | ...   |

## Flagged items
(list each with path and reason)

## Skipped source files
(list each with path and reason — e.g. "empty file", "binary, not markdown",
"no extractable content")

## Quality caveats
(anything the human should know — e.g. "low confidence on N people pages due
to sparse evidence", "M pages contain contradictory information marked for
resolution")

## Suggested next actions
(what the human should do — e.g. "review 15 flagged pages in inbox/",
"create a 'vtb' tag filter base in Obsidian", etc.)
```

Notify the human when complete. Do not auto-run maintenance loops until the
human has reviewed the report.

## Non-goals (explicitly out of scope for this install)

- Setting up automated ingest pipelines (meetings, email, social). Those are
  configured later.
- Modifying existing Obsidian bases. Bases are human-maintained filters; the
  human will recreate them against the new schema as needed.
- Fixing imported content quality. Sources are immutable; any "fix" happens in
  the compiled wiki layer.
- Running enrichment APIs (external data lookups). First pass is sources-only;
  enrichment can run after human approves the base.

## Safety Rails

- Never write to `sources/`. Not even metadata. Not even file moves.
- Never delete source files.
- Never push to any git remote other than `origin` on `~/gbrain-k2` (and only
  when the human explicitly asks). The k2 fork must not accidentally open PRs
  against upstream garrytan/gbrain.
- If unsure about a category decision, file to `inbox/` with a flag. Do not
  guess.

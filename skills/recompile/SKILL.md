---
name: recompile
version: 1.0.0
description: |
  Detect file changes in human/ and sources/ since the last recompile
  checkpoint, then compile or re-compile affected wiki pages. Owns
  ~/gbrain-k2/reports/recompile-checkpoint.txt. LLM work: create wiki pages from new
  zettels, rewrite Compiled Truth for updated zettels, handle archive moves
  via D+A pair detection.
triggers:
  - "recompile brain"
  - "compile zettels"
  - "compile new sources"
  - new or updated file in human/zettel/ or sources/
tools:
  - bash
mutating: true
---

# Recompile Skill

Keep the wiki in sync with raw content. This is the "filesystem → wiki"
production skill — separate from `maintain` (which audits quality) and
from `zettel-status-check` (which handles zettel lifecycle).

> **Recommended cadence:** every 4 hours (cron). Short enough to catch new
> obsidian-authored zettels within one waking window; long enough that
> quiet periods don't waste LLM calls.

> **Scope boundary:** this skill compiles content. It does NOT audit
> citations, fix orphans, or run health checks — those belong to `maintain`.

## Contract

- File changes in `human/` and `sources/` since the last recompile checkpoint
  trigger wiki page creation or updates.
- Every compiled wiki page cites its source(s) with inline `^[...]` footnotes
  and markdown-link `## Sources` entries.
- Every entity mention in a compiled page creates a back-link on the entity
  page (Iron Law — see `skills/conventions/quality.md`).
- `human/` files are read-only. The skill never modifies zettel content.
- `sources/` files are immutable. The skill never moves or edits source files.
- Archive moves (`human/zettel/X.md` → `human/zettel/archive/X.md`) are
  detected as `D+A` pairs in git diff and trigger citation-path rewrites in
  citing wiki pages.
- The checkpoint advances only after the full compile loop succeeds.

## Iron Law: Back-Linking (MANDATORY)

Every entity mentioned in a compiled wiki page gets a back-link on the
entity's own page. See `skills/conventions/quality.md` for format.

## Phases

### Phase 0: Snapshot

Commit the current vault state so recompile's edits land on their own commit.

```bash
cd ~/brain-vault
git add -A
git commit -m "chore: snapshot before recompile pass" || true
```

### Phase 1: Load checkpoint + compute changes

```bash
CHECKPOINT_FILE=~/gbrain-k2/reports/recompile-checkpoint.txt
CHECKPOINT=$(cat "$CHECKPOINT_FILE" 2>/dev/null || echo "")

cd ~/brain-vault
if [ -n "$CHECKPOINT" ] && git cat-file -e "$CHECKPOINT" 2>/dev/null; then
  # Incremental: name-status format gives A/M/D per file
  git diff --name-status "$CHECKPOINT"..HEAD -- 'human/' 'sources/'
else
  # First run or invalid checkpoint: treat all as new
  find human/ sources/ -name "*.md" -type f -not -path "*/archive/*" \
    | sed 's|^|A\t|'
fi
```

Output per line: `<STATUS>\t<path>` where STATUS is `A` (added), `M` (modified),
`D` (deleted), or `R<score>\t<old>\t<new>` (renamed).

### Phase 2: Route each change

| Status | Path pattern | Action |
|--------|-------------|--------|
| `A` | `human/zettel/<name>.md` | Compile into wiki: apply `_brain-filing-rules.md` + `repo-architecture/SKILL.md`, decide shape (wholesale / multi-target / unclear), create or update wiki page(s), cite zettel in `## Sources`, add timeline entry, enforce back-links. |
| `A` | `sources/**/*.md` | Compile into wiki: route by content type (clipping/article → idea-ingest pattern; media/pdf → media-ingest pattern; meeting transcript → meeting-ingestion pattern). Create a PARALLEL wiki page citing the source via markdown link. Source file stays in `sources/` — never moved, never modified. |
| `A` | `human/<other>` | Flag for human review. Human owns this zone; agent should not guess. |
| `M` | `human/zettel/<name>.md` | Recompile: find citing wiki pages (`grep -rl "human/zettel/<name>"`), rewrite Compiled Truth based on current zettel content, append timeline entry `- **YYYY-MM-DD** \| zettel updated ^[Source: human/zettel/<name>.md, YYYY-MM-DD]`. Do NOT modify the zettel. |
| `M` | `sources/**/*.md` | Recompile wiki pages that cite this source. If no wiki page exists, treat like `A` and compile. Do NOT modify the source. |
| `D` | `human/zettel/<name>.md` | Check if file moved to `human/zettel/archive/`. If yes → rewrite citations in citing wiki pages from old path to archive path. If truly deleted → flag citing wiki pages as orphan sources, surface for human review. |
| `D` | `sources/**/*.md` | Flag citing wiki pages as orphan sources. Do not auto-delete. |
| `R` | any | Treat as `D <old>` + `A <new>`. |

### Phase 3: Compile loop

For each `A` or `M` in `human/zettel/`:

1. Read zettel content.
2. Apply filing rules to decide primary category + entities.
3. Decide shape:
   - **Wholesale** — maps 1:1 to one wiki page. Create or update that page.
   - **Multi-target** — contributes to multiple pages. Fan out.
   - **Below threshold** — too short, too vague, or not notable enough for a
     wiki page. Skip. Mention in the reply as "skipped (below threshold)."
     Do NOT create inbox/triage pages — those flood the vault with
     operational noise.
4. For each affected wiki page:
   - Update `## Sources` with a markdown link to the zettel.
   - Append a dated Timeline entry with `^[Source: ...]` citation.
   - Cross-link entities per Iron Law.
5. Never modify the zettel itself. Preserve its mtime.

For each `A` or `M` in `sources/`:

1. Read source content.
2. Route by type (clipping → idea-ingest pattern; PDF/video → media-ingest;
   meeting → meeting-ingestion).
3. Create a PARALLEL wiki page that cites the source via markdown link.
4. Never modify or move the source file.

For `D` pairs detected as archive moves (`D human/zettel/X.md` +
`A human/zettel/archive/X.md`):

```bash
# Rewrite citations in citing pages
for page in $(grep -rl "human/zettel/<name>" ~/brain-vault \
    --include="*.md" \
    --exclude-dir=human --exclude-dir=sources \
    --exclude-dir=.git --exclude-dir=.obsidian); do
  sed -i 's|human/zettel/<name>.md|human/zettel/archive/<name>.md|g' "$page"
done
```

### Phase 4: Save checkpoint + log

```bash
git rev-parse HEAD > ~/gbrain-k2/reports/recompile-checkpoint.txt
echo "$(date -Iminutes) | recompile | processed N files" >> ~/brain-vault/log.md
```

## Output Format

The report is your **reply** — delivered via the messaging channel. Do NOT
write report files to the vault. The vault stores knowledge; operational
reports belong in chat.

```
Recompile: N files processed (A added: X, M modified: Y, D deleted: Z)
  Compiled: <zettel/source path> → <wiki page(s)>
  Recompiled: <zettel/source path> → <wiki page(s)>
  Archive moves: N citations rewritten
  Orphans flagged: <page> cites missing source
  Skipped: <path> (human/<other>, awaits human review)
```

If nothing changed (0 files in diff), reply with a one-liner: "Recompile:
0 files since last checkpoint. Nothing to do."

## Interactions

- `maintain` — runs after (or independently). Audits quality of the wiki
  pages recompile produces. Owns its own checkpoint.
- `zettel-status-check` — handles zettel archival lifecycle. When it `mv`s
  a zettel to archive, recompile's NEXT run picks up the D+A pair and
  rewrites citations. The two skills never touch the same files directly.
- `signal-detector` — per-message capture in Hermes. Unrelated to this skill.

## Anti-Patterns

- **Using `gbrain query` for discovery.** Semantic search has no concept of
  file changes or filesystem state. Always use `git diff` against the
  checkpoint.
- **Modifying zettel content.** Not even typo fixes. Flag to human.
- **Moving or modifying `sources/`.** K2_SCHEMA §1 — immutable. Sources are
  cited by parallel wiki pages, never relocated.
- **Running without a snapshot.** Phase 0 is mandatory. Recompile edits
  are reviewable only if they land on their own commit.
- **Advancing the checkpoint on partial success.** If the compile loop
  errors mid-run, leave the checkpoint pointing at the last known-good
  state so the next run retries.

---
name: maintain
version: 2.0.0
description: |
  Keep the wiki aligned with raw content: recompile wiki pages when files in
  human/ or sources/ change (new, edited, deleted), then run brain health
  checks (stale pages, orphan pages, dead links, citation audit, filing
  validation, back-link iron law).
triggers:
  - "brain health"
  - "check backlinks"
  - "citation audit"
  - "maintenance"
  - "orphan pages"
  - "stale pages"
  - "recompile brain"
  - new or updated file in human/ or sources/
tools:
  - bash
mutating: true
---

# Maintain Skill

Active content recompilation + brain health checks. Keeps compiled wiki
pages in sync with raw content in `human/` and `sources/`, then audits and
repairs health issues.

> **Recommended cadence:** nightly full pass (02:00 by default).

> **Scheduled role in K2 cadence:**
> - nightly job: `maintain` (full pass: recompile + health)
> - weekly deeper pass: `maintain` + `gbrain doctor --json` + `gbrain embed --stale`
> - evening zettel lifecycle: `zettel-status-check` (archival candidates only — no recompile)

## Contract

This skill guarantees:
- File changes in `human/` and `sources/` since last run trigger wiki recompilation
- All health dimensions are checked (stale, orphan, dead links, cross-refs, backlinks, citations, filing, tags)
- Each issue found has a specific fix action
- Back-link iron law is enforced
- Citation format is validated against the standard
- Results are reported with counts per dimension
- A checkpoint is written so the next run only processes what changed since

## Phases

### Phase 0: Snapshot

Commit the current vault state so the maintenance diff lands on its own
clean commit, isolated from drift since the last auto-commit.

```bash
cd ~/brain-vault
git add -A
git commit -m "chore: snapshot before maintenance pass" || true
```

The `|| true` is important — if nothing changed since the last auto-commit,
the commit fails with "nothing to commit" and that's fine. Subsequent edits
land on their own commit.

### Phase 1: Content Recompile (file-change-driven)

Detect raw-content changes in `human/` and `sources/` since the last run,
then recompile affected wiki pages. This is the active sync from raw content
to compiled wiki.

**1a. Load checkpoint:**

```bash
CHECKPOINT_FILE=~/.gbrain/maintain-checkpoint.txt
CHECKPOINT=$(cat "$CHECKPOINT_FILE" 2>/dev/null || echo "")
```

**1b. Compute changes since checkpoint:**

```bash
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

Output format per line: `<STATUS>\t<path>` where STATUS is `A` (added),
`M` (modified), `D` (deleted), or `R<score>\t<old>\t<new>` (renamed).

**1c. Route each change to the right handler:**

| Status | Path pattern | Action |
|--------|-------------|--------|
| `A` | `human/zettel/<name>.md` | Compile into wiki: apply `_brain-filing-rules.md` + `repo-architecture/SKILL.md`, decide shape (wholesale / multi-target / unclear), create or update wiki page(s), cite zettel in `## Sources`, add timeline entry, enforce back-links. |
| `A` | `sources/**/*.md` | **Do not auto-compile.** Sources are passive reference per K2_SCHEMA §1. Add to report as "new source available, awaits explicit ingest." Skip. |
| `A` | `human/<other>` | Flag for human review. Human owns this zone; agent should not guess. |
| `M` | `human/zettel/<name>.md` | Recompile: find citing wiki pages (`grep -rl "human/zettel/<name>"`), rewrite Compiled Truth based on current zettel content, append timeline entry `- **YYYY-MM-DD** \| zettel updated ^[Source: human/zettel/<name>.md, YYYY-MM-DD]`. Do NOT modify the zettel. |
| `M` | `sources/**/*.md` | Only recompile if wiki pages cite this source. Skip otherwise. |
| `D` | `human/zettel/<name>.md` | Check if file moved to `human/zettel/archive/`. If yes → hand off to `zettel-status-check` for citation rewrite. If truly deleted (not in archive either) → flag citing wiki pages as orphan sources, surface for human review. |
| `D` | `sources/**/*.md` | Flag citing wiki pages as orphan sources. Do not auto-delete. |
| `R` | any | Treat as `D <old>` + `A <new>`. |

**1d. Run the compile loop.** For each `A` or `M` in `human/zettel/`:

1. Read zettel content.
2. Apply filing rules to decide primary category + entities.
3. Create or update wiki page(s) with citations, timeline, cross-links.
4. Never modify the zettel. Preserve its mtime.

**1e. Save checkpoint:**

```bash
git rev-parse HEAD > "$CHECKPOINT_FILE"
```

**1f. Log to vault log.md:**

```bash
echo "$(date -Iminutes) | maintain-recompile | processed N files" >> ~/brain-vault/log.md
```

### Phase 2: Health check

Check gbrain health to get the dashboard, then iterate the dimensions below.

### Phase 3: Check each dimension

### Stale pages
Pages where compiled_truth is older than the latest timeline entry. The assessment hasn't been updated to reflect recent evidence.
- Check the health output for stale page count
- For each stale page: read the page from gbrain, review timeline, determine if compiled_truth needs rewriting

### Orphan pages
Pages with zero inbound links. Nobody references them.
- Review orphans: are they genuinely isolated or just missing links?
- Add links in gbrain from related pages or flag for deletion

### Dead links
Links pointing to pages that don't exist.
- Remove dead links in gbrain

### Missing cross-references
Pages that mention entity names but don't have formal links.
- Read compiled_truth from gbrain, extract entity mentions, create links in gbrain

### Link graph extraction
If link_count is 0 or low relative to page_count, run batch extraction:
```bash
gbrain extract links --dir ~/brain
```
This scans all markdown files for entity references, See Also sections, and
frontmatter fields, then creates typed links in the database.

### Timeline extraction
If timeline_entry_count is 0, extract structured timeline from markdown:
```bash
gbrain extract timeline --dir ~/brain
```
Parses `- **YYYY-MM-DD** | Source — Summary` and `### YYYY-MM-DD — Title` formats.
Note: extracted entries improve structured queries (`gbrain timeline`), not vector search.

### Autopilot check
Verify autopilot is running:
```bash
gbrain autopilot --status
```
If not running, install it:
```bash
gbrain autopilot --install --repo ~/brain
```
Autopilot runs sync, extract, and embed in a continuous loop with adaptive scheduling.

### Back-link enforcement
Check that the back-linking iron law is being followed:
- For each recently updated page, check if entities mentioned in it have
  corresponding back-links FROM those entity pages
- A mention without a back-link is a broken brain
- Fix: add the missing back-link to the entity's Timeline or See Also section
- Format: `- **YYYY-MM-DD** | Referenced in [page title](path) -- brief context`

### Filing rule violations
Check for common misfiling patterns (see `skills/_brain-filing-rules.md`):
- Content with clear primary subjects filed in `sources/` instead of the
  appropriate directory (people/, companies/, concepts/, etc.)
- Use gbrain search to find pages in `sources/` that reference specific
  people, companies, or concepts -- these may be misfiled
- Flag misfiled pages for review or re-filing

### Citation audit
Spot-check pages for missing `^[...]` footnote citations:
- Read 5-10 recently updated pages
- Check that compiled truth (above the line) has inline citations
- Check that timeline entries have source attribution
- Flag pages where facts appear without provenance

### Tag consistency
Inconsistent tagging (e.g., "vc" vs "venture-capital", "ai" vs "artificial-intelligence").
- Standardize to the most common variant using gbrain tag operations

### Embedding freshness
Chunks without embeddings, or chunks embedded with an old model.
- For large embedding refreshes (>1000 chunks), use nohup:
  `nohup gbrain embed refresh > /tmp/gbrain-embed.log 2>&1 &`
- Then check progress: `tail -1 /tmp/gbrain-embed.log`

### Security (RLS verification)
Run `gbrain doctor --json` and check the RLS status.
All tables should show RLS enabled. If not, run `gbrain init` again.

### Schema health
Check that the schema version is up to date. `gbrain doctor --json` reports
the current version vs expected. If behind, `gbrain init` runs migrations
automatically.

### File storage health
Check the integrity of stored files and redirect pointers:
- Run `gbrain files verify` to check all DB records have valid data
- Run `gbrain files status` to see migration state (local, mirrored, redirected)
- Check for orphan `.redirect.yaml` pointers that reference missing storage files
- Check for large binary files (>= 100 MB) still in git that should be in cloud storage
- If storage backend is configured: verify redirect pointers resolve (download test)

### Open threads
Timeline items older than 30 days with unresolved action items.
- Flag for review

## Benchmark Testing

Periodically verify search quality hasn't regressed. Run a battery of test
queries across difficulty tiers:

- **Tier 1 (entity lookup):** known names -- should always resolve
- **Tier 2 (topic recall):** concepts, topics -- keyword search should handle
- **Tier 3 (semantic):** queries with no exact keyword match -- needs embeddings
- **Tier 4 (cross-domain):** relational/connection queries -- only semantic handles

Compare results from `gbrain search` (keyword) vs `gbrain query` (hybrid).
Quality matters more than speed (2.5s right > 200ms wrong).

When to run benchmarks:
- After major brain imports or re-imports
- After gbrain version upgrades
- After embedding regeneration
- Monthly to track quality drift

## Heartbeat Integration

For production agents running on a schedule, integrate gbrain health checks into
your operational heartbeat.

### On every heartbeat (hourly or per-session)

Run `gbrain doctor --json` and check for degradation. Report any failing checks
to the user. Key signals: connection health, schema version, RLS status, embedding
staleness.

### Weekly maintenance

Run `gbrain embed --stale` to refresh embeddings for pages that have changed since
their last embedding. For large brains (>5000 pages), run this with nohup:
```bash
nohup gbrain embed --stale > /tmp/gbrain-embed.log 2>&1 &
```

### Daily verification

Verify sync is running: check `gbrain stats` and confirm `last_sync` is within
the last 24 hours. If sync has stopped, the brain is drifting from the repo.

### Stale compiled truth detection

Flag pages where compiled truth is >30 days old but the timeline has recent entries.
This means new evidence exists that hasn't been synthesized. These pages need a
compiled truth rewrite (see the maintain workflow above).

## Report Storage

After maintenance runs, save a report:
- Health check results (before/after scores for each dimension)
- Back-link violations found and fixed
- Filing rule violations found
- Citation gaps flagged
- Benchmark results (if run)
- Outstanding issues requiring user attention

This creates an audit trail for brain health over time.

## Quality Rules

- Never delete pages without confirmation
- Log all changes via timeline entries
- Check gbrain health before and after to show improvement

## Anti-Patterns

- Fixing pages without reading them first -- you must understand context before editing
- Silently skipping dimensions -- every dimension must be checked and reported, even if clean
- Deleting orphan pages without checking if they should be linked instead
- Running embedding refresh during peak usage hours
- Batch-fixing back-links without verifying the relationship is real
- Marking a dimension "clean" without actually querying it
- Rewriting compiled truth without reading the full timeline first
- Removing tags without checking if other pages use the same tag consistently

## Output Format

The maintenance report follows this structure:

```
## Brain Health Report — YYYY-MM-DD

| Dimension           | Issues Found | Fixed | Remaining |
|----------------------|-------------|-------|-----------|
| Stale pages          | N           | N     | N         |
| Orphan pages         | N           | N     | N         |
| Dead links           | N           | N     | N         |
| Missing cross-refs   | N           | N     | N         |
| Back-link violations | N           | N     | N         |
| Citation gaps        | N           | N     | N         |
| Filing violations    | N           | N     | N         |
| Tag inconsistencies  | N           | N     | N         |
| Embedding staleness  | N           | N     | N         |
| Security (RLS)       | N           | N     | N         |
| Schema health        | N           | N     | N         |
| File storage         | N           | N     | N         |
| Open threads         | N           | N     | N         |

### Details
[Per-dimension breakdown with specific pages and actions taken]

### Benchmark Results (if run)
[Tier 1-4 query results with pass/fail]

### Outstanding Issues
[Items requiring user attention or confirmation]
```

## Tools Used

- Check gbrain health (get_health)
- List pages in gbrain with filters (list_pages)
- Read a page from gbrain (get_page)
- Check backlinks in gbrain (get_backlinks)
- Link entities in gbrain (add_link)
- Remove links in gbrain (remove_link)
- Tag a page in gbrain (add_tag)
- Remove a tag in gbrain (remove_tag)
- View timeline in gbrain (get_timeline)

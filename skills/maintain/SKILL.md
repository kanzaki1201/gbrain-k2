---
name: maintain
version: 3.0.0
description: |
  Brain health audit + quality fixes. Back-link iron law enforcement,
  citation audit, filing validation, stale detection, orphan remediation,
  link density, embedding freshness. Owns ~/gbrain-k2/reports/maintain-checkpoint.txt
  so dimension checks can run incrementally on pages changed since last
  maintain pass. Does NOT recompile — that belongs to the recompile skill.
triggers:
  - "brain health"
  - "check backlinks"
  - "citation audit"
  - "maintenance"
  - "orphan pages"
  - "stale pages"
tools:
  - bash
mutating: true
---

# Maintain Skill

Brain health audit + active remediation. **This skill FIXES issues, not
just reports them.** Stale pages get their compiled truth rewritten.
Orphan pages get cross-reference links added. Wikilink violations get
converted. If you finish this skill having only reported issues without
fixing the mechanical ones, you have not followed the skill.

Surfaces what needs human judgment (ambiguous cases only).

> **Recommended cadence:** evening pass at 20:00 (chained after recompile, before zettel-status-check).

> **Scope boundary:** this skill audits + fixes the wiki. It does NOT compile
> raw content from `human/` or `sources/` — that belongs to the `recompile`
> skill. If you're looking for new-zettel compilation, run recompile first.

## Contract

**The default is FIX, not REPORT.** Every dimension that has a mechanical
fix procedure must be executed, not just flagged. Reporting without fixing
mechanical issues is a skill violation.

This skill guarantees:
- `gbrain doctor` runs and the health dashboard is the baseline.
- Each dimension is checked and reported, even if clean.
- Dimensions that make sense incrementally (citation audit, wikilink
  violations, tag consistency, filing check) run only on pages changed
  since the last maintain checkpoint.
- Dimensions that require full-vault scope (orphans, dead links, link
  density, stale detection) run across all agent-owned pages.
- Back-link iron law violations are actively remediated, not just flagged.
- Results are reported with counts per dimension.
- The checkpoint advances after the full pass completes.

## Phases

### Phase 0: Snapshot

```bash
cd ~/brain-vault
git add -A
git commit -m "chore: snapshot before maintenance pass" || true
```

### Phase 1: Load checkpoint + compute changed pages

```bash
CHECKPOINT_FILE=~/gbrain-k2/reports/maintain-checkpoint.txt
CHECKPOINT=$(cat "$CHECKPOINT_FILE" 2>/dev/null || echo "")

cd ~/brain-vault
if [ -n "$CHECKPOINT" ] && git cat-file -e "$CHECKPOINT" 2>/dev/null; then
  # List agent-owned pages changed since last maintain run
  CHANGED_PAGES=$(git diff --name-only "$CHECKPOINT"..HEAD -- \
    'people/' 'companies/' 'projects/' 'tools/' 'concepts/' 'ideas/' \
    'originals/' 'how-to/' 'media/' 'meetings/' 'decisions/' \
    'household/' 'personal/' 'places/' 'writing/' 'org/' 'archive/' 'inbox/')
else
  # First run: treat all agent pages as changed
  CHANGED_PAGES=$(find people companies projects tools concepts ideas \
    originals how-to media meetings decisions household personal places \
    writing org archive inbox -name "*.md" -type f 2>/dev/null)
fi

echo "$CHANGED_PAGES" > /tmp/maintain-changed.txt
echo "Changed agent pages since last maintain: $(wc -l </tmp/maintain-changed.txt)"
```

Save `/tmp/maintain-changed.txt` for Phase 3 incremental dimensions.

### Phase 2: Health check

```bash
gbrain doctor --json
```

Parse the JSON for the dashboard. Use `health_score` when present (fallback to
`brain_score` on older builds), the list of `checks`, and any warnings or
failures as the baseline for the report.

### Phase 3: Dimensions

Run each dimension below. Incremental dimensions scan only the changed pages
from Phase 1. Full-vault dimensions scan everything.

#### Stale pages (full-vault, active rewrite)
Pages where compiled truth is older than the latest timeline entry — the
synthesis hasn't caught up to new evidence. **Active rewrite is the
default, flagging is the exception.**

**Step 1: Detect stale pages.**

```bash
cd ~/brain-vault
for page in $(find people companies projects tools concepts ideas originals \
  decisions household personal places meetings media writing org \
  -name "*.md" -not -name "README.md" 2>/dev/null); do
  max_tl=$(grep -hoE '^- \*\*[0-9]{4}-[0-9]{2}-[0-9]{2}\*\*' "$page" 2>/dev/null \
    | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort -r | head -1)
  [ -z "$max_tl" ] && continue
  mtime=$(date -r "$page" +%Y-%m-%d)
  if [[ "$max_tl" > "$mtime" ]]; then echo "STALE: $page (tl:$max_tl > mtime:$mtime)"; fi
done
```

**Step 2: For each stale page, rewrite compiled truth.**

A page has two sections separated by `---`:
- **Above the line: Compiled Truth** — current-state synthesis (rewritable)
- **Below the line: Timeline** — append-only evidence log (never modify)

Procedure:

1. Read the full page.
2. Identify timeline entries NEWER than the last compiled-truth update.
   These are the evidence the synthesis hasn't absorbed yet.
3. **Rewrite the Compiled Truth section** to incorporate the new evidence.
   This is an LLM synthesis task: read the old compiled truth + the new
   timeline entries, produce an updated compiled truth that reflects ALL
   evidence. The new version REPLACES the old one (compiled truth is
   always current-state, never append-only).
4. **Preserve the Timeline section exactly.** Never edit, reorder, or
   delete timeline entries. They are evidence.
5. **Add a timeline entry** recording the re-sync:
   ```
   - **YYYY-MM-DD** | Compiled truth rewritten to reflect timeline evidence through YYYY-MM-DD ^[Source: maintain stale-page rewrite]
   ```
6. **Enforce back-links.** If the new compiled truth mentions entities
   that don't have back-links yet, add them (same procedure as the
   orphan dimension).
7. **Advance both metadata and mtime.** Prefer updating frontmatter
   `updated:` to today's date and then touching the file so both the
   page metadata and filesystem mtime move past the latest timeline
   date. This keeps the page coherent for humans and prevents the stale
   detector from re-flagging it next cycle.

**When NOT to rewrite:**
- If the "new" timeline entries are trivial (e.g., only back-link
  additions, no substantive new facts) — skip rewrite, update the
  `updated:` field, and touch the file to clear staleness.
- If the compiled truth and new evidence contradict each other and the
  resolution isn't obvious — flag for human review instead of guessing.

Report per stale page: `rewritten` (with summary of what changed),
`touched` (trivial evidence, no content change), or `flagged-ambiguous`.

#### Orphan pages (active remediation)

Scan agent-owned category dirs for pages with zero inbound links.
**Exclude** `archive/`, `reports/`, `human/`, `sources/` from the scan
scope (archive is retired content, human/sources are read-only zones).

**Step 1: Detect orphans with BOTH link types.**

A page is orphan only if it has zero markdown-link refs AND zero
wikilink refs from the entire vault. Obsidian resolves `[[slug]]`
wikilinks from human/ and sources/ — our markdown-link-only grep
misses those and produces false positives.

```bash
SLUG=$(basename "$page" .md)

# Markdown links: [text](path/slug.md)
MD_REFS=$(grep -rlE "\]\([^)]*${SLUG}\.md\)" ~/brain-vault \
  --include="*.md" \
  --exclude-dir=.git --exclude-dir=.obsidian --exclude-dir=.claude \
  2>/dev/null | grep -v "^.*/$page\$" | wc -l)

# Wikilinks: [[slug]] or [[Slug]] (Obsidian resolves by basename)
WL_REFS=$(grep -rlE "\[\[${SLUG}\]\]|\[\[${SLUG}\|" ~/brain-vault \
  --include="*.md" -i \
  --exclude-dir=.git --exclude-dir=.obsidian --exclude-dir=.claude \
  2>/dev/null | grep -v "^.*/$page\$" | wc -l)
```

**Step 2: Classify.**

| MD_REFS | WL_REFS | Classification | Action |
|---------|---------|----------------|--------|
| > 0 | any | Not orphan | Skip |
| 0 | > 0 | Wikilink-only refs | Case C below |
| 0 | 0 | True orphan | Case A or B below |

**Step 3: Triage by case.**

- **Case A — Agent-owned pages mention the entity by name** (grep for
  entity name, not link syntax). Rewrite mentions as markdown links:
  ```
  "we talked to Alice" → "we talked to [Alice](../people/alice.md)"
  ```
  Enforce iron law: append back-link on the orphan's Timeline.

- **Case B — Genuinely isolated** (zero mentions of any kind). Leave as
  orphan. Surface in report with one-line rationale. Do NOT auto-delete.

- **Case C — Wikilink-only refs from agent zones.** These are K2_SCHEMA §4
  violations — agent-owned pages must use markdown links. Run the converter:
  ```bash
  python3 ~/gbrain-k2/scripts/fix-wikilinks.py
  ```
  After conversion, the page will have proper inbound markdown links and
  exit orphan status.
- **Case C2 — Wikilink-only refs from human/ or sources/ only.** The page
  IS referenced but only from read-only zones via wikilinks. Not actionable
  (can't rewrite human/ or sources/). Not a true orphan — Obsidian sees
  the link. Note in report as "wikilink-only from read-only zones."

Report per orphan: `fixed-A-linked-from-N`, `case-B-genuinely-isolated`,
`case-C-wikilinks-converted`, `case-C2-readonly-zones-only`, or
`deferred-ambiguous`.

#### Dead links (full-vault)
Markdown links to pages that don't exist.

```bash
gbrain doctor --json | jq '.checks[] | select(.name=="link_integrity")'
```

Or manually:
```bash
# For each [text](path.md), check the path resolves
grep -rhoE '\]\([^)]+\.md\)' ~/brain-vault --include="*.md" \
  --exclude-dir=.git --exclude-dir=.obsidian --exclude-dir=.claude \
  --exclude-dir=sources | sed 's|^](\(.*\))$|\1|' | sort -u | \
  while read link; do [ -f "$link" ] || echo "DEAD: $link"; done
```

Fix: remove dead link or create the missing target page (via recompile,
not this skill).

#### Missing cross-references (incremental on CHANGED_PAGES)
Pages that mention entity names but don't link them.

```bash
# For each changed page, grep mentions against known entity slugs
# If a mention has no corresponding markdown link, flag or add it
while read page; do
  # ...entity-name detection + link check logic
done < /tmp/maintain-changed.txt
```

#### Link density health (full-vault stats)
Compute `markdown_links / pages` and `timeline_entries / pages` ratios
across agent-owned zones.

```bash
pages=$(find people companies projects tools concepts ideas originals how-to \
  media meetings decisions household personal places writing org -name "*.md" \
  -type f 2>/dev/null | wc -l)
links=$(grep -rhoE '\[[^]]+\]\([^)]+\.md\)' people/ companies/ projects/ \
  tools/ concepts/ ideas/ originals/ how-to/ media/ meetings/ decisions/ \
  household/ personal/ places/ writing/ org/ --include="*.md" 2>/dev/null | wc -l)
timeline=$(grep -rhE '^- \*\*[0-9]{4}-[0-9]{2}-[0-9]{2}\*\* \|' people/ \
  companies/ projects/ tools/ concepts/ ideas/ originals/ how-to/ media/ \
  meetings/ decisions/ household/ personal/ places/ writing/ org/ \
  --include="*.md" 2>/dev/null | wc -l)
echo "Agent-zone links/page: $(python3 -c "print($links/$pages)")"
echo "Agent-zone timeline/page: $(python3 -c "print($timeline/$pages)")"
```

Targets: ≥ 2 links/page, ≥ 0.3 timeline/page. Below target → flag for
recompile/enrichment follow-through.

#### Back-link iron law (incremental on CHANGED_PAGES)
For each entity mentioned in a changed page, confirm the entity's page has
a back-link to the changed page. Mentions without back-links violate the
iron law and must be fixed.

```bash
# For each markdown link in changed pages, check the target has a back-ref
# See skills/conventions/quality.md for back-link format
```

#### Citation audit (incremental on CHANGED_PAGES)
For each changed page, verify every non-trivial fact carries an inline
`^[Source: ...]` footnote (or `## Sources` section for compiled truth).
See `skills/conventions/quality.md`.

Fix: if a fact lacks a citation AND the source is obvious (recent edit,
known origin), add one. Otherwise flag for human confirmation.

#### Wikilink schema violations (incremental on CHANGED_PAGES)
Agent-owned pages should use markdown links for entity refs, not wikilinks
(K2_SCHEMA §4). Run the converter:

```bash
python3 ~/gbrain-k2/scripts/fix-wikilinks.py --dry-run
```

If changes are proposed, review and run without `--dry-run`. Date stubs
`[[YYYY-MM-DD]]` are preserved.

#### Filing rule violations (incremental on CHANGED_PAGES)
Check for misfiled content (see `skills/_brain-filing-rules.md`). Mostly
an issue on new pages — existing misfilings are historical artifacts.

#### Tag consistency (full-vault)
```bash
grep -rhE '^tags:' --include="*.md" people/ companies/ projects/ tools/ \
  concepts/ ideas/ originals/ how-to/ media/ meetings/ decisions/ 2>/dev/null \
  | sort | uniq -c | sort -rn | head -20
```

Standardize synonymous tags (e.g., `vc` vs `venture-capital`). Empty `tags:`
frontmatter fields are OK.

#### Embedding freshness (full-vault)
```bash
gbrain doctor --json | jq '.checks[] | select(.name=="embeddings")'
```

If coverage <95% or missing count growing, run:
```bash
nohup gbrain embed --stale > /tmp/gbrain-embed.log 2>&1 &
```

#### RLS verification (full-vault)
PGLite: N/A. Postgres: check `gbrain doctor --json` for RLS status.

#### Schema health (full-vault)
```bash
gbrain doctor --json | jq '.checks[] | select(.name=="schema_version")'
```

If behind, `gbrain init` migrates automatically.

#### File storage health (full-vault)
```bash
gbrain files verify
```

Check orphan `.redirect.yaml` pointers and large binaries that should
migrate to cloud storage.

#### Open threads (full-vault)
Timeline items 30+ days old with `open`, `pending`, `todo`, `awaiting` or
similar unresolved markers. Flag for human review.

### Phase 4: Save checkpoint + log

```bash
git rev-parse HEAD > ~/gbrain-k2/reports/maintain-checkpoint.txt
echo "$(date -Iminutes) | maintain | health=$SCORE, N issues flagged, M fixed" \
  >> ~/brain-vault/log.md
```

The one-liner in `log.md` is vault telemetry (append-only, low-noise). The
full report goes to the messaging channel, NOT to the vault.

## Output Format

The report is your **reply** via the messaging channel AND written to
`~/gbrain-k2/reports/maintain-report.md` (overwrite each run, not append).
This file is gitignored. It gives the human a persistent last-run snapshot
without scrolling chat history. Do NOT write reports into the brain vault.

Write the report to `~/gbrain-k2/reports/maintain-report.md` (overwrite,
not append) AND deliver as your messaging reply. Format:

```
## Brain Health Report — YYYY-MM-DD HH:MM

Checkpoint: <old> → <new>
Changed pages since last maintain: N

### Doctor
health_score: X/100
warnings: ...

### Dimensions

| Dimension            | Scope       | Found | Fixed | Remaining |
|----------------------|-------------|-------|-------|-----------|
| Stale pages          | full-vault  | N     | N     | N         |
| Orphan pages         | full-vault  | N     | N     | N         |
| Dead links           | full-vault  | N     | N     | N         |
| Missing cross-refs   | incremental | N     | N     | N         |
| Link density         | stats       | ratio | —     | —         |
| Back-link violations | incremental | N     | N     | N         |
| Citation gaps        | incremental | N     | N     | N         |
| Wikilink violations  | incremental | N     | N     | N         |
| Filing violations    | incremental | N     | N     | N         |
| Tag inconsistencies  | full-vault  | N     | N     | N         |
| Embedding staleness  | full-vault  | N     | N     | N         |
| Schema health        | full-vault  | OK    | —     | —         |
| File storage         | full-vault  | N     | N     | N         |
| Open threads         | full-vault  | N     | N     | N         |

### Outstanding issues (requires human attention)
...
```

If no issues require human attention, keep the report short (doctor score +
dimension table + "all clean"). Don't pad for length.

## Interactions

- `recompile` — runs independently on its own schedule. Produces new/
  updated wiki pages that maintain audits on its next run (changed-pages
  diff picks them up automatically).
- `zettel-status-check` — zettel archival lifecycle. Maintain doesn't
  touch archival decisions.

## Anti-Patterns

- **Compiling raw content.** That's `recompile`'s job. If you find yourself
  about to create a wiki page from a zettel or source, stop and invoke
  recompile instead.
- **Reporting without fixing where fixing is mechanical.** Back-link
  backfills, wikilink → markdown conversions, and citation additions on
  obvious sources should be DONE, not just listed.
- **Deleting orphan pages without human confirmation.** Many orphans are
  just missing links. Remediate (case A) before suggesting deletion (case B).
- **Scanning the full vault for every dimension.** Incremental dimensions
  (citation audit, wikilink check, etc.) scan only changed pages. Full-vault
  is reserved for dimensions that truly need it.
- **Advancing the checkpoint on partial success.** If a dimension errors,
  leave the checkpoint so the next run re-scans.

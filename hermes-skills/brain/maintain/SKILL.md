---
name: maintain
description: 'Brain health checks: back-link enforcement, citation audit, filing validation,
  stale info detection, orphan pages, and benchmarks. Use when asked to check brain
  health, run maintenance, or audit quality.'
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - maintain
    related_skills:
    - install
    - query
    - reports
    - testing
    - zettel-processor
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/maintain/SKILL.md
    blueprint_sha256: 7573d508cfda99b73de51a2c5e5b63ca7d751bcc7c6b62463b373396af207620
    generated_from: gbrain-k2/skills
---

# Maintain Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `maintain` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- brain health
- check backlinks
- citation audit
- maintenance
- orphan pages
- stale pages
- Blueprint source: `/home/k/gbrain-k2/skills/maintain/SKILL.md`
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
- All health dimensions are checked (stale, orphan, dead links, cross-refs, backlinks, citations, filing, tags)
- Each issue found has a specific fix action
- Back-link iron law is enforced
- Citation format is validated against the standard
- Results are reported with counts per dimension

### Blueprint Phases

1. **Run health check.** Check gbrain health to get the dashboard.
2. **Check each dimension:**

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
Spot-check pages for missing `[Source: ...]` citations:
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

### Source Tool Intent

These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.

- Check gbrain health (get_health)
- List pages in gbrain with filters (list_pages)
- Read a page from gbrain (get_page)
- Check backlinks in gbrain (get_backlinks)
- Link entities in gbrain (add_link)
- Remove links in gbrain (remove_link)
- Tag a page in gbrain (add_tag)
- Remove a tag in gbrain (remove_tag)
- View timeline in gbrain (get_timeline)

## Pitfalls
- Fixing pages without reading them first -- you must understand context before editing
- Silently skipping dimensions -- every dimension must be checked and reported, even if clean
- Deleting orphan pages without checking if they should be linked instead
- Running embedding refresh during peak usage hours
- Batch-fixing back-links without verifying the relationship is real
- Marking a dimension "clean" without actually querying it
- Rewriting compiled truth without reading the full timeline first
- Removing tags without checking if other pages use the same tag consistently
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
The maintenance report follows this structure:

```
```

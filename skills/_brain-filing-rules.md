# Brain Filing Rules -- MANDATORY for all skills that write to the brain

## The Rule

The PRIMARY SUBJECT of the content determines where it goes. Not the format,
not the source, not the skill that's running.

## Decision Protocol

1. Identify the primary subject (a person? company? concept? policy issue?)
2. File in the directory that matches the subject
3. Cross-link from related directories
4. When in doubt: what would you search for to find this page again?

## Common Misfiling Patterns -- DO NOT DO THESE

| Wrong | Right | Why |
|-------|-------|-----|
| Analysis of a topic -> `sources/` | -> appropriate subject directory | sources/ is for raw data only |
| Article about a person -> `sources/` | -> `people/` | Primary subject is a person |
| Meeting-derived company info -> `meetings/` only | -> ALSO update `companies/` | Entity propagation is mandatory |
| Research about a company -> `sources/` | -> `companies/` | Primary subject is a company |
| Reusable framework/thesis -> `sources/` | -> `concepts/` | It's a mental model |
| Tweet thread about policy -> `media/` | -> `civic/` or `concepts/` | media/ is for content ops |

## What `sources/` Is Actually For (k2 fork)

**This section diverges from stock gbrain.** See `docs/K2_SCHEMA.md` for the
full k2 rules.

`sources/` in this fork is the human's territory:

- Imported legacy content (dated snapshot directories like `sources/imports/2026-04-16-obsidian-import/`)
- New human writing (`sources/zettel/` is the active atomic-note destination)
- Attachments (images, PDFs, audio) under `sources/assets/`
- Promoted zettels: `sources/promoted_zettel/` (frozen after 1:1 promotion, see below)
- Quick captures from ingest pipelines before triage

**The agent does not write new content to `sources/`, does not edit existing
source files, and does not move source pages into category folders.** This
applies even when "re-filing" a source page that appears to belong in a
category. Source pages are signals, not wiki pages. The agent's job is to
produce compiled wiki pages in category folders (`people/`, `concepts/`, etc.)
that cite sources — not to relocate sources.

The anti-pattern: moving a source page into a category folder and calling it
done. This is forbidden. If a source page has a clear primary subject, the
correct action is:

1. Leave the source page in place.
2. Create or update the corresponding category page (`people/name.md`,
   `concepts/idea.md`, etc.).
3. Cite the source page in the new wiki page's `## Sources` body section
   (NOT in frontmatter — sources list in frontmatter bloats during bootstrap).
4. Add a timeline entry on the wiki page linking back to the source.

### Narrow exception: zettel promotion

When a zettel in `sources/zettel/` produces a single wiki page that covers its
content entirely (the wiki page's Compiled Truth fully subsumes the zettel),
the agent moves the zettel file from `sources/zettel/` to
`sources/promoted_zettel/` as part of the promotion. Both directories are
within `sources/`, so human ownership is preserved; this is a status
transition, not a re-filing.

Rules:

- **1:1 wholesale only.** If the zettel contributes to multiple wiki pages, or
  only a subset of its content is compiled, the zettel stays in `sources/zettel/`.
- **Update citations.** Any wiki page `## Sources` entry or timeline entry that
  referenced the old `sources/zettel/...` path must be updated to the new
  `sources/promoted_zettel/...` path after the move.
- **Wikilinks are safe.** Obsidian resolves `[[zettel title]]` by basename
  vault-wide, so wikilinks inside other pages continue to resolve after the
  move without rewriting.
- **Promoted zettels are frozen.** If the human wants to add to a promoted
  zettel, they start a new zettel in `sources/zettel/` that references the
  promoted one.

**Imported legacy tags, PARA fields, folder locations, and archive status are
untrusted.** They are evidence of prior human categorization effort, not truth.
Read each source as a fresh signal.

## Notability Gate

Not everything deserves a brain page. Before creating a new entity page:
- **People:** Will you interact with them again? Are they relevant to your work?
- **Companies:** Are they relevant to your work or interests?
- **Concepts:** Is this a reusable mental model worth referencing later?
- **When in doubt, DON'T create.** A missing page can be created later.
  A junk page wastes attention and degrades search quality.

## Iron Law: Back-Linking (MANDATORY)

Every mention of a person or company with a brain page MUST create a back-link
FROM that entity's page TO the page mentioning them. This is bidirectional:
the new page links to the entity, AND the entity's page links back.

Format for back-links (append to Timeline or See Also):
```
- **YYYY-MM-DD** | Referenced in [page title](path/to/page.md) -- brief context
```

An unlinked mention is a broken brain. The graph is the intelligence.

## Citation Requirements (MANDATORY)

Every fact written to a brain page must carry an inline `[Source: ...]` citation.

Three formats:
- **Direct attribution:** `[Source: User, {context}, YYYY-MM-DD]`
- **API/external:** `[Source: {provider}, YYYY-MM-DD]` or `[Source: {publication}, {URL}]`
- **Synthesis:** `[Source: compiled from {list of sources}]`

Source precedence (highest to lowest):
1. User's direct statements (highest authority)
2. Compiled truth (pre-existing brain synthesis)
3. Timeline entries (raw evidence)
4. External sources (API enrichment, web search -- lowest)

When sources conflict, note the contradiction with both citations. Don't
silently pick one.

## Raw Source Preservation

Every ingested item should have its raw source preserved for provenance.

**Size routing (automatic via `gbrain files upload-raw`):**
- **< 100 MB text/PDF**: stays in the brain repo (git-tracked) in a `.raw/`
  sidecar directory alongside the brain page
- **>= 100 MB OR media files** (video, audio, images): uploaded to cloud
  storage (Supabase Storage, S3, etc.) with a `.redirect.yaml` pointer left
  in the brain repo. Files >= 100 MB use TUS resumable upload (6 MB chunks
  with retry) for reliability.

**Upload command:**
```bash
gbrain files upload-raw <file> --page <page-slug> --type <type>
```
Returns JSON: `{storage: "git"}` for small files, `{storage: "supabase", storagePath, reference}` for cloud.

**The `.redirect.yaml` pointer format:**
```yaml
target: supabase://brain-files/page-slug/filename.mp4
bucket: brain-files
storage_path: page-slug/filename.mp4
size: 524288000
size_human: 500 MB
hash: sha256:abc123...
mime: video/mp4
uploaded: 2026-04-11T...
type: transcript
```

**Accessing stored files:**
```bash
gbrain files signed-url <storage-path>    # Generate 1-hour signed URL
gbrain files restore <dir>                # Download back to local
```

This ensures any derived brain page can be traced back to its original source,
and large files don't bloat the git repo.

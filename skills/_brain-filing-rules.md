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

## Zones: human/, sources/, inbox/

See `~/gbrain-k2/K2_SCHEMA.md` for the full schema. This section is the shortcut
reference for filing decisions.

Human ownership is split into two tiers with different permission levels:

### `human/` — SACRED (agent never writes or modifies)

- `human/zettel/` — active atomic human writing destination
- Any subdirectories the human creates for their own writing

**The agent NEVER writes to `human/`, NEVER edits files in `human/`, NEVER
moves files in or out of `human/`, and NEVER deletes from `human/`.** One
narrow exception: the zettel archival move (see below), and only after
explicit human approval via the maintenance messaging channel.

### `sources/` — immutable reference material (agent NEVER writes)

- `sources/imports/YYYY-MM-DD-*/` — legacy content from prior note tools
- `sources/assets/` — image and file attachments

The agent reads `sources/` freely and NEVER writes to it. No exceptions.

**Moves OUT of `sources/` are also forbidden.** Even into agent-owned category
folders. If a source page is about a person, the agent creates `people/{name}.md`
as a NEW parallel page that cites the source — the agent does NOT move the
source page to `people/`. The source stays in `sources/` forever.

### `archive/` — retired content (agent-writable)

- `archive/` hosts retired agent-written pages (superseded entities,
  ended projects, deprecated tools) when the lint pass or the human flags
  them for archival.

### `inbox/` — shared triage zone

Both agent and human write to `inbox/`. Agent use should be disciplined —
inbox is for flagged items needing human attention, NOT a dumping ground for
ambiguous content. Every agent-written inbox entry should be actionable.

### Anti-pattern: relocation

Moving a human source page into a category folder and calling it done is
FORBIDDEN. Human content stays in human/ (or `human/zettel/archive/` once
explicitly archived). The agent's job is to compile parallel wiki pages in
category folders that CITE the human sources.

If a source has a clear primary subject, the correct action is:

1. Leave the source page in place.
2. Create or update the corresponding category page (`people/name.md`,
   `concepts/idea.md`, etc.).
3. Cite the source page in the new wiki page's `## Sources` body section
   (NOT in frontmatter — sources list in frontmatter bloats during bootstrap).
4. Add a timeline entry on the wiki page linking back to the source.

### Narrow exception: zettel archival (human-approved)

When a zettel in `human/zettel/` has been wholesale-compiled (1:1 into a
single wiki page) AND is stable (no recent edits), the zettel-processor skill
marks it as an archival candidate. The maintenance skill surfaces the prompt
to the human via the configured messaging channel.

Maintenance can also surface a mature long multi-target zettel as a review
candidate when it is stable and clearly functioning as a source reservoir,
even though it is not a 1:1 wholesale compile.

**Only when the human explicitly approves** does the agent move the zettel:
`human/zettel/foo.md` → `human/zettel/archive/foo.md`.

Rules:

- **Never autonomous.** The move requires explicit human approval. No
  threshold, no heuristic approval — explicit consent per zettel.
- **1:1 wholesale is the strongest candidate signal.** Partial-use zettels can
  still become human-review candidates when maintenance judges them mature,
  long, stable, and source-like.
- **Updated zettels stay.** A zettel with recent edits suggests the human is
  still developing the idea. Not an archival candidate.
- **Update citations on move.** Any wiki page `## Sources` entry or timeline
  entry that referenced the old `human/zettel/...` path must be updated to
  the new `human/zettel/archive/...` path after the move.
- **Basename wikilinks (if present in human content) remain safe.** Obsidian
  resolves `[[zettel title]]` vault-wide, so wikilinks inside human-authored
  pages continue to resolve after the move. Agent-written pages use markdown
  links, not wikilinks, so those do need path rewriting.

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

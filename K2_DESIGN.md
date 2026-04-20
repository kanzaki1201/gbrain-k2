<!-- design-version: k2-1.0.0 -->

# K2 Brain Design

How to build and operate a K2 brain. Principles (WHY), operations (HOW),
and implementation notes for gbrain-k2.

Anyone with this file and K2_SCHEMA.md can create a K2-compatible brain
using any tool stack.

---

## Part 1: Principles

### 0. The brain is a portable data standard.

This design describes a data model and operations, not a software product.
Any tool that reads and writes files following K2_SCHEMA.md is a compatible
implementation. No specific CLI, editor, database, or AI provider is required.

### 1. Every piece of knowledge has a primary home (MECE directories).

Every page lands in exactly one category directory. No duplicated pages. MECE
applies to directories, not to reality. A person is multi-faceted — the person
page is their primary home, and cross-references surface other facets.

### 2. Compiled Truth + Evidence Log (two-layer pages).

Above the `---`: compiled truth. Current-state synthesis, always rewritten
when new evidence arrives. Below the `---`: evidence log. When the brain
learned each fact and from what source. Append-only.

The synthesis is pre-computed. Cross-references and contradictions are resolved
at compile time, not at query time.

### 3. Zone ownership.

The brain has two zones with strict ownership boundaries:

**Raw zone** — sacred. The agent reads but NEVER writes, modifies, moves, or
deletes. This is the evidence layer. Everything the brain knows traces back
here.

**Wiki zone** — agent-owned. Synthesized, linked, current-state pages. The
human reads but does not directly edit. Corrections flow through the raw zone
or direct agent commands.

The separation ensures evidence is never corrupted by synthesis, and synthesis
is never blocked by human editing.

### 4. Structural inference, not speculation.

The brain surfaces relationships implied by graph structure. If the graph
logically requires a relationship, create an inferred link. If it's
speculation, don't. The test: would a human say "obviously yes"?

Infer between entities. Never infer user-entity relationships from page
existence. Never speculate beyond what the structure necessitates.

---

## Part 2: Operations

Four operations. Three daily-use, one recovery.

### INGEST — content enters the raw zone

**Input:** any content (URL, file, text, transcript, image, agent chat).
**Output:** a file in `sources/ingested/`.

Invariants:
- Raw zone files are immutable after creation.
- Ingest NEVER modifies existing raw zone files.
- Content stored in original form with minimal normalization.
- Ingest writes ONLY to `sources/ingested/`. Other raw zone structure
  (`sources/imports/`, `sources/Clippings/`, `human/`) is human-managed.

### COMPILE — raw zone → DB → rendered wiki

The core engine. Extracts structured data from raw files, synthesizes
wiki pages, and renders markdown.

**Input:** changes in raw zone since last compile checkpoint.
**Output:** created/updated wiki pages (structured store + markdown files).

#### Extract (raw → structured data)

For each new or modified raw file:

1. Extract entities mentioned in the raw text.
2. For each entity, file per K2_SCHEMA.md and write structured data:
   - Page record (per schema frontmatter spec).
   - Timeline entry: date learned, what was learned, source path.
   - Links: to other entities mentioned (FROM [verb] TO).
   - Tags: extracted from content.
3. Cross-entity propagation: when new evidence affects multiple entities,
   add timeline entries and links to ALL affected pages.
4. Evidence-based: do not create links without source evidence.
   Inferred links (structural necessity) are marked separately.
5. Track which raw files contributed to each wiki page.

#### Render (structured data → wiki)

For each page with changed struct_hash:

1. Synthesize compiled_truth from timeline_entries + links + tags.
   Contextual facts (birth dates, relationships) appear here.
2. Cache compiled_truth in the structured store.
3. Format markdown per K2_SCHEMA.md page format.
4. Write to the wiki zone (path determined by schema filing rules).
5. Chunk compiled_truth + timeline text → embed → store embeddings.

#### Structural Hash

```
struct_hash = SHA256(
  sorted(timeline_entries) +
  sorted(links) +
  sorted(tags) +
  sorted(source_paths)
)
```

If struct_hash unchanged since last render → skip render + embed entirely.
If struct_hash changed → render + embed runs as one unit.

#### Structural Idempotency

Same input → same entities, links, timeline entry dates. Compiled truth prose
may vary between runs (LLM non-deterministic). The graph structure is stable.

#### Checkpoint

Compile tracks processed state (e.g., git commit hash). Incremental runs
process only changes since the checkpoint. `source_paths` enables reverse
lookup: when a source changes, find all pages that cite it.

### MAINTAIN — quality enforcement

**Input:** the full wiki (structured store + rendered markdown).
**Output:** health report + automated fixes + human review flags.

#### Checks

- **Stale pages:** struct_hash changed but render hasn't run.
- **Wiki orphans:** wiki zone pages with no inbound links.
- **Raw orphans:** raw zone files not cited by any wiki page (compilation gap).
- **Dead links:** links to non-existent pages.
- **Missing cross-references:** entity mentions without links.
- **Duplicates:** similar slugs, shared aliases, same-entity signals.
- **Filing violations:** pages filed inconsistently with K2_SCHEMA.md rules.
- **Citation gaps:** facts without source citations.

#### Automated fixes

- Re-render stale pages.
- Create missing back-links.
- Remove dead links.

#### Human review (present, don't force resolution)

- Ambiguous duplicates.
- Filing disputes.
- Contradictory evidence — present both sides with citations. Some facts
  genuinely conflict and that is OK. The compiled truth should note the
  contradiction, not silently pick one.

### RECOVER — wiki → DB reconstruction

Reverse of render. Used when the DB is lost, migrating engines, or
bootstrapping from an exported wiki.

**Input:** rendered wiki markdown files.
**Output:** reconstructed structured store.

| Markdown element | Reconstructed as |
|---|---|
| YAML frontmatter | Page record (slug, type, title, tags, aliases) |
| Compiled truth body | Cached compiled_truth |
| `[Entity](path.md)` | Link records |
| `^[[title](src.md), date]` | source_paths + citations |
| `## Timeline` entries | timeline_entries (date, summary, citation) |

**Roundtrip fidelity:** `render(DB) → markdown → parse(markdown) → DB` must
produce equivalent structured data. The wiki IS a full backup.

---

## Inference Rules

Applies across ALL entity types (people, tools, projects, companies, concepts).

| Inference | OK? | Why |
|-----------|-----|-----|
| Project uses Blender (uses ARP plugin, ARP is for Blender) | Yes | Can't use a Blender plugin without Blender |
| Bob↔Cathy co-parents (both parent_of Alice) | Yes | Logically required |
| Two people at same meeting have some connection | Yes | Evidence exists |
| "You know Alice" | **No** | Page existence ≠ personal connection |
| "Bob is probably married to Cathy" | **No** | Co-parent ≠ married |
| Person works_at Company, Company uses Tool → Person uses Tool | **No** | Company ≠ individual |

Inferred links are flagged distinctly. They can be promoted (source confirms)
or dismissed (user rejects).

**Patterns:**
- Containment: project uses plugin → project uses host tool
- Co-parentage: shared parent_of links
- Co-attendance: both listed on same meeting
- Shared context: both linked from same event/project

---

## Compile Contract: Alice/Bob/Cathy

Reference test case for cross-entity propagation.

**Starting state:**
- `people/alice.md` — compiled truth mentions Bob as father.
- `people/bob.md` — compiled truth mentions Alice as daughter.
- Links: alice→bob (child_of), bob→alice (parent_of).

**Input:** new zettel `human/zettel/2026-10-10-new-findings.md`:
"Cathy is Alice's bio mum."

**Extract:**

| Step | Action |
|------|--------|
| 1 | Create page record `people/cathy` |
| 2 | Timeline entry on cathy: `2026-10-10 \| Zettel revealed Cathy is Alice's biological mother` |
| 3 | Timeline entry on alice: `2026-10-10 \| Zettel revealed Cathy is Alice's biological mother` |
| 4 | Timeline entry on bob: `2026-10-10 \| Zettel revealed Cathy as Alice's mother` |
| 5 | Links: alice→cathy (child_of), cathy→alice (parent_of) |
| 6 | Inferred link: bob↔cathy (inferred_co_parent, "co-parents of Alice") |
| 7 | Do NOT create evidence-based bob→cathy link (no source) |
| 8 | Update source_paths on alice, bob, cathy |

**Render:**

| Step | Action |
|------|--------|
| 9 | struct_hash changed for cathy, alice, bob → render all three |
| 10 | Synthesize cathy: "Cathy is Alice's biological mother." |
| 11 | Re-synthesize alice: compiled truth now includes Cathy, contextual fact "born 1999 to Bob and Cathy" |
| 12 | Re-synthesize bob: compiled truth includes Cathy context |
| 13 | Write markdown files, chunk + embed |

**Verify:**
- cathy.md exists with compiled truth + timeline.
- alice.md updated: mentions Cathy, new timeline entry.
- bob.md updated: Cathy context, new timeline entry.
- Links: alice→cathy, cathy→alice (evidence-based), bob↔cathy (inferred).
- All cite the zettel via `^[...]` footnotes.

---

## The Four Primitives

Any structured store supporting these four primitives satisfies the spec.

**Entity Registry** — canonical identity. Slug, type, title, aliases.
Source of truth for "is this the same entity?"

**Event Ledger** — evidence records. Page, date learned, what learned,
source path. Maps to timeline section of rendered markdown. Append-only.

**Fact Store** — compiled truth. Current-state synthesis, cached for
embedding and rendering. Re-synthesized when evidence changes.

**Relationship Graph** — typed directed edges. FROM [verb] TO. Both
evidence-based and inferred (flagged). Enables graph queries.

---

## Implementation Notes

Authorial choices for gbrain-k2. Not spec requirements.

### Preferred reader: Obsidian

Obsidian is first-class. Not mandatory. Implementation choices:

- Dates MAY be rendered as `[[YYYY-MM-DD]]` wikilinks (daily note navigation).
- Frontmatter renders as Obsidian Properties.
- Collaborator fields MAY use `["[[slug]]"]` for graph display.

These are invisible to non-Obsidian readers.

### Database: PGLite / Postgres

| Primitive | Table |
|---|---|
| Entity Registry | `pages` (slug, type, title, frontmatter, source_paths, struct_hash) |
| Event Ledger | `timeline_entries` (page_id, date, summary, source, detail) |
| Fact Store | `pages.compiled_truth` (cached LLM output) |
| Relationship Graph | `links` (from_page_id, to_page_id, link_type, context, inferred) |

Supporting: `content_chunks` (embeddings), `tags`, `page_versions`, `raw_data`,
`ingest_log`, `config`.

Schema changes for k2-1.0.0:
- Add `pages.source_paths TEXT[]`
- Add `pages.struct_hash TEXT`
- Add `links.inferred BOOLEAN DEFAULT false`
- Remove `pages.timeline` column

### CLI: gbrain

- `gbrain import` / `gbrain sync` → INGEST
- `gbrain compile` → COMPILE
- `gbrain doctor` / `gbrain maintain` → MAINTAIN
- `gbrain recover` → RECOVER

### LLM provider

- Entity extraction + compiled truth synthesis: Claude (configurable)
- Embedding: OpenAI text-embedding-3-large, 1536 dimensions (configurable)
- Query expansion: Claude Haiku (optional)

---

## Version History

- **k2-1.0.0** (2026-04-19) — Initial K2_DESIGN.md. Principles absorbed
  from K2_SCHEMA.md. Operations (ingest, compile, maintain, recover).
  Evidence-log timeline. Structural hash. Inference rules. Alice/Bob/Cathy
  contract. Four primitives. Implementation notes.

<!-- design-version: k2-1.0.0 -->

# K2 Brain Design

How to build and operate a K2 brain. Tool-agnostic recipe. Anyone with this
file and K2_SCHEMA.md can create a compatible brain using any tool stack.

See K2_SCHEMA.md for what the brain IS (structure, zones, page format, filing
rules). This file covers what to DO with it.

---

## Operations

Four operations. Three are daily-use; one is recovery.

### INGEST — content enters the raw zone

Input: any content (URL, file, text, transcript, image, agent chat).
Output: a file in the raw zone (`sources/` or `human/`).

Invariants:
- Raw zone files are immutable after creation.
- Ingest NEVER modifies existing raw zone files.
- Content is stored in its original form with minimal normalization.

The raw zone is the evidence layer. Everything the brain knows traces back to
a file here.

### COMPILE — raw zone → structured data → rendered wiki

The core engine. Two phases: extract (LLM-heavy) and render (LLM-heavy).

**Input:** changes in raw zone since last compile checkpoint.
**Output:** created/updated wiki pages in structured store + rendered markdown.

#### Phase 1: Extract (structured DB writes)

For each new or modified raw file:

1. **Extract entities** — identify people, tools, concepts, projects, etc.
   mentioned in the raw text.
2. **For each entity, write structured data:**
   - Page record: slug, type, title, frontmatter, source_paths
   - Timeline entry: date learned, summary of what was learned, source path
   - Links: to other entities mentioned, with typed relationships
   - Tags: extracted from content
3. **Cross-entity propagation** — when new evidence affects multiple entities,
   add timeline entries and links to ALL affected pages.
4. **Evidence-based** — do NOT infer beyond what the graph logically requires
   (see Inference Rules below).
5. **Update source_paths** on every affected page.

#### Phase 2: Render (LLM synthesis → cached text + markdown)

For each page with changed struct_hash:

1. **LLM synthesis** — produce compiled_truth from timeline_entries + links +
   tags. Contextual facts (birth dates, job changes, relationships) are
   synthesized here, not stored as timeline entries.
2. **Cache** — write compiled_truth to the structured store (used for embedding
   and as a render cache).
3. **Format markdown** (deterministic, no LLM):
   - YAML frontmatter (from page record)
   - Compiled truth body (from cache)
   - `---`
   - `## Timeline` (formatted from timeline_entries, reverse-chronological)
4. **Write** to `{category}/{slug}.md`.

#### Phase 3: Embed (chunking + embedding)

For each page with changed content_hash:

1. Chunk compiled_truth + timeline text into ~512-token segments.
2. Embed each chunk (e.g., OpenAI text-embedding-3-large).
3. Store chunks + embeddings for semantic search.

#### Structural Hash (cost optimization)

Render and embed are expensive. To skip redundant work:

```
struct_hash = SHA256(
  sorted(timeline_entries dates + summaries) +
  sorted(links from/to/type) +
  sorted(tags) +
  sorted(source_paths)
)
```

If `struct_hash` hasn't changed since last render → skip render AND embed.
No LLM call, no embedding call.

If render runs but produces identical text (content_hash unchanged) → skip
embed. Two-layer cache: struct_hash gates render, content_hash gates embed.

#### Structural Idempotency

Same input → same set of entities, links, and timeline entry dates. Compiled
truth prose may vary between runs (LLM is non-deterministic). The graph
structure is stable; the narrative is best-effort consistent.

#### Checkpoint

Compile tracks what has been processed (e.g., git commit hash of last
processed state). Incremental runs process only changes since the checkpoint.
`source_paths` on each page enables reverse lookup: when a source changes,
find all pages that cite it and re-process them.

### MAINTAIN — quality enforcement

Input: the full wiki (structured store + rendered markdown).
Output: health report + fixes for automatable issues.

#### Checks

- **Stale pages:** compiled truth older than latest timeline evidence
  (struct_hash changed but render hasn't run).
- **Orphan pages:** no inbound links from any other wiki page.
- **Dead links:** markdown links pointing to non-existent pages.
- **Missing cross-references:** entity mentions without corresponding links.
- **Duplicate detection:** similar slugs, shared aliases, same-entity signals.
- **Filing violations:** pages in wrong category directory.
- **Citation gaps:** facts without source citations.
- **Link density:** pages below minimum connectivity threshold.

#### Automated fixes

- Stale page re-render (trigger render for pages with outdated struct_hash).
- Back-link creation (entity A mentions B → B gets inbound link from A).
- Dead link cleanup.

#### Human review flags

- Ambiguous duplicates.
- Filing disputes.
- Contradictory evidence.

### RECOVER — wiki → DB reconstruction

The reverse of render. Used when the DB is lost, migrating engines, or
bootstrapping a fresh instance from an existing wiki export.

**Input:** rendered wiki markdown files.
**Output:** reconstructed structured store.

| Markdown element | Reconstructed as |
|---|---|
| YAML frontmatter | Page record (slug, type, title, tags, aliases) |
| Compiled truth body | Cached compiled_truth |
| `[Entity](path.md)` links | Link records (extract, infer direction) |
| `^[[title](src.md), date]` | source_paths + citation metadata |
| `## Timeline` entries | timeline_entries (parse date, summary, citation) |

**Roundtrip fidelity requirement:** `render(DB) → markdown → parse(markdown) → DB`
must produce equivalent structured data. The rendered markdown format must be
stable and unambiguous for lossless roundtrip. This means the wiki IS a full
backup.

---

## Timeline: Evidence Log Model

Timeline entries are an EVIDENCE LOG: "when did the brain learn X from source Y."
NOT a contextual history of real-world events.

```
## Timeline

- **2026-10-10** | Zettel revealed Cathy is Alice's biological mother ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]
- **2026-01-01** | Clipping revealed Bob is Alice's father ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]
```

Contextual facts ("Alice was born in 1999 to Bob and Cathy") live in the
compiled truth section. They are synthesized by the render phase, not stored
as timeline entries.

Timeline entries are append-only. When new evidence refines understanding of
a fact, a new entry is appended. The compiled truth is re-rendered to
incorporate all evidence.

---

## Inference Rules

The brain surfaces relationships implied by graph structure. Inference applies
across ALL entity types (people, tools, projects, companies, concepts).

**Boundary: structural necessity only.** If the graph structure logically
requires a relationship, create an inferred link. If it's speculation, don't.
The test: would a human say "obviously yes" to this inference?

| Inference | OK? | Why |
|-----------|-----|-----|
| VTB project uses Blender (project `uses` Auto Rig Pro, ARP `plugin_for` Blender) | Yes | Can't use a Blender plugin without Blender |
| Bob↔Cathy co-parents (both `parent_of` Alice) | Yes | Logically required |
| Two people at same meeting have some connection | Yes | Evidence exists (meeting page) |
| "You know Alice" | **No** | Page existence ≠ personal connection |
| "You met Bob through Alice" | **No** | No evidence of user-entity path |
| "Bob is probably married to Cathy" | **No** | Co-parent ≠ married. Speculation. |
| Person works_at Company, Company uses Tool → Person uses Tool | **No** | Company-level ≠ individual |

**The rule:** infer between entities when the graph logically requires it.
Never infer user-entity relationships from page existence. Never speculate
beyond what the structure necessitates.

Inferred links are marked distinctly from evidence-based links (e.g., an
`inferred` flag). They can be:
- **Promoted:** when a source later confirms the inference.
- **Dismissed:** when the user rejects the inference as incorrect.

**Inference patterns:**
- Containment: project uses plugin, plugin is for host tool → project uses host tool
- Co-parentage: two entities share `parent_of` links to the same child
- Co-attendance: two entities both listed as attendees of the same meeting
- Shared context: two entities both linked from the same project/meeting/event

---

## The Four Primitives

Any structured store that supports these four primitives satisfies the spec.
The primitives are abstract — they can be implemented as database tables,
key-value stores, flat files, or any other storage mechanism.

### Entity Registry

Canonical identity for every entity. Slug (stable ID), type, title, aliases.
This is the source of truth for "is this the same person/company/tool?"

### Event Ledger

Immutable evidence records. Each entry: page, date learned, what was learned,
source path. Maps to the timeline section of rendered markdown.

### Fact Store

Current-state synthesis with provenance. The compiled truth for each entity,
cached for embedding and rendering. Re-synthesized when new evidence arrives.

### Relationship Graph

Typed directed edges between entities. FROM [verb] TO convention. Both
evidence-based and inferred links, distinguishable by flag. Enables graph
queries: "what tools does this project use?" "who are Alice's parents?"

---

## Compile Contract: Alice/Bob/Cathy Test Case

Reference test case for cross-entity propagation.

**Starting state:**
- `people/alice.md` exists. Compiled truth mentions Bob as father.
- `people/bob.md` exists. Compiled truth mentions Alice as daughter.
- Links: alice→bob (child_of), bob→alice (parent_of).

**Input:** new zettel `human/zettel/2026-10-10-new-findings.md` containing
"Cathy is Alice's bio mum."

**COMPILE phase (extract):**
1. Create `people/cathy` page record (slug, type=people, title=Cathy).
2. Create timeline_entry for cathy: `2026-10-10 | Zettel revealed Cathy is Alice's biological mother`.
3. Append timeline_entry to alice: `2026-10-10 | Zettel revealed Cathy is Alice's biological mother`.
4. Append timeline_entry to bob: `2026-10-10 | Zettel revealed Cathy as Alice's mother`.
5. Create links: alice→cathy (child_of), cathy→alice (parent_of).
6. Create inferred link: bob↔cathy (inferred_co_parent, context: "co-parents of Alice").
7. Do NOT create bob→cathy as evidence-based — no source states their direct relationship.
8. Update source_paths on alice, bob, cathy to include the zettel.

**RENDER phase (synthesize):**
9. Compute struct_hash for cathy, alice, bob. All changed → render all three.
10. Render cathy: LLM synthesizes "Cathy is Alice's biological mother."
11. Render alice: LLM re-synthesizes incorporating Cathy. Contextual fact
    "born 1999 to Bob and Cathy" appears in compiled truth.
12. Render bob: LLM re-synthesizes incorporating Cathy as co-parent.
13. Write markdown files for all three.

**EMBED phase:**
14. Chunk + embed updated pages (content_hash changed for all three).

**Verification:**
- cathy.md exists with compiled truth and timeline.
- alice.md updated: compiled truth mentions Cathy, timeline has new entry.
- bob.md updated: compiled truth mentions Cathy context, timeline has new entry.
- Links: alice→cathy (child_of), cathy→alice (parent_of), bob↔cathy (inferred).
- No bob→cathy evidence-based link (no source states direct relationship).
- All pages cite the zettel via `^[...]` footnotes.

---

## Implementation Notes

This section documents how one specific implementation (gbrain-k2) maps to the
spec. These are authorial choices, not spec requirements.

### Preferred reader: Obsidian

Obsidian is the first-class reader for this implementation. Not mandatory for
the spec, but the implementation makes Obsidian-friendly choices:

- Date references in timeline entries and frontmatter MAY be rendered as
  `[[YYYY-MM-DD]]` wikilinks for daily-note navigation.
- Frontmatter renders as Obsidian Properties.
- Collaborator/attendee fields MAY use `["[[slug]]"]` for Obsidian graph display.

These choices are invisible to non-Obsidian readers (wikilinks appear as
plain text, markdown links work everywhere).

### Database: PGLite / Postgres

The four primitives map to:

| Primitive | Table |
|---|---|
| Entity Registry | `pages` (slug, type, title, frontmatter, source_paths, struct_hash, content_hash) |
| Event Ledger | `timeline_entries` (page_id, date, summary, source, detail) |
| Fact Store | `pages.compiled_truth` (cached LLM output) |
| Relationship Graph | `links` (from_page_id, to_page_id, link_type, context, inferred) |

Supporting tables: `content_chunks` (embeddings), `tags`, `page_versions`,
`raw_data`, `ingest_log`, `config`.

Schema additions for k2-1.0.0:
- `pages.source_paths TEXT[]` — which raw files compiled into this page.
- `pages.struct_hash TEXT` — hash of structured inputs (gates render).
- `links.inferred BOOLEAN DEFAULT false` — distinguishes inferred from evidence-based.
- `pages.timeline` column REMOVED — timeline_entries table is source of truth.

### CLI: gbrain

Maps operations to commands:
- `gbrain import` / `gbrain sync` → INGEST
- `gbrain compile` → COMPILE (extract + render + embed)
- `gbrain doctor` / `gbrain maintain` → MAINTAIN
- `gbrain recover` → RECOVER

### LLM provider

- Entity extraction and compiled truth synthesis: Claude (configurable).
- Embedding: OpenAI text-embedding-3-large, 1536 dimensions (configurable).
- Query expansion: Claude Haiku (optional).

---

## Version History

- **k2-1.0.0** (2026-04-19) — Initial K2_DESIGN.md. Extracted from K2_SCHEMA.md
  rehaul. Operations (ingest, compile, maintain, recover), evidence-log timeline,
  structural hash, inference rules, compile contract (Alice/Bob/Cathy), four
  primitives, implementation notes.

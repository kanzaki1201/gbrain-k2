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

**Raw zone** — evidence layer. Everything the brain knows traces back here.
The human area is sacred: the agent NEVER writes, modifies, moves, or
deletes anything there. The source area is agent-writable only via INGEST
(which creates new files). The agent never modifies or deletes existing
source files. See K2_SCHEMA.md for precise directory mappings.

**Wiki zone** — agent-owned. Synthesized, linked, current-state markdown
files. The human reads but does not directly edit. Corrections flow through
the raw zone or direct agent commands. See K2_SCHEMA.md for directory
structure.

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

A utility skill. The user gives content to the agent (URL, text, transcript,
image, agent chat), and the agent writes it as a markdown file in the raw
zone. Ingest does NOT touch the database. COMPILE processes the file later.

**Input:** content from the user.
**Output:** a markdown file in the raw zone (exact path per K2_SCHEMA.md).

Content already in the raw zone (imports, clippings, human zettel) is NOT
ingested. It is already there. COMPILE picks it up directly.

Invariants:
- Ingest creates new files only. Never modifies existing raw zone files.
- Content stored in original form with minimal normalization.
- Agent-ingested content goes to the ingest directory (per K2_SCHEMA.md).
  Other raw zone structure is human-managed.

### COMPILE — raw zone → DB → rendered wiki markdown

The core engine. Like a code compiler: raw zone files are the source code,
the database is the compiled output, and wiki markdown files are the
rendered artifacts. User-triggered (manual or cron).

**Input:** changes in raw zone since last compile checkpoint.
**Output:** updated DB (entities, links, timeline entries) + rendered wiki
markdown files.

Changes include new files, modified files, deleted files, and moved files.
Source moves update the `sources` table path. Source deletions cascade:
entities with 0 remaining sources are auto-deleted, entities with remaining
sources are recompiled. Deleted entities generate timeline entries on
affected entities.

#### Extract (raw → structured data)

For each new or modified raw file:

1. Extract entities mentioned in the raw text.
2. For each entity, file per K2_SCHEMA.md and write structured data:
   - Entity record (per schema frontmatter spec).
   - Timeline entry: date learned, what was learned, source.
   - Links: to other entities mentioned (FROM [verb] TO).
   - Tags: extracted from content.
3. Cross-entity propagation: when new evidence affects multiple entities,
   add timeline entries and links to ALL affected entities.
4. Evidence-based: do not create links without source evidence.
   Inferred links (structural necessity) are marked separately.
5. Register the source file in `sources` table, link to affected entities
   via `entity_sources`.

#### Render (structured data → wiki markdown)

For each entity with changed struct_hash:

1. Synthesize compiled_truth from timeline_entries + links + tags.
   Contextual facts (birth dates, relationships) appear here.
2. Cache compiled_truth in the structured store.
3. Format as markdown file per K2_SCHEMA.md page format.
4. Write markdown file to the wiki zone (path determined by schema filing rules).
5. Chunk compiled_truth + timeline text → embed → store embeddings.

#### Structural Hash

```
struct_hash = SHA256(
  sorted(timeline_entries) +
  sorted(links) +
  sorted(tags) +
  sorted(entity_sources)
)
```

If struct_hash unchanged since last render → skip render + embed entirely.
If struct_hash changed → render + embed runs as one unit.

#### Structural Idempotency

Same input → same entities, links, timeline entry dates. Compiled truth prose
may vary between runs (LLM non-deterministic). The graph structure is stable.

#### Checkpoint

Compile tracks processed state (e.g., git commit hash). Incremental runs
process only changes since the checkpoint. `entity_sources` enables reverse
lookup: when a source changes, find all entities that cite it.

### MAINTAIN — quality enforcement

**Input:** the full wiki (structured store + rendered markdown).
**Output:** health report + automated fixes + human review flags.

#### Checks

- **Stale entities:** struct_hash changed but render hasn't run.
- **Wiki orphans:** wiki zone markdown files with no inbound links.
- **Source orphans:** entities with 0 entries in entity_sources (all sources gone).
- **Raw orphans:** raw zone files not in the sources table (never compiled).
- **Dead links:** links to non-existent entities.
- **Missing cross-references:** entity mentions without links.
- **Duplicates:** similar slugs, shared aliases, same-entity signals.
- **Filing violations:** wiki files filed inconsistently with K2_SCHEMA.md rules.
- **Citation gaps:** facts without source citations.

#### Automated fixes

- Re-render stale pages.
- Create missing back-links.
- Remove dead links.

#### Human review (present, don't force resolution)

- **Source orphans:** entities with no remaining source evidence. Human
  decides to keep or delete. If deleted, cascade removes entity, links,
  timeline entries, embeddings, and wiki markdown file. Affected entities
  (those that linked to the deleted entity) get a new timeline entry
  recording the dropped link. Timeline is append-only, even for deletions.
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
| `^[[title](src.md), date]` | entity_sources + citations |
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

## Example: Alice/Bob/Cathy

Detailed walkthrough of how a single zettel flows through the entire pipeline.
Read this to understand how compile works in practice.

### 1. Starting state

The wiki already has two pages from earlier compilations:

**people/alice.md** (rendered from DB):
```markdown
---
title: Alice
type: people
tags: []
created: 2026-01-01
updated: 2026-01-01
---

# Alice

Alice is Bob's biological daughter. ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]

---

## Timeline

- **2026-01-01** | Clipping revealed Bob is Alice's biological father ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]
```

**people/bob.md** (rendered from DB):
```markdown
---
title: Bob
type: people
tags: []
created: 2026-01-01
updated: 2026-01-01
---

# Bob

Bob is Alice's biological father. ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]

---

## Timeline

- **2026-01-01** | Clipping revealed Bob is Alice's biological father ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]
```

**DB state:**
- Pages: alice (people), bob (people)
- Links: alice→bob (child_of), bob→alice (parent_of)
- Timeline entries: one each, both citing alice-website.md

### 2. Human writes a zettel

The human creates `human/zettel/2026-10-10 new findings.md`:

```
I found out from talking to Alice that Cathy is her bio mum.
Alice was born in 1999.
```

This is raw human writing. The agent does not touch this file.

### 3. Human triggers compile

The human runs compile (or a scheduled cron does). Compile detects the new
zettel via checkpoint diff:

```
git diff <checkpoint>..HEAD -- human/ sources/
A    human/zettel/2026-10-10 new findings.md
```

One new file. Compile reads it.

### 4. Entity extraction

Compile reads the zettel and identifies entities and facts:

- **Cathy** — a person. Not in the DB. New entity.
- **Alice** — a person. Already in the DB (slug: `alice`).
- Facts extracted:
  - Cathy is Alice's biological mother.
  - Alice was born in 1999.

How does compile know Cathy needs a new page? It searches the DB:
- Exact match for "Cathy": no result.
- Fuzzy match: no result.
- Alias search: no result.
- Conclusion: new entity. Create it.

How does compile know Alice is the existing `alice` page? Same search:
- Exact match for "Alice": found `alice` (type: people).
- Confirmed: update existing page.

Bob is not mentioned in the zettel text. But compile discovers Bob is
affected through the graph: alice already has a `child_of` link to bob.
The new fact (Alice born in 1999 to Cathy) changes what we know about
Alice's birth, which also involves Bob. So bob needs updating too.

### 5. Structured DB writes (extract phase)

**New page: cathy**
- Create page record: slug=cathy, type=people, title=Cathy.
- Link to source via entity_sources: `["human/zettel/2026-10-10 new findings.md"]`.
- Create timeline entry:
  - date: 2026-10-10
  - summary: "Zettel revealed Cathy is Alice's biological mother"
  - source: human/zettel/2026-10-10 new findings.md

**Update page: alice**
- Link to source via entity_sources: `"human/zettel/2026-10-10 new findings.md"`.
- Create timeline entry:
  - date: 2026-10-10
  - summary: "Zettel revealed Cathy is Alice's biological mother, born 1999"
  - source: human/zettel/2026-10-10 new findings.md

**Update page: bob**
- Link to source via entity_sources: `"human/zettel/2026-10-10 new findings.md"`.
- Create timeline entry:
  - date: 2026-10-10
  - summary: "Zettel revealed Cathy as co-parent of Alice"
  - source: human/zettel/2026-10-10 new findings.md

**New links (evidence-based):**
- alice→cathy (child_of, context: "biological mother")
- cathy→alice (parent_of, context: "biological daughter")

**New link (inferred):**
- bob↔cathy (inferred_co_parent, context: "co-parents of Alice")
- Why inferred: both Bob and Cathy are biological parents of Alice.
  Two biological parents of the same child must have had some connection.
  If they were non-biological (adoptive) parents, this inference would
  NOT hold — adoptive parents may have no relationship to each other.
- Why NOT evidence-based: no source says Bob and Cathy know each other,
  are married, or have any direct relationship beyond shared biological
  parentage of Alice.

**NOT created:**
- No evidence-based bob→cathy link. The zettel doesn't mention Bob at all.
  The zettel says "Cathy is Alice's bio mum." That's about Cathy and Alice,
  not about Bob and Cathy.

### 6. Render (synthesis phase)

struct_hash changed for all three pages. Render runs for each:

**Render cathy (new page):**
The renderer reads cathy's structured data:
- Timeline entries: 1 entry (2026-10-10, Cathy is Alice's mother).
- Links: cathy→alice (parent_of). Inferred: cathy↔bob (co-parent).
- Source_paths: 1 zettel.

LLM synthesizes compiled truth:
> "Cathy is Alice's biological mother."

This is the entire compiled truth — we don't know anything else about Cathy.
The LLM does NOT make up facts. If we only have one piece of evidence, the
compiled truth reflects only that.

**Render alice (updated page):**
The renderer reads alice's full structured data:
- Timeline entries: 2 entries now (original + new).
- Links: alice→bob (child_of), alice→cathy (child_of).
- All entity_sources.

LLM re-synthesizes compiled truth from ALL evidence:
> "Alice is the biological daughter of [Bob](bob.md) and [Cathy](cathy.md).
> Born in 1999. ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]
> ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]"

Notice: the old compiled truth ("Alice is Bob's daughter") is REPLACED, not
appended to. Compiled truth is always the current synthesis of all evidence.

**Render bob (updated page):**
LLM re-synthesizes:
> "Bob is [Alice](alice.md)'s biological father. Alice's mother is [Cathy](cathy.md).
> ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]
> ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]"

Notice: bob's compiled truth mentions Cathy as context, but does NOT claim
Bob and Cathy have a direct relationship. "Alice's mother is Cathy" is a
fact about Alice, not about Bob-Cathy.

### 7. Write markdown + embed

For each rendered page, the deterministic formatter produces the final
markdown (frontmatter + compiled truth + --- + timeline) and writes it to
the wiki zone. Then chunks + embeds for search.

### 8. Result

Three files changed in the wiki zone:

**people/cathy.md** (new):
```markdown
---
title: Cathy
type: people
tags: []
created: 2026-10-10
updated: 2026-10-10
---

# Cathy

Cathy is [Alice](alice.md)'s biological mother. ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]

---

## Timeline

- **2026-10-10** | Zettel revealed Cathy is Alice's biological mother ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]
```

**people/alice.md** (updated):
```markdown
---
title: Alice
type: people
tags: []
created: 2026-01-01
updated: 2026-10-10
---

# Alice

Alice is the biological daughter of [Bob](bob.md) and [Cathy](cathy.md). Born in 1999. ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10] ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]

---

## Timeline

- **2026-10-10** | Zettel revealed Cathy is Alice's biological mother, born 1999 ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]
- **2026-01-01** | Clipping revealed Bob is Alice's biological father ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]
```

**people/bob.md** (updated):
```markdown
---
title: Bob
type: people
tags: []
created: 2026-01-01
updated: 2026-10-10
---

# Bob

Bob is [Alice](alice.md)'s biological father. Alice's mother is [Cathy](cathy.md). ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01] ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]

---

## Timeline

- **2026-10-10** | Zettel revealed Cathy as co-parent of Alice ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]
- **2026-01-01** | Clipping revealed Bob is Alice's biological father ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]
```

**DB state after compile:**
- Pages: alice, bob, cathy (all with updated struct_hash)
- Links: alice→bob (child_of), bob→alice (parent_of), alice→cathy (child_of),
  cathy→alice (parent_of), bob↔cathy (inferred_co_parent)
- Timeline entries: 2 on alice, 2 on bob, 1 on cathy
- Raw zone: unchanged (human/zettel/ file untouched)
- Checkpoint: advanced to current HEAD

---

## The Four Primitives

Any structured store supporting these four primitives satisfies the spec.
The schema below is database-independent — implementable in Postgres,
SQLite, or any relational store with vector search support.

**Entity Registry** — canonical identity. Slug, type, title, aliases.
Source of truth for "is this the same entity?"

**Event Ledger** — evidence records. Entity, date learned, what learned,
source. Maps to timeline section of rendered wiki markdown. Append-only.

**Fact Store** — compiled truth. Current-state synthesis, cached for
embedding and rendering. Re-synthesized when evidence changes.

**Relationship Graph** — typed directed edges. FROM [verb] TO. Both
evidence-based and inferred (flagged). Enables graph queries.

### Logical schema

| Table | Columns | Purpose |
|-------|---------|---------|
| `entities` | slug, type, title, compiled_truth, frontmatter, struct_hash | One row per entity. 1:1 with a wiki markdown file. Slug is stable identity. |
| `timeline_entries` | entity_id, date, summary, source, detail | Append-only evidence log. What the brain learned, when, from where. |
| `links` | from_entity_id, to_entity_id, link_type, context, inferred | Typed directed edges. `inferred` distinguishes structural inference from direct evidence. |
| `sources` | path, content_hash, status | Raw zone files as first-class records. Status: active/deleted. |
| `entity_sources` | entity_id, source_id | Junction: which sources contributed to each entity. |
| `content_chunks` | entity_id, chunk_text, chunk_source, embedding | Chunked text with vector embeddings for semantic search. |
| `tags` | entity_id, tag | Entity tags for filtering. |

Supporting tables: `entity_versions` (snapshot history), `raw_data`,
`ingest_log`, `config`.

### Source tracking

`sources` tracks raw zone files as first-class records. `entity_sources`
maps which sources contributed to each entity. Source moves update
`sources.path` only (entity_sources untouched). Source deletions cascade:
entities with 0 remaining sources are auto-deleted by COMPILE. Entities
with remaining sources are recompiled from active sources. Deleted entities
generate timeline entries on affected entities.

### Search

Hybrid search combines vector similarity (embedding cosine distance) with
keyword matching (trigram search), merged via Reciprocal Rank Fusion (RRF).
Optional multi-query expansion generates alternative phrasings for broader
recall.

---

## Implementation Notes

Authorial choices for gbrain-k2. Not spec requirements.

### Preferred reader: Obsidian

Obsidian is first-class. Not mandatory. Implementation choices:

- Dates MAY be rendered as `[[YYYY-MM-DD]]` wikilinks (daily note navigation).
- Frontmatter renders as Obsidian Properties.
- Collaborator fields MAY use `["[[slug]]"]` for graph display.

These are invisible to non-Obsidian readers.

### Database: Postgres

Uses pgvector for embedding storage and cosine distance search.
Uses pg_trgm for trigram keyword matching. See logical schema in
"The Four Primitives" section for table definitions.

### Agent skills

The four operations (INGEST, COMPILE, MAINTAIN, RECOVER) are **agent skills**
— markdown files that tell an agent how to perform each operation step by
step. The agent does the LLM work (entity extraction, compiled truth
synthesis). The CLI does the DB work.

### CLI

Database interface. Writes entities, links, timeline entries, and
embeddings. Supports query and hybrid search (vector + keyword + RRF).
Does NOT orchestrate the four operations.

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

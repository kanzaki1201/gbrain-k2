<!-- schema-version: k2-1.0.0 -->
<!-- fork: kanzaki1201/gbrain-k2 -->

# K2 Brain Schema

Authoritative schema for the K2 brain vault. Defines what the brain IS:
directory structure, zone rules, page format, filing rules, entity identity.
Tool-agnostic. See K2_DESIGN.md for how to operate on the brain.

---

## Part 1: Principles

### 0. The brain is a portable data standard.

This schema defines a data model, not a software product. Any tool that reads
and writes markdown files following this structure is a compatible
implementation. The spec does not mandate a specific CLI, editor, database,
or AI provider.

K2_SCHEMA.md (this file) defines the WHAT. K2_DESIGN.md defines the HOW.
Together they are a complete specification for building a K2-compatible brain.

### 1. Every piece of knowledge has a primary home (MECE directories).

Every page lands in exactly one category directory. No duplicated pages, no
ambiguity about where something goes. MECE applies to directories, not to
reality. A real person is multi-faceted — the person page is their primary
home, and typed cross-references surface their other facets without creating
duplicate pages.

### 2. Compiled Truth + Timeline (two-layer pages).

Every wiki page has two sections separated by `---`. Above the line is
Compiled Truth: current-state synthesis, always rewritten when new evidence
arrives. Below the line is the Timeline: an append-only evidence log recording
when the brain learned each fact and from what source.

- "What's the current state?" — read above the line.
- "What evidence supports this?" — read below the line.

The synthesis is pre-computed. Cross-references and contradictions are resolved
at compile time, not at query time.

### 3. Zone ownership.

The brain has two zones with strict ownership boundaries:

**Raw zone** — sacred. The agent reads but NEVER writes, modifies, moves, or
deletes. This is the evidence layer. Everything the brain knows traces back
to a file here. The human owns this zone.

**Wiki zone** — agent-owned. The agent maintains synthesized, linked,
current-state pages. The human reads but does not directly edit. Corrections
flow through the raw zone or direct agent commands.

This separation ensures the evidence is never corrupted by synthesis, and the
synthesis is never blocked by human editing.

---

## Part 2: Data Model

### 2a. Folder-to-Zone Mapping

Folders map to zones defined in Principle 3:

**Raw zone folders:**
- `human/` — live human writing. Zettels, journals, free-form notes.
  - `human/zettel/` — active atomic writing destination
  - `human/zettel/archive/` — archived zettels (agent moves here ONLY with
    explicit human approval)
- `sources/` — immutable reference material.
  - `sources/imports/YYYY-MM-DD-*/` — dated snapshots from prior note tools
  - `sources/assets/` — image and file attachments
  - `sources/Clippings/` — web clippings

Moving a raw zone file into a wiki category folder is FORBIDDEN. The agent
creates a parallel wiki page that cites the source. The source stays in the
raw zone forever.

**Wiki zone folders:** `people/`, `places/`, `projects/`, `companies/`,
`ideas/`, `originals/`, `concepts/`, `how-to/`, `media/`, `tools/`,
`meetings/`, `decisions/`, `household/`, `personal/`, `org/`, `writing/`,
`archive/`.

**Shared:** `inbox/`. Both agent and human write here. The agent uses it
sparingly for items needing human attention. Not a dumping ground.

### 2b. Directory Structure

```
brain-vault/
├── K2_SCHEMA.md          — this file (what the brain IS)
├── K2_DESIGN.md          — how to operate on the brain
├── log.md                — chronological record of operations (append-only)
│
├── human/                — SACRED: human writing, agent NEVER writes/modifies
│   ├── zettel/           active atomic zettel destination
│   │   └── archive/      archived zettels (human-approved moves only)
│   └── <free structure>  any way the human organizes their own writing
│
├── sources/              — SACRED: immutable reference material
│   ├── assets/           image and file attachments
│   ├── Clippings/        web clippings
│   └── imports/          legacy imports from prior note tools
│       └── YYYY-MM-DD-*-import/
│
├── inbox/                — shared triage zone
├── archive/              — retired agent-owned content
│
├── people/               real humans (known + public figures)
├── places/               physical locations
├── projects/             things actively being worked on
├── companies/            organizations
├── ideas/                unexecuted possibilities
├── originals/            user's own thinking — frameworks, takes, syntheses
├── concepts/             mental models, frameworks, theory (world-authored)
├── how-to/               step-by-step process documentation
├── media/                films, TV, anime, manga, games, books, music
├── tools/                software/hardware/apps in active use
├── meetings/             individual meeting records
├── decisions/            decision records with rationale
├── household/            domestic ops — recipes, home maintenance
├── personal/             private reflections (health, habits, body)
├── org/                  institutional workstreams
└── writing/              long-form prose — essays, drafts, commentary
```

### 2c. Frontmatter Specification

Every wiki page MUST have YAML frontmatter with these global fields:

```yaml
---
title: Page Title
type: people|place|project|company|idea|original|concept|how-to|media|tool|meeting|decision|household|personal|org|writing
aliases: [Other Name, Alt Handle]
tags: [tag1, tag2, tag3]
created: 2026-04-16
updated: 2026-04-16
---
```

Tags are free-form cross-cutting labels for workflow domains and topics.
Dates are plain ISO 8601 strings.

#### Per-category frontmatter additions

**people/**
```yaml
role: Current title or affiliation
company: Employer or primary org
relationship: friend|colleague|collaborator|public-figure|family|acquaintance
location: City or region
contact:
  email: addr@example.com
  handles:
    x: "@handle"
    github: username
confidence: high|medium|low
```

**places/**
```yaml
place-type: restaurant|home|landmark|travel|cafe|hotel|park|office
address: Street / district
region: City / country
rating: 1-5
```

**projects/**
```yaml
status: todo|doing|done|cancelled|paused
started: 2026-04-16
collaborators: [alice, bob]
```

**companies/**
```yaml
company-type: studio|label|dev-org|nonprofit|government
industry: [vfx, animation, gaming]
location: HQ city
status: active|defunct|acquired
```

**ideas/**
```yaml
status: raw|validated|graduated-to-project
captured: 2026-04-16
graduated-to: project-slug
```

**originals/**
```yaml
origin-type: framework|hot-take|synthesis|prediction|contrarian-position|pattern
captured: 2026-04-16
triggered-by: meeting-slug
influences: [person-slug, book-slug]
```

Naming rule: slug IS the user's exact phrasing. `meatsuit-maintenance-tax`,
not `biological-needs-maintenance-overhead`. Never sanitize vivid language.

**how-to/**
```yaml
tools-needed: [tool-slug-1, tool-slug-2]
verified: 2026-04-16
```

**media/**
```yaml
media-type: film|tv|anime|manga|game|book|podcast|documentary|music
year: 2024
creator: Director / author / studio / artist
genre: [genre1, genre2]
rating: 1-5
status: todo|doing|done|cancelled|paused
consumed: 2026-04-16
```

**tools/**
```yaml
tool-type: editor|cli|library|framework|hardware|plugin|service
usage: active|trying|abandoned
stack: [tech-domain1, tech-domain2]
```

**meetings/**
```yaml
date: 2026-04-16
attendees: [alice, bob]
duration: 60
meeting-type: sync|standup|one-on-one|review|interview|social
```

**decisions/**
```yaml
decided: 2026-04-16
reversibility: reversible|one-way
domain: architecture|product|career|life|financial
outcome: pending|worked|backfired|mixed
```

**household/**
```yaml
household-type: recipe|maintenance|property|car|pet|domestic-ops
rating: 1-5
last-performed: 2026-04-16
```

**personal/**
```yaml
personal-type: health|habit|body|reflection|routine
```

**org/**
```yaml
org-scope: team|department|company|external-partner
status: active|paused|dissolved
```

**writing/**
```yaml
writing-type: essay|draft|civic|review|long-form
status: draft|published|shelved
published: 2026-04-16
venue: blog-name-or-url
```

### 2d. Page Format

Every wiki page has two layers separated by `---`:

```
---
{YAML frontmatter}
---

{Compiled Truth: current-state synthesis, always rewritten.
 Every fact carries an inline ^[...] footnote citing its source.}

---

## Timeline

{Reverse-chronological evidence log, append-only.
 Each entry: date learned | what was learned | ^[source citation]}
```

**Compiled Truth** (above the line): always current, always rewritten when
new evidence arrives. Contextual facts (birth dates, job changes, relationships)
live here as synthesized narrative. One-paragraph executive summary first,
then structured details.

**Timeline** (below the line): append-only evidence log. Records WHEN the
brain learned something and FROM what source. NOT a contextual history of
real-world events. Each entry cites a raw zone file.

```
## Timeline

- **2026-10-10** | Zettel revealed Cathy is Alice's biological mother ^[[new findings](../human/zettel/2026-10-10-new-findings.md), 2026-10-10]
- **2026-01-01** | Clipping revealed Bob is Alice's father ^[[alice website](../sources/Clippings/alice-website.md), 2026-01-01]
```

### 2e. Citation Format

Inline `^[...]` footnotes. Every fact in compiled truth carries one.

```
^[[display text](relative/path/to/source.md), YYYY-MM-DD]
```

Dates are plain ISO 8601 strings. Implementations MAY render dates as
tool-specific links (e.g., wikilinks for daily-note navigation in some editors).
Dates are NOT entities. They do not get graph edges or wiki pages. Temporal
queries use structured timeline data, not the knowledge graph.

### 2f. Link Format

Entity cross-references use standard markdown links:

```
[Entity Name](relative/path/to/entity.md)
```

This is the canonical link format. Implementations MAY support additional
link syntaxes, but MUST support standard markdown links for graph extraction.

Links are directional: FROM [verb] TO. The link_type describes the
relationship from the FROM entity's perspective.

| from | to | link_type | context |
|------|-----|-----------|---------|
| alice | bob | child_of | biological father |
| bob | alice | parent_of | biological daughter |
| project | tool | uses | primary toon shader |
| person | company | works_at | senior engineer, 2019-present |

Links are bidirectional in practice: if alice→bob has `child_of`, bob→alice
gets `parent_of`. Both directions stored as separate records.

### 2g. Entity Identity

**Canonical slugs** — every entity gets a stable slug as its ID.
- People: `first-last.md`
- Companies: `company-name.md`
- Tools/concepts/projects: short descriptive slugs
- Disambiguate collisions: `david-liu-siat.md`, `david-liu-meta.md`

**Aliases** — frontmatter `aliases` captures alternate names, misspellings,
handles. New variants extend aliases on the existing page; they do not create
a second page.

**Deduplication protocol** — before creating a new page:
1. Search exact and fuzzy title matches.
2. Search aliases and known handles.
3. Check cited sources and linked entities for likely matches.
4. Update an existing page when the match is clear.
5. Use `inbox/` with a flag when identity remains ambiguous.

**Merge protocol** — when two pages are the same entity:
1. Keep the more complete page as canonical.
2. Merge aliases.
3. Merge timeline evidence in chronological order.
4. Update inbound links and citations.
5. Retire the duplicate.

### 2h. Filing Rules

When filing a new page, walk this table top to bottom. First match wins.
When in doubt, file in `inbox/` and flag for human review.

| Category | What goes here | What does NOT go here |
|----------|---------------|-----------------------|
| `people/` | Named humans the user knows or references | Companies (→ companies/); group meetings (→ meetings/) |
| `places/` | Physical locations with a fixed address | Abstract concepts of place (→ concepts/) |
| `projects/` | Active builds with visible progress | Pure ideation (→ ideas/); one-time tasks |
| `companies/` | Organizations relevant to the user | Tools the company makes (→ tools/, cross-link) |
| `ideas/` | Unexecuted possibilities worth returning to | Fully-formed proposals (→ projects/) |
| `originals/` | User's own frameworks, takes, syntheses — verbatim | World-authored concepts (→ concepts/); build ideas (→ ideas/) |
| `concepts/` | Reusable mental models coined by someone else | User's own synthesis (→ originals/) |
| `how-to/` | Process docs with concrete steps | Theory of why it works (→ concepts/) |
| `media/` | Films, TV, anime, manga, games, books, music | Theory about the medium (→ concepts/) |
| `tools/` | Named software/hardware/apps in active use | Abstract tool theory (→ concepts/) |
| `meetings/` | Records of specific meetings | Ongoing relationship state (→ people/) |
| `decisions/` | How a decision was made, options, rationale | Research feeding the decision |
| `household/` | Recipes, home maintenance, domestic ops | Personal health (→ personal/) |
| `personal/` | Private health, habits, body, reflections | Public essays (→ writing/) |
| `org/` | Institutional structure the user is part of | External orgs (→ companies/) |
| `writing/` | Long-form essays, drafts, commentary | Short notes; how-tos (→ how-to/) |
| `inbox/` | Unsorted captures needing triage | Anything with clear category |
| `archive/` | Retired content, superseded pages | Still-current content |

### 2i. Disambiguation Rules

- **originals vs concepts** — Authorship test. User generated it? → `originals/`.
  World-authored? → `concepts/`. User's synthesis of someone else's work IS original.
- **originals vs ideas** — Thing-vs-thought test. Buildable possibility? → `ideas/`.
  Observation or framework? → `originals/`.
- **originals naming** — slug IS the user's exact phrasing. Never sanitize.
- **concept vs how-to** — Concrete steps → `how-to/`. Theory → `concepts/`.
- **project vs idea** — Anyone working on it? Yes → `projects/`. No → `ideas/`.
- **tool vs concept** — Named product → `tools/`. Theoretical approach → `concepts/`.
- **media vs concept** — Specific artifact → `media/`. Theory about medium → `concepts/`.
- **household vs personal** — Operational domestic life → `household/`.
  Private reflection → `personal/`.
- **writing vs concept** — Developed prose → `writing/`. Distilled model → `concepts/`.

### 2j. Notability Gate

Not everything deserves a brain page. Before creating a new entity page:

- **People:** Will you interact with them again? Relevant to work or interests?
- **Companies:** Relevant to work, investments, or interests?
- **Concepts:** Reusable mental model worth referencing later?
- **When in doubt, don't create.** A missing page can be created later.
  A junk page wastes attention and degrades search quality.

### 2k. Imported Content

Existing tags, PARA fields, folder locations, and archive status in imported
sources are UNTRUSTED. They are evidence of prior human categorization effort,
not truth. Read each source as fresh signal.

---

## Part 3: Enforcement

1. The agent MUST NOT write to, edit, move into, or delete from `human/` or
   `sources/` under any circumstance. The only exception: zettel archival
   moves to `human/zettel/archive/`, gated by explicit human approval.

2. The agent MUST emit frontmatter per this spec on every wiki page it
   creates or updates.

3. The agent MUST cite every fact with an inline `^[...]` footnote linking
   to its source in the raw zone.

4. The agent MUST use standard markdown links for entity cross-references.

5. The agent MUST check for existing pages (exact match, fuzzy match, alias
   match) before creating a new entity page.

6. The agent MUST NOT trust imported content metadata. Read each source fresh.

7. The agent MAY write to `inbox/` with discipline (flagged items needing
   human attention only).

8. User's original thinking goes in `originals/` with exact phrasing as slug
   and verbatim content. Never sanitize or paraphrase.

---

## Version History

- **k2-1.0.0** (2026-04-19) — Major rewrite. Tool-neutral data standard.
  Separated WHAT (this file) from HOW (K2_DESIGN.md). Added Principle 0
  (portable standard). Stripped all tool-specific references (Obsidian, gbrain
  CLI). Timeline redefined as evidence log. Dates as plain ISO 8601 (not
  wikilinks). Sources cited inline only (no ## Sources section). Operations
  moved to K2_DESIGN.md.
- **k2-0.5.1** — File relocated to repo root.
- **k2-0.5.0** — Restored originals/ category.
- **k2-0.4.0** — Archive to human/zettel/archive/. Markdown link convention.
- **k2-0.3.0** — Added human/ zone. Zettel archival flow.
- **k2-0.2.0** — Sources moved from frontmatter to body.
- **k2-0.1.0** — Initial k2 schema.

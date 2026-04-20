<!-- schema-version: k2-1.0.0 -->
<!-- fork: kanzaki1201/gbrain-k2 -->

# K2 Brain Schema

Pure schema reference for the K2 brain vault. Directory structure, page format,
frontmatter fields, filing rules, entity identity. No philosophy, no operations.

See K2_DESIGN.md for principles (WHY) and operations (HOW).

---

## Zones

**Raw zone** — `human/`, `sources/`. Agent read-only. Human-owned.

**Wiki zone** — category directories. Agent-owned. Human read-only.

**Shared** — `inbox/`. Both agent and human write here.

## Directory Structure

```
brain-vault/
├── K2_SCHEMA.md          — this file (the schema)
├── K2_DESIGN.md          — principles + operations + implementation
├── log.md                — chronological operation log (append-only)
│
├── human/                — RAW ZONE: human writing, agent never writes
│   ├── zettel/           active atomic zettel destination
│   │   └── archive/      archived zettels (human-approved moves only)
│   └── <free structure>  human organizes their own way
│
├── sources/              — RAW ZONE: immutable reference material
│   ├── assets/           image and file attachments
│   ├── Clippings/        web clippings
│   ├── ingested/         agent-ingested content (URLs, transcripts, etc.)
│   └── imports/          legacy imports from prior note tools
│       └── YYYY-MM-DD-*-import/
│
├── inbox/                — SHARED: triage zone
├── archive/              — WIKI ZONE: retired content
│
├── people/               — WIKI ZONE
├── places/
├── projects/
├── companies/
├── ideas/
├── originals/            user's own thinking — exact phrasing preserved
├── concepts/             world-authored mental models
├── how-to/
├── media/                films, TV, anime, manga, games, books, music
├── tools/
├── meetings/
├── decisions/
├── household/            recipes, home maintenance, domestic ops
├── personal/             health, habits, body, reflections
├── org/
└── writing/              essays, drafts, commentary
```

Note: `sources/` sub-structure beyond `ingested/` is human-defined. Legacy
imports, clippings, and assets may be arranged however the human chose.

## Page Format

Every wiki page has two layers separated by `---`:

```
---
{YAML frontmatter}
---

{Compiled Truth: current-state synthesis, always rewritten.
 Every fact carries an inline ^[...] footnote citing its source.}

---

## Timeline

{Evidence log, append-only.
 Each entry: date learned | what was learned | ^[source citation]}
```

### Timeline entry format

```
- **YYYY-MM-DD** | What the brain learned ^[[source title](../path/to/source.md), YYYY-MM-DD]
```

## Citation Format

Inline `^[...]` footnotes. Every fact in compiled truth carries one.

```
^[[display text](relative/path/to/source.md), YYYY-MM-DD]
```

Dates are plain ISO 8601 strings. Implementations MAY render dates as
tool-specific links.

## Link Format

Entity cross-references use standard markdown links:

```
[Entity Name](relative/path/to/entity.md)
```

Direction convention: FROM [verb] TO.

| from | to | link_type | context |
|------|-----|-----------|---------|
| alice | bob | child_of | biological father |
| bob | alice | parent_of | biological daughter |
| project | tool | uses | primary toon shader |
| person | company | works_at | senior engineer, 2019-present |

Both directions stored separately. alice→bob (child_of) AND bob→alice (parent_of).

## Frontmatter Specification

### Global fields (all wiki pages)

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

### Per-category additions

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

Slug IS the user's exact phrasing. Never sanitize vivid language.

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

## Entity Identity

**Canonical slugs** — stable ID per entity.
- People: `first-last.md`
- Disambiguate collisions: `david-liu-siat.md`, `david-liu-meta.md`

**Aliases** — frontmatter `aliases` captures alternate names, handles,
misspellings. New variants extend aliases; they do not create second pages.

**Deduplication** — before creating a new page:
1. Search exact and fuzzy title matches.
2. Search aliases and known handles.
3. Check cited sources and linked entities.
4. Update existing page when match is clear.
5. Use `inbox/` with flag when identity is ambiguous.

**Merge** — when two pages are the same entity:
1. Keep the more complete page.
2. Merge aliases and timeline evidence.
3. Update inbound links and citations.
4. Retire the duplicate.

## Filing Rules

First match wins. When in doubt → `inbox/`.

| Category | What goes here | Not here |
|----------|---------------|----------|
| `people/` | Named humans | Companies → companies/ |
| `places/` | Physical locations | Abstract place concepts → concepts/ |
| `projects/` | Active builds with progress | Pure ideation → ideas/ |
| `companies/` | Organizations | Tools they make → tools/ |
| `ideas/` | Unexecuted possibilities | Active builds → projects/ |
| `originals/` | User's own thinking, verbatim | World-authored → concepts/ |
| `concepts/` | Mental models by others | User's synthesis → originals/ |
| `how-to/` | Concrete steps | Theory → concepts/ |
| `media/` | Specific works (films, books, games) | Medium theory → concepts/ |
| `tools/` | Named software/hardware | Tool theory → concepts/ |
| `meetings/` | Meeting records | Relationship state → people/ |
| `decisions/` | Decision records + rationale | Research → sources |
| `household/` | Domestic ops, recipes | Personal health → personal/ |
| `personal/` | Health, habits, reflections | Public essays → writing/ |
| `org/` | Institutional structure | External orgs → companies/ |
| `writing/` | Long-form prose | Short notes; how-tos → how-to/ |

### Disambiguation

- **originals vs concepts** — user authored it → originals/. Someone else coined it → concepts/.
- **originals vs ideas** — buildable possibility → ideas/. Observation/framework → originals/.
- **originals naming** — slug = user's exact phrasing. Never sanitize.
- **project vs idea** — work started → projects/. Still speculative → ideas/.
- **household vs personal** — operational domestic → household/. Private reflection → personal/.

### Notability Gate

Before creating a new page: will you reference this again? When in doubt, don't create.
A missing page can be created later. A junk page degrades search quality.

### Imported Content

Existing tags, PARA fields, folder locations, and archive status in imported
sources are UNTRUSTED. Read each source as fresh signal.

## Enforcement

1. Agent MUST NOT write to `human/` or `sources/` (except zettel archival with human approval).
2. Agent MUST emit frontmatter per this spec on every wiki page.
3. Agent MUST cite every fact with inline `^[...]` footnote.
4. Agent MUST use standard markdown links for entity cross-references.
5. Agent MUST check for existing pages before creating new ones.
6. Agent MUST NOT trust imported content metadata.
7. Originals use exact user phrasing as slug. Never sanitize or paraphrase.

---

## Version History

- **k2-1.0.0** (2026-04-19) — Major rewrite. Pure schema reference. Principles
  and operations moved to K2_DESIGN.md. Tool-specific references stripped.
  Added `sources/ingested/` for agent-ingested content.
- **k2-0.5.1** — File relocated to repo root.
- **k2-0.5.0** — Restored originals/ category.
- **k2-0.4.0** — Archive to human/zettel/archive/. Markdown link convention.
- **k2-0.3.0** — Added human/ zone. Zettel archival flow.
- **k2-0.2.0** — Sources moved from frontmatter to body.
- **k2-0.1.0** — Initial k2 schema.

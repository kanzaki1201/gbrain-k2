<!-- schema-version: k2-0.1.0 -->
<!-- fork: kanzaki1201/gbrain-k2 -->
<!-- base: garrytan/gbrain GBRAIN_RECOMMENDED_SCHEMA.md -->

# K2 Brain Schema

This is the authoritative schema for the k2 fork of gbrain. It extends
`GBRAIN_RECOMMENDED_SCHEMA.md` with Obsidian-first conventions, a sources-preserving
workflow, and a category set tuned for a creator/engineer (not a VC partner).

**For philosophy, MECE principles, and compiled-truth-plus-timeline pattern:**
read `GBRAIN_RECOMMENDED_SCHEMA.md` first. This doc specifies the deltas.

---

## Operating Principles (k2-specific)

These override the stock gbrain filing rules where they conflict.

### 1. Sources is sacred. Human writing stays in sources/.

`sources/` contains everything the human writes or captures. The agent does NOT
write new content to `sources/`, does NOT edit existing source files, and does
NOT move source pages out of `sources/` into category folders.

The anti-pattern to avoid: moving a source page into a category folder and calling
it done. Source pages are not the wiki. The agent treats every source page as a
new signal, extracts what matters, and produces compiled truth in category folders.

Category folders (`people/`, `concepts/`, etc.) are entirely agent-owned. They are
synthesis derived from sources, not a relocation of sources.

**Narrow exception: zettel promotion.** Moving a file from
`sources/zettel/` to `sources/promoted_zettel/` is allowed and expected when a
zettel has been wholesale-promoted into a wiki page (see Principle 5 below).
Both directories are within `sources/`, so human ownership is preserved; the
move is a status transition, not a re-filing. No other source moves are allowed.

### 5. Zettel promotion: 1:1 wholesale only.

When a zettel in `sources/zettel/` produces a single wiki page that covers its
content entirely (the wiki page's Compiled Truth fully subsumes the zettel),
the agent:

1. Creates the wiki page in the appropriate category folder.
2. Cites the zettel in the wiki page's `## Sources` body section.
3. Moves the zettel file from `sources/zettel/` to `sources/promoted_zettel/`.
4. Updates any `## Sources` citations on other wiki pages that referenced the
   old path to use the new `promoted_zettel/` path.

Wikilinks inside the zettel's own body, and wikilinks from other pages pointing
at this zettel by basename, continue to resolve after the move (Obsidian
resolves by basename vault-wide).

**Partial-use zettels stay in `sources/zettel/`.** If a zettel contributes to
multiple wiki pages as one source among many, or contributes only a subset of
its content (e.g. one sentence in a person's timeline), it does NOT promote.
It stays available for future enrichment passes.

**When the human wants to add to a promoted zettel,** they start a new zettel
in `sources/zettel/` with a link back to the promoted one. Promoted zettels
are frozen.

### 2. Existing tags and folder locations in imported sources are untrusted.

When ingesting legacy content from an Obsidian import (e.g.
`sources/YYYY-MM-DD-obsidian-import/`), **do not trust existing frontmatter tags,
PARA fields, folder location, or archive status**. Read each page as fresh signal.
Prior categorization was human-best-effort over multiple eras of changing systems;
it is evidence, not truth.

### 3. Obsidian is the primary reader.

Frontmatter must be Obsidian-compatible. Dates should use Obsidian date-link
syntax (`[[2026-04-16]]`) where the date represents a meaningful "when" (watched,
started, visited, last-made) so Obsidian's graph view and backlinks panel surface
the temporal connections. Plain ISO strings (`2026-04-16`) are acceptable for
technical metadata (`created`, `updated`).

### 4. Wikilinks over markdown links inside sources/ are preserved on ingest.

Source pages use Obsidian `[[Wikilink]]` syntax extensively. The agent preserves
this when reading. Agent-written wiki pages SHOULD also use wikilinks where
possible for graph view connectivity, but markdown links are acceptable when the
target is not guaranteed to exist in the vault.

---

## Categories

The vault root directory structure. Every category except `sources/`, `inbox/`,
and `archive/` is agent-writable.

```
brain-vault/
├── sources/              human territory — agent reads, only writes during promotion
│   ├── assets/           image and file attachments
│   ├── YYYY-MM-DD-*-import/   imported legacy content (dated snapshot)
│   ├── zettel/           live atomic human writing (active zettel destination)
│   ├── promoted_zettel/  zettels that have been wholesale-promoted into wiki (frozen)
│   └── <free structure>  any other subdir the human creates for writing
├── people/               real humans (known + public figures referenced)
├── places/               physical locations (restaurants, homes, travel, landmarks)
├── projects/             things the user is actively working on (tech, creative, life)
├── companies/            organizations (studios, labels, dev orgs)
├── ideas/                unexecuted creative/technical possibilities
├── concepts/             mental models, frameworks, theory
├── how-to/               step-by-step process documentation (includes troubleshooting)
├── media/                films, TV, anime, manga, games, books, podcasts, documentaries, music
├── tools/                software/hardware/apps the user actively uses
├── meetings/             individual meeting records
├── decisions/            decision records (how a decision was made, tradeoffs, outcome)
├── household/            domestic ops — recipes, home maintenance, property, car
├── personal/             private reflections distilled from sources (health, habits, body)
├── org/                  institutional workstreams
├── writing/              long-form prose — essays, drafts, civic/policy commentary
├── inbox/                unsorted quick captures awaiting triage
└── archive/              retired content
```

### Deliberate deviations from stock gbrain

**Added:** `how-to/`, `household/`, `tools/`, `decisions/` (renamed from `deals/`).

**Removed:** `hiring/`, `civic/` (civic content goes in `writing/`).

**Merged into `media/`:** `books/` (media-type: book).

**Kept but expect low volume:** `org/`, `meetings/`, `writing/`, `personal/`.

**Explicitly NOT a category:** assets-as-a-concept, vtbassets, or any project-specific
resource collection. Use the `tags` frontmatter field for cross-cutting workflow
membership (e.g. `tags: [vtb, 3d-rigging]`). The page's primary home is determined
by what it IS (a tool, a how-to, a concept), not the workflow it serves.

---

## Category Resolvers

When filing a new compiled page, walk this list top to bottom. First match wins.
When in doubt, file in `inbox/` and flag for human review.

| Category | What goes here | What does NOT go here |
|----------|---------------|-----------------------|
| `people/` | Named humans the user knows or references | Companies the human represents (→ companies/); group meetings (→ meetings/) |
| `places/` | Physical locations with a fixed address | Abstract "the idea of home" (→ concepts/); travel plans not yet taken (→ ideas/ or projects/) |
| `projects/` | Active builds with visible progress | Pure ideation without work started (→ ideas/); one-time tasks (stay in sources) |
| `companies/` | Organizations relevant to the user | Tools the company makes (→ tools/, cross-link to company) |
| `ideas/` | Unexecuted possibilities worth returning to | Fully-formed proposals (→ projects/ or writing/); thoughts with no action potential (stay in sources) |
| `concepts/` | Reusable mental models, frameworks, theory you could teach | Specific tools (→ tools/); how-to steps (→ how-to/); private reflection (→ personal/) |
| `how-to/` | Process docs with concrete steps, troubleshooting fixes | Theory of why it works (→ concepts/, cross-link); one-off observations (stay in sources) |
| `media/` | Films, TV, anime, manga, games, books, podcasts, documentaries, music | Theory about the medium (→ concepts/); reviews published as essays (→ writing/) |
| `tools/` | Named software/hardware/apps actively in use | Abstract tool category theory (→ concepts/); companies that make the tool (→ companies/) |
| `meetings/` | Records of specific meetings (date, attendees, notes) | Ongoing relationship state (→ people/, timeline entries) |
| `decisions/` | How a decision was made, options considered, chosen path, rationale | Research feeding the decision (stays in sources); post-decision execution (→ projects/) |
| `household/` | Recipes, home maintenance, property ops, car, domestic life | Personal health (→ personal/); cooking theory (→ concepts/, cross-link) |
| `personal/` | Private health, body data, habits, personal reflections distilled | Public personal essays (→ writing/); to-do tasks (stay in sources) |
| `org/` | Institutional structure and strategy for orgs the user is part of | Specific org members (→ people/); the org as external entity (→ companies/) |
| `writing/` | Long-form essays, drafts, civic/policy commentary | Short notes (stay in sources); how-tos (→ how-to/) |
| `inbox/` | Unsorted quick captures needing triage | Anything with clear category (file directly) |
| `archive/` | Retired content, superseded pages | Still-current content (keep in primary category) |

---

## Frontmatter Specification

Every agent-written wiki page MUST have Obsidian-compatible frontmatter with the
global fields below. Category-specific fields are added as appropriate.

### Global frontmatter (all wiki pages)

```yaml
---
title: Page Title                       # Obsidian display name
type: people|place|project|company|idea|concept|how-to|media|tool|meeting|decision|household|personal|org|writing
aliases: [Other Name, Alt Handle]       # alternative names (list, may be empty)
tags: [tag1, tag2, tag3]                # cross-cutting labels (workflow domains, topics)
created: 2026-04-16                     # ISO date, plain string
updated: 2026-04-16                     # ISO date, plain string
---
```

**Notes on `tags`:**

- `tags` replaces both the prior `tags` and `domain` fields. One list, free-form.
- Include workflow/domain labels here: `vtb`, `3d-rigging`, `canadian-immigration`,
  `blender`, `rust`, `linux`, etc. This is how cross-cutting workflows are queried.
- Obsidian auto-indexes `tags` for search and filter.

**Sources go in the page body, NOT frontmatter.**

Earlier k2 drafts had a `sources:` frontmatter field. This was removed because
a wiki page compiled from many sources (common during bootstrap: a person page
may cite 30+ zettels and import pages) creates an unwieldy frontmatter block
that clutters Obsidian's Properties UI without offering queryable value.

Sources instead live in the page body as a `## Sources` section at the end of
the Compiled Truth block (before the `---` that separates Compiled Truth from
Timeline). Each source is a wikilink, optionally with a one-line note:

```markdown
## Sources

- [[sources/zettel/2026-04-16-first-tests-with-X|First tests with X]]
- [[sources/imports/2026-04-16-obsidian-import/pages/example-tool]]
- [[sources/promoted_zettel/2026-02-04-some-rigging-test]] — promoted into this page
```

This keeps frontmatter lean while preserving provenance. Obsidian resolves the
wikilinks for backlinks. The timeline entries below the `---` still cite
per-event sources inline.

### Per-category frontmatter additions

#### people/

```yaml
role: Current title or affiliation
company: Employer or primary org affiliation
relationship: friend|colleague|collaborator|public-figure|family|acquaintance
location: City or region
contact:
  email: addr@example.com
  handles:
    x: "@handle"
    github: username
confidence: high|medium|low             # how well the user knows them
```

#### places/

```yaml
place-type: restaurant|home|landmark|travel|cafe|hotel|park|office
address: Street / district
region: City / country
rating: 1-5                             # user's 5-star scale
```

Place visits live in the page body timeline, not frontmatter.

#### projects/

```yaml
status: todo|doing|done|cancelled|paused    # unified with media
started: "[[2026-04-16]]"
collaborators: ["[[Alice]]", "[[Bob]]"]
```

Tech details (repo URL, language, framework) live in the page body, not frontmatter.
Not every project is a tech project.

#### companies/

```yaml
company-type: studio|label|dev-org|nonprofit|government
industry: [vfx, animation, gaming]
location: HQ city
status: active|defunct|acquired
```

#### ideas/

```yaml
status: raw|validated|graduated-to-project
captured: "[[2026-04-16]]"
graduated-to: "[[project-slug]]"        # if status == graduated-to-project
```

#### concepts/

No category-specific fields required. Use `tags` for domain labels.

#### how-to/

```yaml
tools-needed: ["[[tool-slug]]", "[[tool-slug]]"]
verified: "[[2026-04-16]]"              # last date confirmed working
```

No `difficulty` field — most how-tos are pragmatic fixes, not tutorials. Difficulty
metadata adds noise without utility here.

#### media/

```yaml
media-type: film|tv|anime|manga|game|book|podcast|documentary|music
year: 2024
creator: Director / showrunner / author / studio / artist
genre: [genre1, genre2]
rating: 1-5
status: todo|doing|done|cancelled|paused    # unified with projects
                                            # "doing" = watching/reading/playing
consumed: "[[2026-04-16]]"              # when finished (if status == done)
```

#### tools/

```yaml
tool-type: editor|cli|library|framework|hardware|plugin|service
usage: active|trying|abandoned          # renamed from "status" to avoid collision
                                        # with project/media status semantics
stack: [tech-domain1, tech-domain2]     # where this tool fits
```

#### meetings/

```yaml
date: "[[2026-04-16]]"
attendees: ["[[Alice]]", "[[Bob]]"]
duration: 60                            # minutes
meeting-type: sync|standup|one-on-one|review|interview|social
```

#### decisions/

```yaml
decided: "[[2026-04-16]]"
reversibility: reversible|one-way       # door type (per Bezos heuristic)
domain: architecture|product|career|life|financial
outcome: pending|worked|backfired|mixed
revisited: "[[2026-04-16]]"             # if retrospected
```

#### household/

```yaml
household-type: recipe|maintenance|property|car|pet|domestic-ops
                                        # recipes live here under household-type: recipe
rating: 1-5                             # e.g. for recipes
last-performed: "[[2026-04-16]]"        # last cooked, last serviced, etc.
```

Recipe-specific optional fields (when `household-type: recipe`):
```yaml
cuisine: Italian
prep-time: 15                           # minutes
cook-time: 30
attribution: url-or-person
```

#### personal/

```yaml
personal-type: health|habit|body|reflection|routine
updated: "[[2026-04-16]]"
```

No rating/status fields — personal reflections aren't tracked like tasks.

#### org/

```yaml
org-scope: team|department|company|external-partner
status: active|paused|dissolved
```

#### writing/

```yaml
writing-type: essay|draft|civic|review|long-form
status: draft|published|shelved
published: "[[2026-04-16]]"             # if published somewhere
venue: blog-name-or-url
```

---

## Disambiguation Rules

When two categories could fit, the rule that resolves it:

- **concept vs how-to** — Concrete process with steps and verification → `how-to/`. Teachable framework or mental model → `concepts/`. A how-to page MAY link to a concept page explaining the why.
- **project vs idea** — Anyone working on it right now? Yes → `projects/`. No → `ideas/`. Graduation is a promote operation, with `graduated-to` frontmatter on the idea.
- **tool vs concept** — Specific named product/software → `tools/`. Theoretical approach to tooling → `concepts/`.
- **place vs concept** — Physical location with coordinates → `places/`. Abstract idea of a place → `concepts/`.
- **media vs concept** — The specific artifact (a film, a book, a game) → `media/`. Theory about the medium → `concepts/`.
- **person vs project** — The human → `people/`. The thing they built → `projects/`. Cross-link bidirectionally.
- **personal vs concept** — Private reflection about the user's own body/life → `personal/`. Reusable mental model → `concepts/`.
- **household vs personal** — Domestic operations a family member or PA could execute → `household/`. Private reflection → `personal/`.
- **writing vs concept** — Long prose artifact with argument/narrative → `writing/`. Distilled knowledge/framework → `concepts/`.
- **company vs org** — External organization the user interacts with → `companies/`. Institutional structure the user is part of → `org/`.
- **meeting vs people** — The event itself (attendees, notes) → `meetings/`. The relationship state → `people/`, with the meeting referenced as a timeline entry.

When nothing clearly fits: file in `inbox/` and flag. An inbox entry is a signal
that the schema may need a new category.

---

## Compiled Truth + Timeline (unchanged from stock)

Every wiki page has two sections separated by `---`:

**Above the line — Compiled Truth.** Current state, rewritten on every update.
Starts with a one-paragraph executive summary.

**Below the line — Timeline.** Append-only evidence log. Dated entries, sourced.

See `GBRAIN_RECOMMENDED_SCHEMA.md` for the full pattern. No k2-specific deviations.

---

## Example Page (sanitized)

```markdown
---
title: Example Tool
type: tool
aliases: [ExampleApp]
tags: [3d-rigging, blender, vtb]
created: 2026-04-16
updated: 2026-04-16
tool-type: plugin
usage: active
stack: [3d-rigging, character-production]
---

# Example Tool

A Blender plugin for automatic humanoid rig generation, used extensively in
character production pipelines.

## State

- **Purpose:** Automatic rig generation for humanoid models in Blender
- **Usage:** Active — used in recent rigging workflow
- **Companion tools:** See also [[blender]], [[cats-for-blender]]

## Open Threads

- None currently

## See Also

- [[blender]] — the host application
- [[how-to/rig-a-character-in-blender]] — process using this tool

## Sources

- [[sources/imports/2026-04-16-obsidian-import/pages/example-tool]] — imported legacy page with accumulated notes and sub-tags
- [[sources/zettel/2026-02-04-some-rigging-test]] — first hands-on test of the rigging workflow

---

## Timeline

- **[[2026-02-04]]** | [[sources/zettel/2026-02-04-some-rigging-test]] — First hands-on test of the rigging workflow with this plugin.
- **[[2026-04-16]]** | [[sources/imports/2026-04-16-obsidian-import/pages/example-tool]] — Imported legacy page with accumulated notes and sub-tags.
```

---

## Enforcement

1. The agent MUST read `docs/K2_SCHEMA.md` before creating any new wiki page.
2. The agent MUST NOT write new content to `sources/`, MUST NOT edit existing
   source files, and MUST NOT move source pages into category folders. The only
   allowed write to `sources/` is the zettel promotion move
   (`sources/zettel/` → `sources/promoted_zettel/`) per Operating Principle 5.
3. The agent MUST emit frontmatter per this spec on every wiki page it creates
   or updates. Missing required fields is a quality failure.
4. The agent MUST include a `## Sources` section in every wiki page body, with
   wikilinks to all source files that contributed to the page. `sources:` in
   frontmatter is NOT used (moved to body to avoid frontmatter bloat).
5. The agent MUST NOT trust existing tags, PARA fields, folder location, or
   archive status in imported sources. Read each source as fresh signal.
6. If a source page doesn't have a clear category, the compiled page goes in
   `inbox/` with a flag for human review. Do not guess.

---

## Version History

- **k2-0.1.0** (2026-04-16) — Initial k2 schema. Extends base GBRAIN_RECOMMENDED_SCHEMA.md.
- **k2-0.2.0** (2026-04-16) — Sources moved from frontmatter to `## Sources` body section
  (avoids frontmatter bloat when a page cites many sources). Added
  `sources/promoted_zettel/` convention for 1:1 wholesale-promoted zettels.

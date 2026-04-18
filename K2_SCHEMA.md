<!-- schema-version: k2-0.5.0 -->
<!-- fork: kanzaki1201/gbrain-k2 -->
<!-- base: garrytan/gbrain GBRAIN_RECOMMENDED_SCHEMA.md -->

# K2 Brain Schema

Authoritative schema for the brain vault. Obsidian-first conventions,
sources-preserving workflow, category set tuned for a creator/engineer.

## Founding principles

**1. Every piece of knowledge has a primary home (MECE directories).** Every
page lands in exactly one category directory. No duplicated pages, no
ambiguity about where something goes. This is the single most important
structural decision — without it, knowledge bases rot, the same fact lives
in three places, and the agent stops trusting the system.

MECE applies to directories, not to reality. A real person is multi-faceted —
the person page is their *primary home*, and typed cross-references surface
their other facets (project lead, meeting attendee, etc.) without creating
duplicate pages.

**2. Compiled Truth + Timeline (two-layer pages).** Every wiki page has two
sections separated by `---`. Above the line is Compiled Truth, rewritten on
every update; below the line is the Timeline, append-only evidence log. If
someone asks "what's the current state?" they read above; if someone asks
"what happened?" they read below. The synthesis is pre-computed — unlike
RAG, the cross-references and contradictions have already been flagged.

**3. Enrichment fires on every signal.** The brain grows as a side effect of
normal operations, not as a separate task the user remembers to do. Every
new file in sources/ or human/ triggers downstream processing (zettel-processor
for human zettels, signal-detector / ingest for other signals) that compiles
and cross-references without human prompting beyond the initial capture.

Knowledge management stayed fragile for decades because the maintenance burden
fell on humans. LLM agents change the economics. They do not get bored of
updating cross-links, merging contradictory sources, or touching 50 files in
one pass. The brain stays alive because the maintenance cost is near zero.

## Wiring It Into The Agent

The brain must be wired into the agent as an operating rule, not a suggestion.

1. **Before creating any brain page → read the resolver.** The agent config
   points to `RESOLVER.md`, and `RESOLVER.md` points to the relevant skill or
   local filing rule.
2. **Before answering any question about people, companies, projects,
   decisions, or strategy → search the brain first.** File contents stay
   current; the agent's memory of them decays.
3. **Enrichment fires on every signal.** Meetings, zettels, imports, links,
   and manual corrections all route into the enrichment / compile pipeline.
4. **Corrections are highest-value data.** When the human corrects a fact,
   routing, or framing, update the brain immediately.

Chain of authority for this fork:

- agent config / workspace instructions
- `skills/RESOLVER.md`
- `skills/_brain-filing-rules.md` and skill-specific contracts
- `K2_SCHEMA.md`

## Architecture

Three layers:

**Raw sources** — `human/` is the sacred human zone; `sources/` is immutable
reference material. These are primary-source inputs. The agent reads them,
derives from them, and preserves them.

**The brain** — the agent-owned compiled wiki in category directories such as
`people/`, `projects/`, `concepts/`, and `tools/`. This is where the agent
maintains synthesized, linked, current state.

**The schema** — this document plus `RESOLVER.md` and filing rules. The schema
defines where knowledge lives, how pages are shaped, how evidence is preserved,
and which workflows fire when new signals arrive.

## The Database + Markdown Architecture

The markdown wiki is the human-facing layer — the primary interface for humans
and LLMs. It is the surface you read and edit against. Underneath it sits a
structured layer that makes the system reliable at scale.

### The Four Database Primitives

**Entity registry** — canonical identity, aliases, and external IDs. This is
the source of truth for “is this the same person/company/tool/place?” Identity
resolution belongs here, not in ad hoc filename guessing.

**Event ledger** — immutable events for every signal that touches the brain:
meeting attended, zettel compiled, email received, link ingested, correction
applied, archival approved. Timeline sections in markdown are generated from or
aligned to this event stream.

**Fact store** — structured claims with provenance. “Alice works at X” and
“project Y is paused” are facts with sources, timestamps, and confidence. When
sources disagree, the contradiction stays visible as data rather than getting
flattened into accidental prose.

**Relationship graph** — typed edges between entities: person→company,
person→project, company→decision, concept→tool, meeting→attendee. This is what
lets the brain answer graph-shaped questions instead of relying on grep luck.

### Why This Matters

- **Identity resolution becomes structural.** Merging two entities is a
  registry-level operation, not a scavenger hunt across duplicate files.
- **Contradictions become visible.** Competing facts can coexist with distinct
  provenance until the human or agent resolves them.
- **Concurrency gets safer.** Events append, facts upsert, markdown rewrites.
  The system does not rely on one giant hand-maintained narrative.
- **Graph queries become natural.** “Who do I know at this company?” and “what
  tools connect to this workflow?” are relationship questions, not text-search
  accidents.

### File-Layer Conventions

The markdown layer maps directly to those primitives:

1. **Frontmatter stores queryable structure.** Put fields you want to filter or
   reason over in frontmatter.
2. **`## Sources` preserves provenance.** Evidence lives in body-level source
   lists and inline citations, not in vague narrative memory.
3. **Timeline is an event stream.** Dated, sourced, append-only evidence goes
   below the `---` boundary.
4. **Compiled Truth stays separate from evidence.** Above the line is synthesis;
   below the line is evidence.
5. **Canonical slugs stay stable.** Filenames are durable IDs for linking and
   graph extraction.

---

## Operating Principles

### 1. Two tiers of human ownership: `human/` is sacred, `sources/` is reference.

**`human/` is SACRED.** Live human writing lives here. The agent NEVER writes
to `human/`, NEVER modifies files in `human/`, and NEVER moves files in or
out of `human/` except one narrow case (see Principle 5). If the agent needs
to record a derived fact, it goes in a compiled wiki page (people/, concepts/,
etc.) that CITES the human source — the human source itself is untouched.

**`sources/` is immutable reference material.** Imported legacy content (prior
note tools, Obsidian export) and attachments live here. The agent reads from
`sources/` freely and NEVER writes to it. Matured human content approved for
archival goes to `human/zettel/archive/` so archived zettels remain visibly
inside the human-owned zone while leaving the live zettel area (see Principle
6).

**Moving source pages OUT of `sources/` is also forbidden.** Even though the
target folder is an agent-owned category, the move itself violates the
sources-as-immutable-reference invariant. A source page about Alice does NOT
get relocated to `people/alice.md` — instead, the agent creates a parallel
`people/alice.md` that cites the source page in its `## Sources` body section.
The source page stays in `sources/` forever.

**Category folders** (`people/`, `concepts/`, etc.) are entirely agent-owned.
They are synthesis derived from human/ and sources/, not a relocation of them.

**`inbox/` is shared.** Both agent and human write here. Agent should be
disciplined about inbox writes — the inbox is a triage zone, not a dumping
ground. Every agent-written inbox entry should be reviewable and actionable;
flagged items for human attention are the typical case.

Anti-pattern to avoid: moving human content into a category folder and calling
it done. Human content stays in human/ (or `human/zettel/archive/` once
explicitly archived). The agent's job is to compile parallel wiki pages that
cite the human sources.

### 5. Zettel philosophy

**Zettels are primary-source thought, not drafts waiting to be erased.**
`human/zettel/` is where live human thinking lands in its original shape.
Fragments, tensions, vivid phrasing, unresolved questions, and partial ideas all
belong here. The wiki compiles from zettels; it does not replace their role as
evidence of how the human was thinking.

**A zettel can remain valuable without ever becoming a clean 1:1 wiki page.**
Some zettels compile wholesale into one page. Some fan out into multiple pages.
Some stay partial for a long time because they are still carrying unresolved
signal. Partial-use is a valid steady state, not a schema failure.

**The human owns completion and archival timing.** Wholesale-compiled + stable is
an archival heuristic, not a source of authority. The human can keep a zettel
active indefinitely, explicitly approve archival of a non-candidate zettel, or
manually move a zettel into `human/zettel/archive/`. Human intent outranks the
system's candidacy logic.

**Zettels preserve compression-resistant thought.** The value is often in the
exact phrasing, the awkward edge, the contradiction, or the unflattened note.
The wiki's job is to synthesize, cross-link, and keep current state. The
zettel's job is to preserve the raw shape of thought that led there.

**Archival is a path transition, not a demotion.** An archived zettel remains a
valid source. It simply leaves the active writing zone. Archival means "this no
longer needs to sit in live human workspace," not "this thought has lost value"
or "the wiki has fully replaced it in every sense."

### 6. Zettel processing and archival: two-skill split, human-approved for archival.

Zettel handling is split across two skills by responsibility:

**Compile (agent-owned wiki updates): `maintain` Phase 1.**
When a zettel in `human/zettel/` is new or updated, the nightly `maintain`
pass detects the file change and compiles the zettel's content into the
appropriate category wiki page (concepts/, how-to/, ideas/, etc.):

1. `maintain` runs `git diff --name-status` since its last checkpoint to
   find new/modified zettels (and source files).
2. For each new zettel, create or update wiki page(s) with the zettel cited
   in `## Sources` using a markdown link to `human/zettel/<name>.md`.
3. For each updated zettel, rewrite affected wiki pages' Compiled Truth and
   append a timeline entry noting the re-sync.
4. **The zettel itself stays in `human/zettel/`.** Agent NEVER modifies it.

**Archival lifecycle (human-gated): `zettel-status-check`.**
The evening `zettel-status-check` pass handles archival state:

1. Scans `human/zettel/` and classifies each zettel (active / stable-compiled
   / candidate-for-archival / orphan).
2. Surfaces archival candidates via the messaging channel:
   - Wholesale-compiled AND stable (1:1 into one wiki page, no recent edits).
   - Mature multi-target zettels functioning as source reservoirs rather
     than active live writing.
3. **Only when the human explicitly approves** does `zettel-status-check`
   move the zettel: `human/zettel/foo.md` → `human/zettel/archive/foo.md`.
   Wiki pages that cited the old path have citations rewritten to the new
   path.
4. If the human manually moves a zettel into `human/zettel/archive/`,
   `zettel-status-check` treats the new path as authoritative and rewrites
   citations without re-applying candidacy rules.

Markdown links referencing the zettel by path must be rewritten on archival move.
Obsidian wikilinks pointing at the zettel by basename (if any exist in human-
authored content) continue to resolve after the move because Obsidian resolves
by basename vault-wide.

**Partial-use zettels do not become automatic archival candidates just because
they are multi-target.** If a zettel contributes to multiple wiki pages as one
source among many, or only partially compiles (some content not yet captured),
it usually stays in `human/zettel/`. Maintenance may still surface a mature,
long, stable multi-target zettel as a human-review archival candidate. A human
can also explicitly approve archival of a specific zettel, or manually move a
zettel into `human/zettel/archive/`; in that case the agent treats the new path
as authoritative and updates citations to match.

**Updated zettels are re-processed.** The zettel-processor detects zettels that
have been modified since last run and re-compiles the affected wiki pages.
This is why the zettel itself must stay editable in `human/zettel/` — the
human may keep developing the idea.

**Dreaming and maintenance loops** actively scan `human/` to detect:
- New zettels needing initial compile
- Updated zettels needing re-compile
- Archival candidates (stable + wholesale compiled, plus mature multi-target
  review candidates)
- Orphan compiled pages (wiki page exists but source zettel was deleted)

All findings surface via the maintenance messaging channel. None of them
trigger autonomous agent writes to `human/`.

### 2. Existing tags and folder locations in imported sources are untrusted.

When ingesting legacy content from an Obsidian import (e.g.
`sources/YYYY-MM-DD-obsidian-import/`), **do not trust existing frontmatter tags,
PARA fields, folder location, or archive status**. Read each page as fresh signal.
Prior categorization was human-best-effort over multiple eras of changing systems;
it is evidence, not truth.

### 3. Obsidian is the primary reader.

Frontmatter must be Obsidian-compatible. Dates in agent-written page bodies
use Obsidian date-link syntax (`[[2026-04-16]]`) where the date represents a
meaningful "when" (watched, started, visited, last-made). This is the ONE
place the agent emits wikilinks: clicking a date stub navigates to the daily
note. Plain ISO strings (`2026-04-16`) are acceptable for technical metadata
(`created`, `updated`).

### 4. Agent writes markdown links; reserve wikilinks for date stubs.

Agent-written wiki pages use standard markdown link syntax for entity cross-
references: `[Name](../people/foo.md)`, `[Blender](../tools/blender.md)`. This
matches gbrain's CLI link extractor (`gbrain check-backlinks`), which scans for
`[text](path/to/page.md)` patterns to populate the `links` table in PGLite and
detect missing back-links. Wikilink syntax `[[foo]]` is invisible to that
extractor, so agent-written pages must use markdown links to stay graph-
indexed by the CLI.

**The one exception — date stubs.** Agent-written pages use `[[YYYY-MM-DD]]`
wikilinks for dates in timeline entries and semantic date fields (`started`,
`consumed`, etc.). Obsidian resolves these to daily notes on click; gbrain
correctly ignores them as non-entity edges.

Content inside `human/` and `sources/` may use whatever link syntax the human
or original source chose. The agent never rewrites wikilinks in those zones.
When the agent cites a human or source file in its own `## Sources` section,
it uses a markdown link to the file path.

---

## Categories

The vault root directory structure. `human/` and `sources/` are strictly read-
only for the agent. `inbox/` is shared. All other categories are agent-writable.

```
brain-vault/
├── RESOLVER.md           — master dispatch table: agent reads this FIRST on every
│                           non-operational message to route to the correct skill
├── schema.md             — this file (symlink to ~/gbrain-k2/K2_SCHEMA.md);
│                           page conventions, templates, category definitions
├── log.md                — chronological record of all ingests/updates (append-only)
│
├── human/                — SACRED: human writing, agent NEVER writes or modifies
│   ├── zettel/           active atomic zettel destination (new writing lands here)
│   │   └── archive/      archived zettels, still inside the human-owned zone
│   └── <free structure>  any way the human organizes their own writing
├── sources/              immutable reference material, agent NEVER writes
│   ├── assets/           image and file attachments
│   └── imports/          legacy imports (dated snapshots from prior note tools)
│       └── YYYY-MM-DD-*-import/
├── archive/              retired agent-owned content (agent-writable)
├── inbox/                shared triage zone (agent and human both write here;
│                          agent uses sparingly to avoid bloat)
├── people/               real humans (known + public figures referenced)
├── places/               physical locations (restaurants, homes, travel, landmarks)
├── projects/             things the user is actively working on (tech, creative, life)
├── companies/            organizations (studios, labels, dev orgs)
├── ideas/                unexecuted creative/technical possibilities
├── originals/            user's own thinking — frameworks, takes, syntheses
│                          captured in the user's exact phrasing
├── concepts/             mental models, frameworks, theory (world-authored)
├── how-to/               step-by-step process documentation (includes troubleshooting)
├── media/                films, TV, anime, manga, games, books, podcasts, documentaries, music
├── tools/                software/hardware/apps the user actively uses
├── meetings/             individual meeting records
├── decisions/            decision records (how a decision was made, tradeoffs, outcome)
├── household/            domestic ops — recipes, home maintenance, property, car
├── personal/             private reflections distilled from sources (health, habits, body)
├── org/                  institutional workstreams
└── writing/              long-form prose — essays, drafts, civic/policy commentary
```

### Root files

**RESOLVER.md** — symlink to `~/gbrain-k2/skills/RESOLVER.md`. The master
dispatch table mapping user triggers to brain skills. The agent reads this
before routing any non-operational message. URL in message → idea-ingest.
Question about entities → query. Person/company mentioned → enrich.

**schema.md** — symlink to `~/gbrain-k2/K2_SCHEMA.md` (this file). Page
conventions, category definitions, templates, and operating principles. The
agent reads this to understand how the brain is structured.

**log.md** — chronological record of all ingests and updates. Append-only.
Each entry is a self-contained line: `YYYY-MM-DD HH:MM | action | path —
context`. Brain-writing skills append to this after every ingest or update.
At scale, concurrent appends rarely conflict because each line is independent.
Treat as operational telemetry for the brain, not a hand-maintained artifact.

### Category notes

**Explicitly NOT a category:** assets-as-a-concept, vtbassets, or any project-
specific resource collection. Use the `tags` frontmatter field for cross-cutting
workflow membership (e.g. `tags: [vtb, 3d-rigging]`). The page's primary home
is determined by what it IS (a tool, a how-to, a concept), not the workflow it
serves.

**Low expected volume:** `org/`, `meetings/`, `writing/`, `personal/`. These
categories exist for clarity of routing when content does arrive, but may stay
near-empty for long periods depending on the human's current activity.

**Category list is the source of truth.** When an upstream gbrain change
suggests a new category, route it through the `update-k2` skill flow — the
category list here is authoritative for the fork.

## Entity Identity and Deduplication

In a system fed by zettels, meetings, imports, and enrichment APIs, identity is
the first major failure mode. Without a canonical identity layer, the brain
splits quietly: one page from a transcript, another from an import, a third
from an alias.

### Canonical slugs

Every entity gets a canonical slug that acts as its stable ID.

- People: `first-last.md`
- Companies: `company-name.md`
- Places: `place-name.md`
- Tools / concepts / projects: short stable descriptive slugs

When collisions happen, disambiguate rather than duplicating ambiguity:
`david-liu-siat.md`, `david-liu-meta.md`.

### Aliases

Frontmatter `aliases` captures alternate names, misspellings, handles, and
other variants. New variants extend aliases on the existing page; they do not
create a second page.

### Deduplication protocol

Before creating a new page, the agent must:

1. Search exact and fuzzy title matches.
2. Search aliases and known handles.
3. Check cited sources and linked entities for likely matches.
4. Update an existing page when the match is clear.
5. Use `inbox/` with `flagged: human-review` when identity remains ambiguous.

### Merge protocol

When two pages are discovered to be the same entity:

1. Keep the more complete page as canonical.
2. Merge aliases.
3. Merge timeline evidence in chronological order.
4. Update inbound links and `## Sources` references as needed.
5. Retire the duplicate.

Weekly maintenance should actively look for likely duplicates: similar names,
shared handles, shared emails, same company plus overlapping timelines.

## Key Disambiguation Rules

The most common filing confusions:

- **Concept vs idea** — teachable reusable model → `concepts/`; buildable
  possibility → `ideas/`.
- **Idea vs project** — work started with visible execution → `projects/`;
  still speculative → `ideas/`.
- **Original vs concept** — the user's phrasing and synthesis → `originals/`;
  world-authored framework → `concepts/`.
- **How-to vs concept** — concrete steps and troubleshooting → `how-to/`;
  explanatory theory → `concepts/`.
- **People vs companies** — the human being → `people/`; the organization →
  `companies/`.
- **Household vs personal** — operational domestic life → `household/`;
  private body / habit / reflection material → `personal/`.
- **Writing vs concepts** — developed prose artifact → `writing/`; distilled
  reusable model → `concepts/`.
- **Sources vs compiled wiki** — immutable evidence stays in `sources/` or
  `human/`; synthesized interpretation lives in the category folders.

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
| `originals/` | User's own frameworks, hot takes, syntheses, contrarian positions — captured verbatim in user's phrasing | World-authored concepts even if user likes them (→ concepts/); product/build ideas (→ ideas/); finalized prose (→ writing/) |
| `concepts/` | Reusable mental models, frameworks, theory coined by someone else that the user references | User's own synthesis or take (→ originals/); specific tools (→ tools/); how-to steps (→ how-to/) |
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
type: people|place|project|company|idea|original|concept|how-to|media|tool|meeting|decision|household|personal|org|writing
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
Timeline). Each source is a markdown link (path relative to the current page),
optionally with a one-line note:

```markdown
## Sources

- [First tests with X](../human/zettel/2026-04-16-first-tests-with-X.md)
- [Obsidian import — example-tool](../sources/imports/2026-04-16-obsidian-import/pages/example-tool.md)
- [2026-02-04 rigging test](../human/zettel/archive/2026-02-04-some-rigging-test.md) — archived after human approval
```

Markdown links (not wikilinks) are used so that gbrain's `check-backlinks`
extractor recognizes the reference and populates the `links` table. The
timeline entries below the `---` still cite per-event sources inline using
the same markdown-link format.

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

#### originals/

```yaml
origin-type: framework|hot-take|synthesis|prediction|contrarian-position|pattern
captured: "[[2026-04-16]]"              # when the thinking was first captured
triggered-by: "[[meeting-slug]]"        # the conversation/article/moment that sparked it
influences: ["[[person-slug]]", "[[book-slug]]"]  # what shaped it
```

**Naming rule:** slug IS the user's exact phrasing. `meatsuit-maintenance-tax`,
not `biological-needs-maintenance-overhead`. Do not sanitize vivid language.

**Body rule:** capture content verbatim in the user's own words. Never
paraphrase. The raw phrasing is the intellectual artifact. Use the structure:
`## The Idea` (verbatim) → `## Context` (what triggered it) → `## Connections`
(cross-links to influences).

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

- **originals vs concepts** — The authorship test. User generated the framework, named it with their own phrasing, holds the contrarian position? → `originals/`. Someone else coined it and the user is just referencing or teaching it? → `concepts/`. User's synthesis of someone else's work IS original — goes in `originals/`, not `concepts/`.
- **originals vs ideas** — The thing-vs-thought test. User wrote a product/business idea worth building? → `ideas/`. User wrote an observation, framework, or take with no build action? → `originals/`.
- **originals naming** — Use the user's exact phrasing as the slug. `meatsuit-maintenance-tax`, not `biological-needs-maintenance-overhead`. The vividness IS the concept. Never sanitize into corporate-speak.
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

## Compiled Truth + Timeline (full pattern)

Every wiki page has two layers separated by a horizontal rule (`---`):

**Above the line — Compiled Truth.** Always current, always rewritten when
new information arrives. Starts with a one-paragraph executive summary. If
you read only this, you know the state of play. Followed by structured State
fields, Open Threads (active items — removed when resolved), a `## Sources`
section citing contributing source files, and See Also (cross-links).

**Below the line — Timeline.** Append-only, never rewritten. Reverse-
chronological evidence log. Each entry: date, source, what happened. When
an open thread gets resolved, it moves here with its resolution.

Query rules:
- "What's the current state?" → read above the line.
- "What happened?" → read below the line.
- The top is the current summary. The bottom is the source log.

The synthesis is pre-computed. Unlike RAG, where the LLM re-derives knowledge
from scratch every query, the brain has already done the work. The cross-
references are already there. The contradictions have already been flagged.

Enforcement: compiled-truth sections are REWRITTEN (not appended to) as new
information arrives. Timeline sections are APPENDED TO (never rewritten).
Conflating these two update modes is the most common way wiki pages drift
from reality.

---

## Operational Pipeline

The schema defines where knowledge lives. The pipeline defines how knowledge
arrives and compounds. This chapter is what makes the brain grow continuously
instead of sitting static.

### Enrichment fires on every signal

Every time any signal touches an entity — a meeting, email, message, feed
item, manual mention, a new zettel — the enrichment pipeline fires on every
entity that signal mentions. The brain grows as a side effect of normal
operations, not as a separate task the user remembers to do.

This is the single most important operational pattern. If a new ingest
pathway is added, its implementation MUST call enrich on every person,
company, project, concept, tool, place, or media item it touches. If that
call is missing, the brain stops compounding from that source.

### Enrichment tiers

Scale enrichment to the entity's relevance. Over-enriching every mention
wastes API budget and creates bloated pages.

- **Tier 1 — key entities.** Full pipeline. Inner circle humans, active
  projects, primary tools, active places. Run all applicable data-source
  skills. Update beliefs, state, cross-references.
- **Tier 2 — notable entities.** Web search + social + brain cross-reference.
  Occasional collaborators, tools under evaluation, media currently being
  consumed.
- **Tier 3 — minor mentions.** Extract signal from source only, append a
  timeline entry. No API calls. Most entities start here and escalate
  when interaction frequency warrants.

**Tier escalation is signal-driven.** A Tier 3 entity that receives a second
or third distinct signal escalates to Tier 2. A Tier 2 entity involved in an
upcoming calendar event or an active project escalates to Tier 1 for the
duration of that engagement.

**Thin-and-real beats fat-and-generic.** A page with one real interaction
timeline entry is more valuable than a page stuffed with boilerplate web-
scraped facts. Don't waste enrichment on entities with no public presence.

### Raw data sidecars

When enrichment calls external APIs, the full API response is preserved
separately from the distilled wiki page. In gbrain's PGLite schema this is
the `raw_data` table keyed by page + source with a `fetched_at` timestamp.

- **Wiki page** — distilled, readable. Current role, headline, top skills,
  relationship state, beliefs with citations. Everything a reader benefits
  from.
- **Raw sidecar** — full API response body. Complete work history with
  descriptions, platform-specific IDs, follower counts, every field the
  provider returned.

On re-enrichment, the sidecar row for a given source is REPLACED, not
appended (the `UNIQUE(page_id, source)` constraint enforces this). The
wiki page is rewritten in place.

### Entry criteria — what gets a page

Not every mention deserves a brain page. Scale page creation to relevance.

**Always create a page for:**
- Humans the user has had a 1:1 or small-group interaction with
- Active collaborators, close friends, family, inner circle
- Projects the user is actively building
- Tools and media the user actively uses or is consuming now
- Places the user visits or references with meaningful context

**Create if signal exists:**
- Entities mentioned by name with concrete context across 2+ distinct signals
- Entities linked from an already-enriched page with a non-trivial relationship

**Do NOT create:**
- Bare name mentions with no identifying context
- Mass event guest lists with no direct interaction
- One-off references the user is unlikely to return to

When in doubt: skip. A missing page can be created later when a second signal
arrives. A junk page wastes attention and degrades search quality.

### How enrich wires into everything

Every ingest pathway terminates in a call to the enrich skill. Meeting
ingestion creates the meeting page, then calls enrich for every attendee and
every company/project/tool discussed. Email triage classifies the inbox, then
calls enrich for every unfamiliar sender. Social monitoring detects notable
engagement, then calls enrich on the engaging account. Manual capture in
conversation extracts entities, then calls enrich on each.

```
Meeting ingest ───────┐
Email triage ─────────┤
Social radar ─────────┤        ENRICH
Idea ingest ──────────┼──→   (orchestrator)   ──→   people/ companies/
Media ingest ─────────┤                              projects/ tools/
Manual mention ───────┤                              concepts/ places/
Zettel processor ─────┘                              media/ how-to/
```

The enrich skill is the single orchestration point. Data-source skills (web
search, social lookups, semantic search, etc.) are the leaves. Enrich
decides which leaves to call based on tier. Every leaf is reusable — the
same web-search skill is invoked whether the trigger was a meeting or a
casual mention.

### Cron jobs — the autonomous engine

Without crons, the brain only grows when the user is actively engaging it.
With crons wired to call enrich, the brain compounds 24/7.

Recommended cadence for a creator/engineer setup:

**High frequency (every 10–30 minutes):**
- **Message monitor** — check key channels for unread items from important
  contacts. Call enrich on senders if their page is thin.
- **Feed radar** — scan RSS / reading-list / timeline feeds for items tagged
  or referencing tracked entities.

**Medium frequency (every 1–3 hours):**
- **Social radar** — scan mentions and engagement on public social. Call
  enrich on notable new accounts.
- **Heartbeat** — the omnibus check. Calendar lookahead, open-threads sweep,
  inbox scan. Post only if something needs attention.

**Daily:**
- **Morning briefing** — calendar + tasks + recent signals + brain state →
  one concise notification.
- **Zettel processor** — scan `human/zettel/` for new or updated zettels,
  compile them, queue archival candidates. (See `skills/zettel-processor/`.)
- **Meeting ingestion** — pull new meeting transcripts if any, create meeting
  pages, propagate to entity pages.

**Weekly:**
- **Brain lint** — full maintenance pass: contradictions, stale pages,
  orphans, missing cross-references, MECE filing violations, citation
  coverage. Post a report.
- **Enrichment sweep** — find pages last enriched 90+ days ago or with many
  `[No data yet]` sections. Queue for re-enrichment.

### Cron design rules

1. **Silent when nothing happens.** No "nothing to report" messages. Noisy
   crons get disabled. Produce output only when there's a real signal.
2. **Post to the channel that matches the signal.** Mixing signals across
   channels makes each channel less useful.
3. **Idempotent and checkpoint-aware.** Each cron tracks what it has
   processed (state file or DB row) so it doesn't redo work.
4. **Respect quiet hours.** Don't post at night unless genuinely urgent.
5. **Every ingest cron calls enrich.** Structural rule. A cron that processes
   input but doesn't enrich the entities it touches is a bug.
6. **Heavy work spawns sub-agents.** Keep the cron session lightweight; let
   sub-agents fan out the per-entity work.

### Ingest workflows

Each ingest workflow terminates in enrich calls. The canonical shapes:

**Meeting ingestion.** Pull transcript. Create `meetings/YYYY-MM-DD-slug.md`
with the agent's own analysis above the line (not a copy of the AI summary —
reframed through what the brain already knows about attendees and projects).
Call enrich for every attendee. Call enrich for every project, company, or
tool discussed. Extract action items to the task system. Commit.

**Email ingestion.** Classify the inbox. For each non-routine email, extract
the sender + any mentioned entities, call enrich. Note commitments and
follow-ups on the sender's page timeline.

**Social ingestion.** Capture public voice from accounts the user tracks —
beliefs, projects, what they amplify. Call enrich to feed into the tracked
entity's "What They Believe" and similar sections.

**Idea / media / link ingest.** User shares a URL, article, video, or book
reference. The ingest skill extracts the primary subject (the thing itself,
the person behind it, the concept it illustrates) and calls enrich on each,
then files the artifact in the matching category.

**Zettel processing.** Scan `human/zettel/`. Compile new and updated zettels
into the matching wiki category page. Surface archival candidates via the
maintenance channel for explicit human approval. Never write to `human/`.

**Manual mention.** When the user mentions an entity in conversation, that
comment is a first-party high-confidence signal. Capture it to the entity's
page immediately.

### Maintenance (lint) — what `maintain` checks weekly

- **Deduplication scan** — similar names, same email, same company across
  pages. Merge when confirmed.
- **Contradictions** — conflicting facts for the same field on the same
  entity. Flag with both citations; don't silently resolve.
- **Staleness** — State sections superseded by newer Timeline entries.
- **Orphans** — pages with no inbound links.
- **Open Threads** — items that appear resolved in recent timeline but
  weren't moved out of the Open Threads list.
- **Missing cross-references** — entity A mentions entity B but doesn't link
  to B's page.
- **Missing pages** — entities mentioned frequently with no page yet.
- **MECE filing violations** — pages in the wrong directory.
- **Unsourced claims** — high-value assertions (Beliefs, Assessments) without
  `[Source: ...]` citations.
- **Alias coverage** — name variants in recent inputs that aren't yet in any
  page's `aliases` frontmatter.

### Write hotspots and concurrency

Once cron jobs, ingest jobs, and sub-agents all touch the brain repo in
parallel, shared files (an index of pages, an append-only log) become merge-
conflict magnets.

- **Treat any index page as derived, not hand-maintained.** Rebuild it
  periodically by scanning the directory tree; don't update it in every
  ingest workflow.
- **Make logs append-safe.** Each entry is a self-contained line with a
  timestamp prefix; concurrent appends at EOL rarely conflict.
- **Commit in batches.** An ingest job updating 10 entity pages commits once
  at the end, not 10 times.
- **Pull before push.** With append-only logs and per-entity pages, rebases
  almost always auto-resolve.
- **Entity pages rarely conflict** — two workflows updating the same person's
  page at the same time is rare. The real conflict hotspots are shared
  files, which is why those should be append-only or derived.

### What distinguishes this from RAG

- **Cross-references are pre-built.** You don't need the LLM to discover
  that project X uses tool Y — that's already linked.
- **Contradictions are pre-flagged.** When new data conflicts with old data,
  it's resolved (or flagged) at ingest, not at query time.
- **The compilation is persistent.** Each source ingested makes the brain
  richer. Nothing is thrown away.
- **The structure is a prompt.** Empty sections (`[No data yet]`) tell the
  agent what to look for next time it encounters this entity.

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
- **Companion tools:** See also [Blender](../tools/blender.md), [cats-for-blender](../tools/cats-for-blender.md)

## Open Threads

- None currently

## See Also

- [Blender](../tools/blender.md) — the host application
- [Rig a character in Blender](../how-to/rig-a-character-in-blender.md) — process using this tool

## Sources

- [Obsidian import — example-tool](../sources/imports/2026-04-16-obsidian-import/pages/example-tool.md) — imported legacy page with accumulated notes and sub-tags
- [2026-02-04 rigging test](../human/zettel/2026-02-04-some-rigging-test.md) — first hands-on test (still active — not yet archival candidate)

---

## Timeline

- **[[2026-02-04]]** | [first hands-on rigging test](../human/zettel/2026-02-04-some-rigging-test.md) — First hands-on test of the rigging workflow with this plugin.
- **[[2026-04-16]]** | [Obsidian import](../sources/imports/2026-04-16-obsidian-import/pages/example-tool.md) — Imported legacy page with accumulated notes and sub-tags.
```

Note the link syntax: entity cross-references use markdown links; only the
date stubs `[[2026-02-04]]` / `[[2026-04-16]]` use Obsidian wikilinks so
clicking navigates to the daily note.

---

## Enforcement

1. The agent MUST read `K2_SCHEMA.md` (this file, at the fork repo root)
   before creating any new wiki page.
2. The agent MUST NOT write to, edit, move into, or delete from `human/` under
   any circumstance. `human/` is sacred.
3. The agent MUST NOT write to, move, edit, or delete any file under
   `sources/`. `sources/` is fully read-only. Moving a source page into a
   category folder is explicitly forbidden — compile a parallel wiki page
   that cites the source instead. The zettel archival move lands in
   `human/zettel/archive/`, NOT `sources/`, and requires explicit human
   approval via the maintenance messaging channel — the agent MUST NOT
   perform this move autonomously.
4. The agent MUST emit frontmatter per this spec on every wiki page it creates
   or updates. Missing required fields is a quality failure.
5. The agent MUST include a `## Sources` section in every wiki page body, with
   wikilinks to all source files that contributed to the page. `sources:` in
   frontmatter is NOT used (moved to body to avoid frontmatter bloat).
6. The agent MUST NOT trust existing tags, PARA fields, folder location, or
   archive status in imported sources. Read each source as fresh signal.
7. The agent MAY write to `inbox/` with discipline (flagged items needing
   human attention). The agent MUST NOT use inbox as a dumping ground for
   ambiguous output.
8. If a source page doesn't have a clear category, the compiled page goes in
   `inbox/` with a flag for human review. Do not guess.
9. User's original thinking goes in `originals/` with the user's exact
   phrasing as the slug and verbatim content capture — never sanitize or
   paraphrase. Authorship test: user generated the framework or a unique
   synthesis of someone else's? → `originals/`. World-authored concepts the
   user references? → `concepts/`. Product/build ideas? → `ideas/`. See the
   Disambiguation Rules section for the full boundary set. Upstream guide:
   `docs/guides/originals-folder.md`.

---

## Version History

- **k2-0.1.0** (2026-04-16) — Initial k2 schema. Extends base GBRAIN_RECOMMENDED_SCHEMA.md.
- **k2-0.2.0** (2026-04-16) — Sources moved from frontmatter to `## Sources` body section
  (avoids frontmatter bloat when a page cites many sources). Added
  `sources/promoted_zettel/` convention for 1:1 wholesale-promoted zettels.
- **k2-0.3.0** (2026-04-16) — Major restructure:
  - Added top-level `human/` zone (sacred, agent never writes/modifies/moves).
    New zettels go to `human/zettel/`.
  - Removed `sources/zettel/` and `sources/promoted_zettel/`. Replaced by
    `sources/human/archive/zettel/` (matured human content landing zone, gated by
    explicit human approval).
  - Zettel archival flow is now human-approved via maintenance messaging
    channel, not autonomous.
  - Inbox explicitly documented as shared agent/human zone (with agent
    discipline expected).
  - Originals/ absence explicitly documented in Enforcement rule 9.
- **k2-0.5.1** (2026-04-16) — File relocated from `docs/K2_SCHEMA.md` to
  repo-root `K2_SCHEMA.md`. Rationale: schema is the one doc Hermes must
  read on every session; hoisting it to the repo root removes `docs/` from
  Hermes's required-read set. `docs/` stays as upstream developer-facing
  reference material. No schema content changed — path only.

- **k2-0.5.0** (2026-04-16) — Restore `originals/` category per stock gbrain
  convention (`docs/guides/originals-folder.md`). Earlier removal in
  k2-0.3.0 conflated user's own thinking with world-authored concepts.
  `originals/` holds user-generated frameworks, hot takes, contrarian
  positions, and syntheses — captured in the user's exact phrasing.
  `concepts/` narrowed to world-authored frameworks the user references.
  Disambiguation rules added: originals-vs-concepts (authorship test),
  originals-vs-ideas (thing-vs-thought test), naming rule (vividness IS
  the concept, never sanitize). Enforcement rule 9 inverted from "no
  originals/" to "originals/ with verbatim capture + authorship test".

- **k2-0.4.0** (2026-04-16) — Three changes:
  - Archive destination relocated from `sources/human/archive/zettel/` to
    `human/zettel/archive/`. `sources/` is now strictly read-only for the
    agent, while archived zettels remain explicitly inside the human-owned
    zettel zone.
  - Link syntax clarified: agent-written pages use markdown links
    `[Name](../category/slug.md)` for entity cross-refs so gbrain's CLI
    `check-backlinks` extractor picks them up. `[[YYYY-MM-DD]]` wikilinks
    are reserved for date stubs (Obsidian daily-note navigation).
  - Operational pipeline chapter added inline so install agents reading only
    this file get the full enrichment model without chasing upstream.

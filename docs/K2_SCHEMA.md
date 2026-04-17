<!-- schema-version: k2-0.1.0 -->
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

---

## Operating Principles

### 1. Two tiers of human ownership: `human/` is sacred, `sources/` is reference.

**`human/` is SACRED.** Live human writing lives here. The agent NEVER writes
to `human/`, NEVER modifies files in `human/`, and NEVER moves files in or
out of `human/` except one narrow case (see Principle 5). If the agent needs
to record a derived fact, it goes in a compiled wiki page (people/, concepts/,
etc.) that CITES the human source — the human source itself is untouched.

**`sources/` is immutable reference material.** Imported legacy content (prior
note tools, Obsidian export), attachments, and archived human content live
here. The agent reads from `sources/` freely but only writes via one gated
path: `sources/human/archive/zettel/` receives matured human content approved for
archival (see Principle 5).

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
it done. Human content stays in human/ (or sources/human/archive/zettel/ once
explicitly archived). The agent's job is to compile parallel wiki pages that
cite the human sources.

### 5. Zettel processing and archival: human-approved only.

When a zettel in `human/zettel/` is processed by the zettel-processor skill:

1. The zettel-processor compiles the zettel's content into the appropriate
   category wiki page (concepts/, how-to/, ideas/, etc.).
2. The wiki page's `## Sources` section cites the zettel at its `human/zettel/`
   path.
3. **The zettel itself stays in `human/zettel/`.** Agent does NOT move it.
4. If the zettel has been wholesale-compiled (1:1 into a single wiki page) AND
   is stable (no recent edits), the zettel-processor marks it as an archival
   candidate and the maintenance skill surfaces a prompt to the human via the
   configured messaging channel.
5. **Only when the human explicitly approves** does the agent move the zettel:
   `human/zettel/foo.md` → `sources/human/archive/zettel/foo.md`. Any wiki pages that
   cited the old path update their `## Sources` wikilink to the new path.

Wikilinks pointing at the zettel by basename continue to resolve after the
move (Obsidian resolves by basename vault-wide).

**Partial-use zettels never become archival candidates.** If a zettel
contributes to multiple wiki pages as one source among many, or only partially
compiles (some content not yet captured), it stays in `human/zettel/`
indefinitely. No prompt fires.

**Updated zettels are re-processed.** The zettel-processor detects zettels that
have been modified since last run and re-compiles the affected wiki pages.
This is why the zettel itself must stay editable in `human/zettel/` — the
human may keep developing the idea.

**Dreaming and maintenance loops** actively scan `human/` to detect:
- New zettels needing initial compile
- Updated zettels needing re-compile
- Archival candidates (stable + wholesale compiled)
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
├── human/                — SACRED: human writing, agent NEVER writes or modifies
│   ├── zettel/           active atomic zettel destination (new writing lands here)
│   └── <free structure>  any way the human organizes their own writing
├── sources/              immutable reference material, read-only for agent
│   ├── assets/           image and file attachments
│   ├── imports/          legacy imports (dated snapshots from prior note tools)
│   │   └── YYYY-MM-DD-*-import/
│   └── human/archive/    matured human content approved for archival
│                          (only entry point for agent writes to sources/,
│                           gated by explicit human approval)
├── inbox/                shared triage zone (agent and human both write here;
│                          agent uses sparingly to avoid bloat)
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
- [[human/zettel/2026-02-04-some-rigging-test]] — first hands-on test of the rigging workflow (still active — not yet archival candidate)

---

## Timeline

- **[[2026-02-04]]** | [[human/zettel/2026-02-04-some-rigging-test]] — First hands-on test of the rigging workflow with this plugin.
- **[[2026-04-16]]** | [[sources/imports/2026-04-16-obsidian-import/pages/example-tool]] — Imported legacy page with accumulated notes and sub-tags.
```

---

## Enforcement

1. The agent MUST read `docs/K2_SCHEMA.md` before creating any new wiki page.
2. The agent MUST NOT write to, edit, move into, or delete from `human/` under
   any circumstance. `human/` is sacred.
3. The agent MUST NOT move, edit, or delete existing files under `sources/`.
   The only agent WRITE to `sources/` is adding new files via the zettel
   archival move (`human/zettel/foo.md` → `sources/human/archive/zettel/foo.md`)
   AND only after explicit human approval via the maintenance messaging
   channel. The agent MUST NOT perform this move autonomously. Moving a
   source page into a category folder is explicitly forbidden — compile a
   parallel wiki page that cites the source instead.
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
9. There is no `originals/` category. User's original thinking compiles into
   the K2 category matching its TYPE: concepts/ for frameworks, ideas/ for
   unexecuted possibilities, writing/ for long-form prose, personal/ for
   private reflection. Atomic thoughts that don't fit these stay in
   `human/zettel/` as ongoing zettels.

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

---
name: repo-architecture
version: 1.0.0
description: |
  Where new brain files go. Decision protocol for filing brain pages by primary
  subject, not by format or source. Reference for all brain-writing skills.
triggers:
  - "where does this go"
  - "filing rules"
  - "create new page"
  - "which directory"
tools:
  - search
  - get_page
  - list_pages
mutating: false
---

# Repo Architecture — Filing Rules

> **Authoritative schema:** See `docs/K2_SCHEMA.md` for the full category list,
> frontmatter spec, and disambiguation rules.
>
> **Filing rules:** See `skills/_brain-filing-rules.md` for source-preservation
> and citation rules.

## Contract

This skill guarantees:
- Every new wiki page is filed by primary subject (not format, not source)
- The decision protocol is followed for ambiguous cases
- Common misfiling patterns are caught
- `sources/` is never written to

## Phases

1. **Identify the primary subject.** What would you search for to find this page?
2. **Read the K2 schema.** `docs/K2_SCHEMA.md` Category Resolvers table.
3. **Walk the decision tree** (first match wins):
   - About a specific human → `people/{name-slug}.md`
   - About an organization → `companies/{name-slug}.md`
   - About a physical location → `places/{name-slug}.md`
   - Active build with progress → `projects/{slug}.md`
   - Unexecuted possibility → `ideas/{slug}.md`
   - Reusable mental model → `concepts/{slug}.md`
   - Step-by-step process or troubleshoot → `how-to/{slug}.md`
   - Named software/hardware in use → `tools/{slug}.md`
   - Film/TV/anime/manga/game/book/podcast/doc/music → `media/{slug}.md` (set `media-type`)
   - Specific meeting → `meetings/{slug}.md`
   - Decision record → `decisions/{slug}.md`
   - Domestic ops (recipes, home, car) → `household/{slug}.md` (set `household-type`)
   - Private reflection → `personal/{slug}.md`
   - Institutional workstream → `org/{slug}.md`
   - Long-form prose essay → `writing/{slug}.md`
   - Unclear → `inbox/{slug}.md` with flag for human review
4. **Cross-link.** Link from related categories and to related entities.
5. **Cite sources.** Add a `## Sources` section in the page body with wikilinks
   to every contributing source file (under `sources/` or `human/`). NOT in
   frontmatter.
6. **Check notability.** See `skills/conventions/quality.md` notability gate.

## Output Format

Advisory: "File this at `{type}/{slug}.md` because the primary subject is {reason}.
Cites sources: {list of source paths}."

## Anti-Patterns

- Filing by format ("it's a PDF so it goes in sources/")
- Filing by source channel ("it came from email so it goes in sources/")
- Writing to, modifying, or moving anything under `human/`
- Writing to or moving existing files under `sources/` (except zettel archival
  with explicit human approval — see `_brain-filing-rules.md`)
- Relocating a source page into a category folder — compile a parallel wiki
  page that cites the source instead
- Trusting imported frontmatter tags, PARA, or archive status as truth — read
  as evidence only
- Creating pages without checking if one already exists
- Guessing a category when no clear fit exists — use `inbox/` with a flag

## Category Mnemonic (for quick recall)

Subject-based, first match wins:

1. **Who** — people/, companies/, org/
2. **Where** — places/
3. **What's being built** — projects/ (active), ideas/ (not started)
4. **What you know** — concepts/ (theory), how-to/ (process), tools/ (products)
5. **What you consume** — media/
6. **What happens once** — meetings/, decisions/
7. **Life ops** — household/, personal/
8. **Publications** — writing/
9. **Fallbacks** — inbox/, archive/

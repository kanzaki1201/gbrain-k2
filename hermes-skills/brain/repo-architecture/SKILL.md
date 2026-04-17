---
name: repo-architecture
description: Where new brain files go. Decision protocol for filing brain pages by
  primary subject, not by format or source. Reference for all brain-writing skills.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - repo-architecture
    related_skills: []
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/repo-architecture/SKILL.md
    blueprint_sha256: bdd5a61476f4ae02f762e1662e1fd6f0c476f296178979e625aa1eee2767c210
    generated_from: gbrain-k2/skills
---

# Repo Architecture — Filing Rules — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `repo-architecture` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- where does this go
- filing rules
- create new page
- which directory
- Blueprint source: `/home/k/gbrain-k2/skills/repo-architecture/SKILL.md`
- This projection keeps the source doctrine while translating execution into Hermes-standard tools and `gbrain` CLI commands.

## Quick Reference
| Need | Hermes move |
|---|---|
| Run `gbrain` commands | `terminal` |
| Read source blueprints or repo docs | `read_file` |
| Search markdown and docs | `search_files` |
| Edit local markdown or config | `patch` / `write_file` |
| Delegate a larger workflow | `delegate_task` |
| Schedule recurring checks | `cronjob` |

## Procedure
1. Read `references/blueprint.md` when exact K2 wording matters, then follow the source workflow exactly.
2. Use Hermes-native tools for execution: run `gbrain ...` through `terminal`, inspect local markdown with `read_file` and `search_files`, and patch files with `patch` or `write_file` when the task needs repository edits.
3. Keep the blueprint as the authority for filing rules, quality bar, and chaining behavior. Translate source-only tool names into Hermes capabilities instead of assuming custom GBrain tools exist inside Hermes.

### Blueprint Contract

This skill guarantees:
- Every new wiki page is filed by primary subject (not format, not source)
- The decision protocol is followed for ambiguous cases
- Common misfiling patterns are caught
- `sources/` is never written to

### Blueprint Phases

1. **Identify the primary subject.** What would you search for to find this page?
2. **Read the K2 schema.** `~/gbrain-k2/K2_SCHEMA.md` Category Resolvers table.
3. **Walk the decision tree** (first match wins):
   - About a specific human → `people/{name-slug}.md`
   - About an organization → `companies/{name-slug}.md`
   - About a physical location → `places/{name-slug}.md`
   - Active build with progress → `projects/{slug}.md`
   - Unexecuted possibility → `ideas/{slug}.md`
   - User's own framework / hot take / synthesis / contrarian position (the
     authorship test: user generated it, or it's user's unique synthesis of
     someone else's work) → `originals/{user-exact-phrasing}.md`
   - Reusable mental model coined by someone else → `concepts/{slug}.md`
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
5. **Cite sources.** Add a `## Sources` section in the page body with markdown
   links to every contributing source file (under `sources/` or `human/`).
   Format: `[short title](../sources/.../file.md)`. NOT in frontmatter. NOT
   wikilinks — markdown links so gbrain's CLI link extractor picks them up.
6. **Check notability.** See `skills/conventions/quality.md` notability gate.

## Pitfalls
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
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
Advisory: "File this at `{type}/{slug}.md` because the primary subject is {reason}.
Cites sources: {list of source paths}."
```

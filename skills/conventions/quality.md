# Quality Convention

Cross-cutting quality rules for all brain-writing skills.

## Citations (MANDATORY)

Every fact written to a brain page must carry an inline footnote citation
using Obsidian's `^[...]` syntax. No `Source:` prefix — the `^[]` already
implies citation. Dates ALWAYS as `[[YYYY-MM-DD]]` wikilinks.

When the source is a brain page, use a markdown link so the citation is
navigable in Obsidian AND visible to the knowledge graph (provenance
edges are legitimate graph relationships):

- **Zettel:** `^[[zettel: title](../human/zettel/slug.md), [[YYYY-MM-DD]]]`
- **Meeting:** `^[[meeting title](../meetings/slug.md), [[YYYY-MM-DD]]]`
- **Web content:** `^[[publication](URL), [[YYYY-MM-DD]]]`
- **User's statements:** `^[User, Discord/Telegram thread, [[YYYY-MM-DD]]]`
- **Synthesis:** `^[compiled from [s1](../path.md), [s2](../path.md)]`
- **API enrichment:** `^[{provider} enrichment, [[YYYY-MM-DD]]]`
- **Inferred (no source):** `^[inferred]`

No `## Sources` section. The inline citations ARE the provenance trail.

### Source precedence (highest to lowest)

1. User's direct statements (highest authority)
2. Compiled truth (brain's synthesized understanding)
3. Timeline entries (raw evidence)
4. External sources (API enrichment, web search)

## Back-Linking (MANDATORY)

Every mention of a person or company WITH a brain page MUST create a back-link
FROM that entity's page TO the page mentioning them.

Format: `- **YYYY-MM-DD** | Referenced in [page title](path) -- context`

An unlinked mention is a broken brain.

## Notability Gate

Before creating a new brain page, check notability:

- **People:** Will you interact again? Relevant to work/interests?
- **Companies:** Relevant to work/investments/interests?
- **Concepts:** Reusable mental model? Worth referencing again?

When in doubt, DON'T create. A 400-follower person who tweeted once is not notable.

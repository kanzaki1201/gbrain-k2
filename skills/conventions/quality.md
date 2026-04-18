# Quality Convention

Cross-cutting quality rules for all brain-writing skills.

## Citations (MANDATORY)

Every fact written to a brain page must carry an inline footnote citation
using Obsidian's `^[...]` syntax. Citations should include markdown links
to source pages when a brain page exists for the source.

- **User's statements:** `^[User, YYYY-MM-DD]`
- **Meeting data:** `^[[Meeting title](../meetings/slug.md), YYYY-MM-DD]`
- **Email/message:** `^[email from [name](../people/slug.md) re: {subject}, YYYY-MM-DD]`
- **Web content:** `^[[publication](URL), YYYY-MM-DD]`
- **Social media:** `^[[@handle](URL), YYYY-MM-DD]`
- **Synthesis:** `^[compiled from [source1](../path.md), [source2](../path.md)]`
- **API enrichment:** `^[{provider} enrichment, YYYY-MM-DD]`

Links inside citations feed the knowledge graph and allow tracing provenance
by clicking through. When no brain page exists for a source, use plain text.

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

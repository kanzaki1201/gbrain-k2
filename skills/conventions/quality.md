# Quality Convention

Cross-cutting quality rules for all brain-writing skills.

## Citations (MANDATORY)

Every fact written to a brain page must carry an inline footnote citation
using Obsidian's `^[...]` syntax. Citations are plain text — do NOT use
markdown links inside citations, as `gbrain extract links` would create
spurious graph edges that pollute the knowledge graph.

- **User's statements:** `^[Source: User, YYYY-MM-DD]`
- **Meeting data:** `^[Source: Meeting "title", YYYY-MM-DD]`
- **Email/message:** `^[Source: email from name re: subject, YYYY-MM-DD]`
- **Web content:** `^[Source: publication, URL, YYYY-MM-DD]`
- **Social media:** `^[Source: @handle, YYYY-MM-DD]`
- **Synthesis:** `^[Source: compiled from source1, source2]`
- **API enrichment:** `^[Source: {provider} enrichment, YYYY-MM-DD]`

Semantic cross-references belong in the body text and `## Sources` section,
where they feed the knowledge graph. Citations are provenance metadata only.

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

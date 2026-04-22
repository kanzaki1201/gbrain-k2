# search

Keyword and fuzzy search over entity identity fields — `title`,
`aliases`, `tags`. Returns ranked, scored summary rows. Read-only.

Targets the "do I already know this entity?" surface. For semantic
retrieval over `compiled_truth` and timeline body text, use `query`.

## Signature

```ts
search(
  ctx: OperationContext,
  input: {
    q: string;               // non-empty query string
    type?: EntityType;       // optional category filter
    tag?: string;            // optional tag filter
    min_score?: number;      // optional score threshold, 0..1; default = no threshold
    limit?: number;          // default = 20; 0 = count-only
    offset?: number;         // default = 0
  },
): Promise<{
  items: SearchResult[];
  total: number;             // items matching filters + threshold, pre-pagination
  offset: number;
  limit: number;             // echoed; default-filled with 20 if omitted
}>

type SearchResult = {
  slug: string;              // stable identifier
  type: EntityType;
  title: string;
  tags: string[];            // sorted, case-insensitive
  aliases: string[];         // sorted, case-insensitive
  score: number;             // 0..1 normalized; higher = better match
  matched_field: 'title' | 'alias' | 'tag' | 'mixed';
};
```

Return envelope matches `list_entities` for cross-op consistency.
`SearchResult` is close to `EntitySummary` but carries `score` and
`matched_field`, and omits `struct_hash` + timestamps (callers that
need them chain `get_entity`).

## CRUD class

**R** on `entities` (zero or more rows), with engine-specific index
access (trigram, full-text, or equivalent). No joins.

Reads: `entities`.
Does NOT touch any other table; no writes.

## Preconditions

- `q` is a non-empty string after trimming whitespace. Empty or
  whitespace-only errors `invalid_query` — callers wanting "match
  everything in type X" use `list_entities`.
- `type`, if provided, is a member of `EntityType`. Same rule as
  `list_entities`.
- `tag`, if provided, is lowercase, non-empty, whitespace-trimmed.
- `min_score`, if provided, is a number in `[0, 1]`. Outside that
  range errors `invalid_min_score`.
- `limit`, if provided, is a non-negative integer. `limit: 0`
  returns zero items plus accurate `total` (count-only idiom
  inherited from `list_entities`).
- `offset`, if provided, is a non-negative integer.

## Postconditions

- Returns an envelope:
  - `items`: `SearchResult` records passing all filters, sorted by
    `score` descending; ties broken by `slug` ascending; sliced to
    `[offset, offset + limit)`.
  - `total`: count of rows passing all filters + score threshold,
    before pagination.
- No table is mutated. Repeat calls with the same args return
  byte-equivalent envelopes subject to concurrent writers and
  engine-level index refreshes.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_query` | `q` is empty after whitespace trim. | Caller bug — fall back to `list_entities` if a blank match was intended. |
| `invalid_type` | `type` provided and not a member of `EntityType`. | Use the enum. |
| `invalid_tag` | `tag` provided and empty, not-lowercase, or contains whitespace. | Normalize upstream. |
| `invalid_min_score` | `min_score` outside `[0, 1]`. | Normalize; thresholds are fractions, not raw engine scores. |
| `invalid_limit` | `limit` provided and negative (or non-integer). | Caller bug. |
| `invalid_offset` | `offset` provided and negative (or non-integer). | Caller bug. |

Runtime DB errors surface as `OperationError` with engine
diagnostics intact; not pre-enumerated.

No `no_matches` error. `items: []` with `total: 0` is a valid result.

## Matching semantics

The op searches three identity surfaces with descending-priority
ranking:

1. **Exact case-insensitive match** on `title` or any `alias` — top
   score tier (~1.0).
2. **Prefix match** on `title` or any `alias` — second tier.
3. **Fuzzy / trigram / tolerated-typo** on `title` and `aliases` —
   third tier, still scored in proportion to similarity.
4. **Tag substring match** — weakest, because tags are coarse
   category markers, not names. Boosts when combined with a title
   signal.

The op does NOT search `compiled_truth`, `frontmatter`, or any
other unstructured body text. For those:

- Content-body matches belong to `query` (hybrid vector+keyword
  over `content_chunks`).
- Frontmatter field lookups are unsupported — K2_DESIGN.md does not
  mandate full-text indexing over freeform frontmatter.

The engine implementation chooses the exact algorithm (pg_trgm,
`ts_rank`, SQLite FTS, etc.). The spec fixes the surface (three
identity fields) and the output shape; algorithm selection is an
engine-layer detail.

## Score semantics

`score` is normalized to `[0, 1]`:

- `1.0` = exact case-insensitive match on a primary field (title or
  alias). Ties at the top tier are broken by `slug` ascending.
- `>= 0.7` = strong prefix or close fuzzy match. COMPILE phase 4
  treats this tier as "strong candidate, likely dedup match" —
  pairs with `get_entity` confirmation.
- `>= 0.3` = weak match; COMPILE treats as "worth investigating,
  maybe merge into candidate pool with `query`."
- `< 0.3` = noise tier. Callers typically filter via `min_score`.

These tier boundaries are a caller-side convention, not a contract.
The op guarantees monotonicity (higher score = better match per the
engine's ranking function) and cross-engine normalization; callers
pick thresholds.

Engines MUST normalize their native score to `[0, 1]` before
returning. PGLite trigram similarity is already `[0, 1]`; Postgres
`ts_rank` must be rescaled (typically via max-normalization per
query). The op layer is responsible; callers never see raw engine
scores.

## `matched_field` semantics

`matched_field` tells the caller which surface drove the match:

- `'title'` — match was primarily on title.
- `'alias'` — match was primarily on an alias.
- `'tag'` — tag substring match, no title/alias contribution.
- `'mixed'` — multiple fields contributed; common for queries that
  resemble both a title and a tag.

This is a debugging / UX hint, not a contract. COMPILE's dedup gate
uses it to explain match choice in logs ("matched on alias 'Al' for
candidate Alice"); ASK may show it in existence-check responses.
The engine's exact field-attribution rule is flexible as long as
the answer is one of the four strings.

## Filter composition

All filters AND-combine:

- `q='al'`, `type='people'` → people whose identity fields match
  'al'.
- `q='alice'`, `tag='friend'` → entities tagged 'friend' whose
  identity fields match 'alice'.
- `q='*'`, `type='projects'` is not a thing — `search` does not
  accept a wildcard; use `list_entities` with `type='projects'`.

Score threshold is applied AFTER filters: a result passing `type`
and `tag` but scoring below `min_score` is excluded from both
`items` and `total`.

## MCP exposure

This op is **MCP-exposed**. Read-only, returns only summary fields
with no `compiled_truth` or `frontmatter` payload. The
frontmatter-redaction concern from `get_entity` does not apply.

Deliberate exposure choice: ASK's lookup phase runs through this op
over MCP, and COMPILE's dedup path runs it locally. The same op
serves both trust levels because the exposed fields are already
visible to anyone rendering the wiki.

## Pagination

Same offset+limit semantics as `list_entities`. Default `limit: 20`
because search results that matter are concentrated at the top;
callers that want deep pagination signal they want it.

Pagination stability under concurrent writes is weaker than
`list_entities`: a write that changes a matching row's score may
reorder page boundaries. Callers doing paged dedup should snapshot
`items` from page 1 before iterating.

## Idempotency

Trivially idempotent — read-only. Repeat calls return byte-
equivalent data subject to concurrent writers and engine index
refresh.

## Trust boundary

Read-only; safe under `ctx.remote === true`.

## Callers

- **ASK §Phase 2 Lookup** — slug is unknown; `search` narrows to a
  ranked candidate set, then `get_entity` confirms.
- **ASK §Phase 2 Existence check** — COMPILE's internal dedup query
  to ASK. `search` provides the keyword+alias signal; ASK pairs
  with `list_entities` type filter and optionally `query` for the
  fuzzy signal.
- **COMPILE §Phase 4 notability / dedup gate** — "check for an
  existing one by title, slug, alias, handle." Calls `search` with
  candidate's title/aliases, inspects top-scoring results, then
  uses `get_entity` to confirm the best match.
- **MAINTAIN §Check duplicate candidates** — pairwise similarity
  scoring. MAINTAIN issues `search` calls across entity titles to
  surface near-duplicates; pairs with `query` for content-level
  overlap.

No RECOVER caller. RECOVER works from parsed wiki files, not from
existing DB state.

## Notes

- **No expansion, no multi-query rephrasing.** Single query string,
  single pass. Multi-query expansion
  (`K2_DESIGN.md` §Search — *Optional multi-query expansion*)
  belongs to `query` (hybrid search), not here. Callers that want
  multiple rephrasings issue N `search` calls and merge client-side.
- **No `compiled_truth` match.** Body-text search is `query`.
  Keeping the two operations orthogonal avoids rank fusion
  decisions inside the primitive.
- **No source-path filter, no struct_hash filter.** Orthogonal to
  the "do I know this entity?" surface.
- **Engines are free to pick their algorithm** as long as the
  output score is normalized. A SQLite deployment using FTS5 with
  Porter stemming and a Postgres deployment using pg_trgm should
  both produce the same `score ∈ [0, 1]` and the same
  `matched_field` classification for a given query.
- **Sorting and case-insensitive normalization on `tags`/`aliases`
  are normative** — same rule as `list_entities` and `get_entity`.
- **`SearchResult` is distinct from `EntitySummary`** even though
  fields overlap. Keeping the types separate avoids callers
  accidentally relying on `score` being present in non-search
  contexts.

## Edge cases

- **Query string matches many rows with low score.** No implicit
  cap beyond `limit`. Set `min_score: 0.3` to prune noise.
- **Exact match on one entity, fuzzy matches on many.** The exact
  match scores 1.0; fuzzy matches score lower; caller sorts by
  score and picks. Top result is unambiguous.
- **Query string is a slug.** Matched as a title/alias string
  (not a canonical slug lookup). If the caller knows the slug
  exactly, `get_entity` is cheaper and unambiguous.
- **Query string with special characters** (e.g., punctuation,
  emoji). The engine tokenizes per its algorithm; results may vary
  across engines. This is an engine-layer discrepancy worth
  flagging in cross-engine tests but not a spec violation.
- **Query string much longer than any title.** Treated as a
  multi-token query. Useful for "I heard someone say something
  like X; is there an entity?" The engine's tokenization decides
  whether each token contributes.
- **Entity with `compiled_truth` that would match but no
  title/alias/tag match.** NOT returned — this op does not search
  the body. Use `query` for content hits.
- **Empty vault.** `items: []`, `total: 0`. Valid.
- **Filter combination that no entity matches.** Same as above.

## Performance considerations

- Keyword/trigram indexes are typically built per-engine on
  `entities.title` and `entities.aliases`. First-call cold start
  may be slow; subsequent queries reuse the index.
- `tag` filtering against `entities.tags` (array column) uses a
  GIN index in Postgres or a JSON-ish search in PGLite. Both are
  fast for the typical O(low thousands) entity count in a K2 brain.
- High-cardinality queries (common English words) may return many
  low-score matches; always pass `min_score` for production use.

## Open questions

- **Normalization formula for `ts_rank`-style scores.**
  Max-normalization per query produces unstable scores across
  queries (a score of `0.9` for query A may not be comparable to
  `0.9` for query B). The op commits to `[0, 1]` per-query
  normalization, not cross-query comparability. Callers that want
  cross-query thresholds need a different (not-yet-spec'd) op.
- **Alias vs. title weight ratio.** Currently treated as equal top-
  tier. If brand-style entities (projects with formal names and
  many aliases) end up dominating people-style entities (one title,
  few aliases), re-weight. Engine-internal decision.
- **Multi-query expansion at the op layer.** Under the current
  spec, callers issue multiple `search` calls. A future
  `search_many({ qs: string[] })` could dedupe + fuse inside the
  op. Additive; not in scope today.
- **Language / locale handling.** Tokenization, stemming, and
  diacritic folding are engine-specific. K2 does not commit to a
  locale model. If `people` pages include non-Latin-script titles,
  engine behavior may diverge. Worth cross-engine test coverage
  when Phase 3 test vault lands.

Inherited:

- **Canonical slug format evolution** — doesn't directly affect
  this op (no slug validation), but callers chaining `get_entity`
  must stay consistent.
- **Cross-engine collation differences** — same as
  `list_entities` §Open questions.

# query

Hybrid search (vector similarity + keyword) over `content_chunks`,
fused via Reciprocal Rank Fusion. Returns ranked chunk snippets
scoped to a single query string. Read-only.

Targets the "what does the brain know about this topic?" surface.
For identity-field matching (title/alias/tag), use `search`.

## Signature

```ts
query(
  ctx: OperationContext,
  input: {
    q: string;                      // non-empty natural-language query
    type?: EntityType;              // filter: owning entity type
    tag?: string;                   // filter: owning entity tag
    chunk_source?: ChunkSource;     // filter: 'compiled_truth' | 'timeline'
    min_score?: number;             // [0, 1]; default = no threshold
    limit?: number;                 // default = 10
    offset?: number;                // default = 0
  },
): Promise<{
  items: QueryResult[];
  total: number;                    // rows passing filters + threshold, pre-pagination
  offset: number;
  limit: number;
}>

type ChunkSource = 'compiled_truth' | 'timeline';

type QueryResult = {
  entity_slug: string;              // owning entity
  entity_title: string;             // convenience; avoid roundtrip for snippet UIs
  entity_type: EntityType;
  chunk_text: string;               // the matched chunk body, verbatim
  chunk_source: ChunkSource;        // where in the entity this text came from
  score: number;                    // fused RRF score, normalized 0..1
  vector_score: number | null;      // contribution from vector similarity; null if no vector hit
  keyword_score: number | null;     // contribution from keyword ranking; null if no keyword hit
};
```

Envelope shape mirrors `search` / `list_entities`.

## CRUD class

**R** on `content_chunks`, joined to `entities` for metadata.

Reads: `content_chunks`, `entities`. No other tables, no writes.
No embedding-provider call — this op consumes pre-computed
embeddings produced by `compile_embed`.

## Preconditions

- `q` is non-empty after whitespace trimming. Empty or
  whitespace-only errors `invalid_query` — no "give me everything"
  mode.
- `type`, if provided, is a member of `EntityType`.
- `tag`, if provided, is lowercase, non-empty, whitespace-trimmed.
- `chunk_source`, if provided, is exactly `'compiled_truth'` or
  `'timeline'`. Other strings error `invalid_chunk_source`.
- `min_score`, if provided, is in `[0, 1]`. Outside errors
  `invalid_min_score`.
- `limit`, if provided, is a non-negative integer. `0` is valid
  (count-only idiom).
- `offset`, if provided, is a non-negative integer.

## Postconditions

- Returns an envelope:
  - `items`: `QueryResult` records passing every filter and scoring
    at or above `min_score`, sorted by `score` descending; ties
    broken by `entity_slug` ascending, then by `chunk_text`
    byte-compare ascending for deterministic output; sliced to
    `[offset, offset + limit)`.
  - `total`: count of all rows passing filters + threshold, before
    pagination.
- No table is mutated. Repeat calls with the same args return
  byte-equivalent envelopes subject to concurrent writers and
  `compile_embed` runs.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_query` | `q` empty after whitespace trim. | Caller bug — use `search` or `list_entities` for non-semantic enumeration. |
| `invalid_type` | `type` not in `EntityType`. | Use the enum. |
| `invalid_tag` | `tag` empty, non-lowercase, or has whitespace. | Normalize. |
| `invalid_chunk_source` | `chunk_source` provided and not one of the two allowed strings. | Use the enum. |
| `invalid_min_score` | `min_score` outside `[0, 1]`. | Normalize thresholds. |
| `invalid_limit` | `limit` negative or non-integer. | Caller bug. |
| `invalid_offset` | `offset` negative or non-integer. | Caller bug. |
| `embedding_provider_unavailable` | Vector-side encoding fails for `q` and no keyword fallback produces results. | Surface as engine-layer failure; caller may retry. |

Runtime DB errors surface as `OperationError` with engine
diagnostics intact; not pre-enumerated here.

No `no_matches` error. `items: []` with `total: 0` is valid.

## Hybrid retrieval semantics

The op runs two retrieval passes over `content_chunks` and fuses:

1. **Vector pass.** Encode `q` via the configured embedding
   provider (per `K2_DESIGN.md` §Search — embedding cosine
   distance). Rank chunks by similarity to the query embedding.
2. **Keyword pass.** Run the engine's keyword / trigram match
   against `chunk_text`. Rank by the engine's native text score.
3. **Fuse via Reciprocal Rank Fusion.**
   `rrf_score(chunk) = sum_over_passes(1 / (k + rank_in_pass))`
   with `k` fixed per engine (typically 60). Chunks appearing in
   only one pass get contributions from that pass only.
4. **Normalize.** Scale `rrf_score` to `[0, 1]` per-query so the
   top result is `1.0`. Same per-query normalization rationale as
   `search` §Score semantics.

The `vector_score` and `keyword_score` fields expose the
per-pass contribution (normalized to each pass's top value)
for callers that want to debug or re-rank. Callers that just
want the fused answer use `score`.

A chunk hit by only the vector pass has `keyword_score: null`,
not `0`. Null distinguishes "this pass did not surface this row"
from "this pass surfaced it with zero relevance." Useful for the
ASK debugging path.

## `chunk_source` semantics

`content_chunks.chunk_source` is a categorical marker for which
part of the entity the text came from:

- `'compiled_truth'` — a chunk of the entity's `compiled_truth`
  body text.
- `'timeline'` — a concatenation or slice of the entity's
  `timeline_entries` text (summary + detail).

This is the same value stored by `compile_embed`. Filter by
`chunk_source` when the caller's intent is narrower:

- ASK Temporal fallback — `chunk_source='timeline'` to bias
  toward dated evidence.
- ASK Conceptual default — no filter; both surfaces can answer.
- COMPILE phase 4 dedup — no filter; any overlap in content
  signals a possible dupe.

Future `chunk_source` values (e.g., `'source_file'` when raw
embedding lands — `K2_DESIGN.md` §Search reach — *Future
raw-embedding is additive*) are not yet valid inputs.
Engines that find such values in storage SHOULD still return
them in results (for forward compatibility with caller-side
filtering), but the filter enum stays closed until the design
lands.

## Score semantics

`score` is `0..1` normalized per-query, higher = better fused
match. Same tier conventions as `search`:

- `1.0` — top match for this query.
- `>= 0.7` — strong match; ASK's chunk-first discipline relies
  on this tier.
- `>= 0.3` — weak-but-present; useful for broad-recall retrieval
  (COMPILE dedup's "worth checking" pool).
- `< 0.3` — noise tier.

Tier boundaries are caller-side conventions, not contract. The
op guarantees monotonicity (higher RRF score = higher `score`)
and per-query `[0, 1]` normalization.

The op does NOT guarantee cross-query score comparability —
score `0.8` for query A is not the same ranking signal as `0.8`
for query B. Multi-query expansion is the caller's concern; see
§Notes.

## Filter composition

All filters AND-combine:

- `q='parenting strategies'`, `type='people'` → chunks about
  parenting strategies, scoped to chunks from people entities.
- `q='Alice'`, `chunk_source='timeline'` → timeline-sourced
  chunks mentioning Alice.
- `q='Alice'`, `tag='family'`, `chunk_source='compiled_truth'`
  → compiled-truth chunks mentioning Alice, from entities
  tagged `family`.

Filters are applied before the score threshold: a chunk that
would have passed `min_score` but fails a filter is excluded
from both `items` and `total`.

## MCP exposure

This op is **MCP-exposed**. Chunks are derived from
`compiled_truth` and timeline text — already surfaces that render
into wiki files visible to agents. No new sensitivity axis beyond
what `get_entity` flagged.

ASK's Conceptual retrieval path runs this op over MCP. COMPILE's
dedup fallback and MAINTAIN's duplicate detection call it
locally.

## Pagination

Same offset+limit semantics as `search`. Default `limit: 10` —
chunks are substantive content (typically hundreds of tokens
each), so the reasonable working-set size is smaller than
`list_entities`'s 20 or an unbounded default.

Stability under concurrent writes is weaker than
`list_entities` (slug-sort is stable; score-sort is not).
A concurrent `compile_embed` run can shift chunk scores and
reorder pages. Callers doing multi-page iteration should
snapshot early results.

## Idempotency

Trivially idempotent — read-only. Repeat calls return
byte-equivalent envelopes subject to concurrent writers and
engine index state.

Note the provider dependency: if the embedding provider is
deterministic for the same input, vector-pass results are
reproducible. If it is not (rare — most providers are
deterministic at inference time), vector scores may vary
slightly across calls. The op does not compensate; engine
consistency is an engine concern.

## Trust boundary

Read-only; safe under `ctx.remote === true`.

## Callers

- **ASK §Phase 2 Conceptual** — canonical caller. Returns
  ranked chunks that ASK §Phase 3 reads first, then escalates
  to `get_entity` when the chunk confirms relevance but the
  full entity body is needed.
- **COMPILE §Phase 4 dedup gate** — hybrid-search fallback
  when keyword `search` returns nothing useful. `compile.md`
  §Dependencies — *`query` — hybrid search for the dedup gate
  when keyword search returns nothing useful*. Pairs with
  `search` and `get_entity` confirmation.
- **MAINTAIN §Check duplicate candidates** — "hybrid-search
  fallback for duplicate signals when keyword alone returns
  nothing useful" per `maintain.md` §CLI ops used.

No RECOVER caller. RECOVER parses the wiki rather than
querying the DB; its writes go through `compile_embed`.

## Notes

- **Single query string per call.** Multi-query expansion
  (paraphrases, alternative phrasings) lives OUTSIDE this op.
  Callers generate expansions via whatever mechanism they
  choose (the existing codebase uses Haiku via
  `src/core/search/expansion.ts`) and issue multiple `query`
  calls, merging results client-side with their own fusion rule.
  See §Open questions for the "bake expansion into the op"
  alternative.
- **No raw-zone search.** `content_chunks` covers wiki-layer
  content only — raw files are NOT embedded per K2_DESIGN.md
  §Search reach. If the brain fails to answer a conceptual
  question, ASK's fallback is raw-zone grep (external tool),
  not this op with a different parameter.
- **No `compile_embed` trigger.** The op consumes existing
  chunks. If no chunks exist for an entity (freshly created,
  not yet embedded), that entity's content is invisible to
  `query` until the next `compile_embed` run. This is a feature,
  not a bug: embedding is explicitly phase-8 in COMPILE.
- **Vector-only fallback is NOT exposed.** The op always runs
  hybrid. Callers wanting pure vector or pure keyword search
  use the respective component scores to filter client-side.
  Adding a `retrieval_mode` param would bloat the primitive;
  callers have everything they need in the return fields.
- **Engines are free to choose their embedding provider** as
  long as dimensions match the stored vector column. Cross-
  engine score comparability is not guaranteed — a chunk
  scored `0.85` on a Postgres+pgvector deployment may score
  `0.82` on PGLite+wasm-embeddings. Within one deployment the
  score is stable.
- **`entity_title` is a denormalized convenience.** Exists
  purely to avoid a roundtrip for snippet UIs. If the title
  changes between indexing and query, `entity_title` reflects
  the current title (it comes from the join, not from the
  chunk's stored metadata).

## Edge cases

- **No chunks exist in the DB.** Empty vault, or pre-embed
  state. `items: []`, `total: 0`. Valid.
- **Query tokenizes to nothing.** Engine-specific (stop words
  removed, etc.). The op returns `items: []` — does NOT error.
  Callers that expected hits should log the raw query + token
  output and consider rephrasing.
- **Query hits zero vector matches but many keyword matches.**
  Valid hybrid result; `vector_score: null` on every item.
  The RRF score is computed from keyword rank alone.
- **Query hits zero keyword matches but many vector matches.**
  Symmetric — `keyword_score: null` everywhere.
- **Query longer than the embedding model's max tokens.**
  Engine truncates per its provider's rule, then encodes.
  No error surfaces unless encoding itself fails.
- **Entity had chunks but was just deleted.** Depending on
  engine isolation, the join may still see stale chunks until
  the cascade completes, producing items pointing at a slug
  that `get_entity` returns null for. Caller should tolerate
  this race (same pattern as `get_links` §FK-integrity
  discussion).
- **Duplicate chunks.** The schema does not prevent identical
  `chunk_text` rows for the same entity. If both appear, both
  are returned; the caller dedupes on `(entity_slug,
  chunk_text)` if needed.

## Performance considerations

- Vector pass requires an embedding encoding for `q`. Providers
  typically round-trip in 50–300ms; cache per-process if the
  caller issues repeated queries.
- Keyword pass uses the engine's index over `chunk_text`
  (trigram GIN in Postgres, fallback in PGLite). Fast for the
  typical chunk count (O(low-millions) worst case).
- RRF fusion is in-memory once both passes return their top-K.
  `k_top` for each pass is an engine detail; typically 50–200.
  Users don't tune it.
- Default `limit: 10` keeps round-trips thin for ASK's
  snippet-first consumption.

## Open questions

- **Baking multi-query expansion into the op.** The alternative
  design (`extra_queries?: string[]`) would let the op fuse
  expansions internally via RRF across all N queries' pass
  outputs, producing a single ranked list without client-side
  merge. Pros: less caller orchestration; cleaner semantics for
  cross-query fusion. Cons: couples the op to whatever generated
  the expansions. Currently out of scope; evaluate after ASK's
  expansion path runs at scale.
- **`k` parameter for RRF.** Fixed per engine today. If tuning
  becomes a real operational need (e.g., for a specialty K2
  vertical), expose `k?: number`. Additive.
- **Cross-query score normalization.** Same limitation as
  `search`. Callers cannot threshold "below 0.5" meaningfully
  across different `q` strings. A stable normalization
  (e.g., against a global reference distribution) is research-
  grade.
- **Embedding-provider drift.** If the provider changes (model
  swap, version upgrade), existing chunks' stored vectors become
  incompatible with newly-encoded queries. Tracked in
  `specs/skills/recover.md` §Open questions — *Re-embedding
  determinism* — and in `compile_embed` (to be spec'd) which
  will own the backfill mechanism.

Inherited:

- **Canonical slug format evolution** — not a direct concern
  here; `entity_slug` comes from the join.
- **Cross-engine collation differences** — `list_entities`
  §Open questions. Same mitigation (codepoint sort on tiebreak).
- **Transaction boundaries under concurrent writes** —
  `compile.md` §Open questions. Determines how "query during a
  compile run" sees mid-run state.

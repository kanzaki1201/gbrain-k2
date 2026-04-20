# ASK

Answer questions from the brain, with citations, never mutating anything.

## Layer reach

| Layer    | Access |
|----------|--------|
| Raw zone | —      |
| DB       | R      |
| Wiki     | R      |

**Writes:** none.
**Reads:** `entities`, `links`, `timeline_entries`, `sources`, `entity_sources`,
`content_chunks` (via CLI ops); rendered wiki markdown files when a chunk is
insufficient.
**Does NOT touch:** raw zone source files (`human/`, `sources/`), and any
database table in a write mode. ASK is read-only across all layers.

## Contract

Invariants ASK guarantees to every caller (user-facing agent, COMPILE
internal dedup check, any future consumer):

1. **Read-only everywhere.** ASK never issues a write op to DB or vault, and
   never creates or modifies a file in any zone. This is load-bearing: COMPILE
   is the one-writer, and ASK must be safe to invoke from inside COMPILE
   without creating write cycles. The read-only invariant is what makes that
   safe.
2. **Search reach = wiki layer only.** ASK's search surface is `entities`
   rows plus `content_chunks`, where chunks cover `compiled_truth` and
   timeline text only. Raw zone source files are NOT embedded and are NOT
   full-text searchable through ASK. Source files appear only as provenance
   on citations, resolved via `entity_sources → sources.path`. If the wiki
   layer cannot answer a question, ASK declares the gap and recommends
   raw-zone grep — which is a separate tool outside ASK's scope. Future
   raw-embedding is additive (a new `chunk_source` value in `content_chunks`)
   and deferred until the need is proven.
3. **No hallucination.** Every claim in an answer traces to a specific brain
   source — an entity slug plus a section (compiled_truth or a dated timeline
   entry). When the brain has no coverage, ASK says so explicitly. General
   knowledge is never used to paper over a gap.
4. **Source precedence is respected.** When evidence disagrees, ASK ranks:
   1. User's direct statement at runtime (highest).
   2. `compiled_truth` on the relevant entity.
   3. `timeline_entries` (raw evidence).
   4. External sources — web, API — lowest, and preferably not used.
5. **Conflicts preserved, never silently resolved.** When two brain sources
   disagree, ASK cites both sides and states that they conflict. This mirrors
   COMPILE's conflict rule: the synthesis records contradictions, it does
   not pick winners.
6. **Citations target entity slugs, not raw paths.** A citation points at an
   entity (and optionally a section within it). Underlying source provenance
   is surfaced through the entity's own `^[...]` footnotes, already materialized
   at compile time.
7. **Gaps are explicit.** Absence of search hits is reported as a gap, never
   treated as evidence that the fact is false.

## Dependencies

### CLI ops used

Read-side ops only. Pulled from the CLI-operations-per-primitive table in
K2_DESIGN.md; ASK never references a write op.

- `search` — keyword + fuzzy search over `entities` (title, aliases, tags).
- `query` — hybrid search (vector + keyword + RRF) over `content_chunks`.
- `get_entity` — fetch a single entity by slug, including `compiled_truth`.
- `list_entities` — enumerate entities, filterable by type/tag/other metadata.
- `get_links` — outbound/inbound typed edges for a given entity.
- `get_graph` — multi-hop traversal over `links` from a seed entity.
- `get_timeline` — fetch `timeline_entries` for an entity, optionally bounded
  by date.

If a caller's intent cannot be served by these ops, ASK flags it in the
answer rather than inventing a new op. Proposals for new ops are tracked in
Open questions, not materialized here.

### Other skills called

ASK calls no other skill. ASK is a leaf in the skill graph — this is
deliberate, and is what lets COMPILE invoke ASK for dedup without cycles.

### Callers

- User-facing agent at any time (the common path).
- COMPILE, internally, during extraction: before creating a new entity,
  COMPILE asks "does this entity already exist under a different name?"
  The input is a structured existence-check (name + likely type + any known
  aliases or handles), not a natural-language question. The response shape
  for this call is structured (existence flag + ranked candidate slugs +
  confidence signal) rather than prose. Exact shape is an Open question.

## Phases

Every invocation moves through these five phases in order. Phases 2 and 3
may iterate if early results are thin.

1. **Decompose.** Classify intent to pick retrieval strategy:
   - **Lookup** — "what do we know about X?" → direct slug or title match.
   - **Relational** — "who knows X?", "what links A and B?" → graph ops.
   - **Temporal** — "what happened on/after DATE?", "when did X?" → timeline.
   - **Conceptual** — "what's the idea behind X?" → semantic chunks.
   - **Existence check** — internal-only, from COMPILE: "does this entity
     already exist?" → keyword + alias + fuzzy search, returning candidates.

   Input: the natural-language question, or a structured existence-check
   payload. Output: an intent label plus a retrieval plan (which ops to call,
   in what order).

2. **Retrieve.** Call CLI ops per intent. Canonical mapping:
   - Lookup → `get_entity` (if the slug is known) or `search` then `get_entity`.
   - Relational → `get_links` for one-hop, `get_graph` for multi-hop.
   - Temporal → `get_timeline` scoped by entity and date range.
   - Conceptual → `query` (hybrid) to pull ranked chunks.
   - Existence check → `search` + `list_entities` over aliases/type filters.

   No state changes. Results stay in memory for the next phase.

3. **Read.** Chunks first, full entities only when chunks don't suffice.
   Specifically:
   - Read the chunk snippets returned by `query`/`search`.
   - Only call `get_entity` when the chunk confirms relevance and the
     compiled_truth or timeline is needed in full.
   - Token discipline: "did X mention Y?" usually stops at chunks; "tell
     me everything about X" usually justifies the full entity. Exact
     thresholds are deliberately unset — see Open questions.

4. **Synthesize.** Assemble the answer with inline citations. Each claim
   carries a citation to the entity slug it came from, annotated with the
   section (compiled_truth or a dated timeline entry). When multiple
   entities contribute, cite each. When sources disagree, state the conflict
   and cite both. When the user made a runtime statement that contradicts
   the brain, runtime wins in the answer — but the contradiction is called
   out explicitly.

5. **Flag gaps.** If retrieval returned nothing, or returned hits that don't
   actually answer the question, say so in the answer. Recommend raw-zone
   grep when appropriate (it's a separate tool). Absence of a hit is never
   reported as "the fact is false."

## Anti-patterns

- Answering from the model's general knowledge when the brain has content
  on the topic. If the brain is silent, say it's silent.
- Silently picking one side of a conflict. Always cite both.
- Loading full entities (`get_entity`) when a chunk already answers the
  question. Token waste compounds across a long session.
- Ignoring source precedence — e.g., letting a timeline entry override
  compiled_truth without noting the discrepancy.
- Treating absence of evidence as evidence of absence. "I couldn't find X"
  is a gap, not a disproof.
- Mutating any state anywhere — a write op from ASK is a contract breach,
  full stop.
- Reaching into the raw zone to read source files directly. If the wiki
  layer is insufficient, the answer is "gap flagged, use raw grep," not
  "I'll open the file."

## Edge cases

- **Question requires raw source detail.** ASK flags the gap and recommends
  running raw-zone grep via the appropriate separate tool. ASK itself does
  not open raw files.
- **Conflicting compiled_truth across two related entities.** Cite both
  entities and present the conflict. Do not silently defer to one.
- **User runtime statement contradicts the brain.** Runtime wins per the
  precedence rules, but the contradiction is called out explicitly in the
  answer so the user can decide whether to trigger an INGEST/COMPILE cycle.
- **Entity exists in DB but the wiki markdown file is missing** (partial
  compile failure). ASK can still answer from `entities.compiled_truth` and
  `content_chunks`; it notes the render gap in the answer so MAINTAIN can
  pick it up later.
- **Search returns zero hits.** Report a gap. Do not fall back to general
  knowledge.
- **Ambiguous entity reference** (query matches multiple slugs). Surface
  the top candidates with disambiguating context (type, aliases, recent
  timeline dates); let the user or COMPILE pick.
- **Existence check from COMPILE with high-confidence match.** Return the
  match plus confidence signal; COMPILE decides whether to merge or create.
- **Existence check with no match but adjacent candidates.** Return the
  candidates; COMPILE can still decide to create a new entity.
- **Stale compiled_truth** (struct_hash changed but render hasn't caught
  up yet). ASK reads what's in the DB and notes staleness if detectable;
  MAINTAIN handles the repair, not ASK.

## Open questions

- **Citation format.** Candidates: `[Source: entity-slug, compiled_truth]`,
  `[[entity-slug#section]]`, or a footnote-style marker. Deferred until the
  user-facing agent style is chosen. The contract requires a citation; the
  exact syntax is not load-bearing here.
- **Response shape for COMPILE's internal existence check.** Structured
  JSON (existence flag + ranked candidates + confidence scores) is the
  working assumption, but the exact field set is open. Must be stable
  enough for COMPILE to consume programmatically.
- **Token-budget thresholds for chunk-vs-full-entity decisions.** The
  phases state the principle ("chunks first"); the numeric cutoffs are
  deferred to implementation and may vary by intent class.
- **Graph traversal depth defaults for relational questions.** Upstream
  query uses depth 5; K2 defaults are unset. Depends on real query
  distributions once the vault is populated.
- **Multi-query expansion in v1.** Upstream uses Haiku to generate
  alternate phrasings for broader recall. Whether K2's v1 ASK includes
  this — and at what latency cost — is open. The contract does not
  depend on it either way.
- **Staleness signaling to the user.** When ASK detects a struct_hash /
  render mismatch, how loudly does it flag? Open.

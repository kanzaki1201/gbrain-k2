# compile_embed

Chunk one entity's `compiled_truth` + timeline text, embed each
chunk via the configured provider, and replace the entity's
`content_chunks` rows atomically. The sole write path for
`content_chunks` under the K2 design.

## Signature

```ts
compile_embed(
  ctx: OperationContext,
  input: {
    entity_slug: string;         // entity to (re-)embed
  },
): Promise<{
  entity_slug: string;           // echoed
  chunks_written: number;        // number of new rows inserted
  chunks_removed: number;        // number of prior rows replaced
  tokens_encoded: number;        // sum of token counts across new chunks
  model: string;                 // embedding model name used
}>
```

`entity_slug` is the caller surface. The op fetches the full entity
and its timeline internally; callers never bundle inputs. No batch
form — one entity per call.

## CRUD class

**U** on `content_chunks` (delete-then-insert, atomic).

Reads: `entities`, `timeline_entries`, `sources` (to resolve
timeline citation paths for chunk-source provenance), `config`
(for embedding-model name).
Writes: `content_chunks` — removes every prior row keyed to the
entity's id, then inserts zero or more fresh rows.
External: one or more embedding-provider calls to encode chunk
text.

Does NOT touch: `entities` (struct_hash, updated_at), `links`,
`timeline_entries`, `sources`, `entity_sources`, wiki files,
raw-zone files.

## Preconditions

- `entity_slug` resolves to an existing row in `entities`. Shell
  rows with empty `compiled_truth` and no timeline entries are
  valid input; the result is `chunks_written: 0` plus whatever
  prior count is replaced.
- `entity_slug` follows `K2_SCHEMA.md` §Entity Identity canonical-
  slug rules. Violations return `invalid_slug`.
- The embedding provider is reachable at call time; if not, the op
  errors `embedding_provider_unavailable` before any DB mutation.
- `ctx` carries the config needed to pick the chunker tier and
  embedding model (both are engine-level decisions).

## Postconditions

On success:

- `content_chunks` contains exactly `chunks_written` rows for the
  entity's id. Every prior row has been removed.
- Each row has:
  - `entity_id` set to the resolved id.
  - `chunk_index` counting from 0, stable per run.
  - `chunk_text` as produced by the chunker.
  - `chunk_source` set to `'compiled_truth'` or `'timeline'`
    (see §Chunk source semantics).
  - `embedding` filled with the provider's vector response.
  - `model` set to the currently-configured embedding model.
  - `token_count` and `embedded_at` populated by the engine.
- `chunks_removed` reports how many rows existed before the call
  and were deleted as part of the atomic replacement.
- `tokens_encoded` is the sum of token counts across the new rows,
  useful for cost accounting and telemetry.
- `model` is the configured embedding model name (e.g.,
  `text-embedding-3-large`).

On failure: no `content_chunks` row is mutated. The prior-state
chunks are preserved in full. See §Atomicity and §Error handling.

No other table is touched. `entities.struct_hash` and
`updated_at` stay put — struct_hash's inputs do NOT include
`content_chunks`, so embeddings drift doesn't change the hash.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_slug` | `entity_slug` violates canonical-slug format. | Caller bug — normalize upstream. |
| `entity_not_found` | `entity_slug` has no row in `entities`. | Caller bug — land `compile_put_page` before calling. |
| `embedding_provider_unavailable` | Provider call failed (network, rate-limit after retries, 5xx, malformed response). No DB mutation has occurred. | Retry after resolving; surface to operator for long outages. |
| `embedding_provider_invalid_input` | Provider rejected the chunk text (too long after chunker split, encoding issues). No DB mutation. | Caller bug or chunker config bug — the chunker's max-length must match provider limits. |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / MAINTAIN / RECOVER running locally. |

Runtime DB errors (connection loss during the atomic delete+insert
transaction) surface as `OperationError` with engine diagnostics
intact; on any such error, the transaction rolls back and chunks
are preserved in their pre-call state.

## Atomicity

The op uses a strict ordering to ensure no partial state:

1. **Read phase.** Fetch entity + timeline + sources. No
   mutation.
2. **Chunk phase.** Split `compiled_truth` and timeline text into
   chunks via the configured chunker tier. No mutation, no
   provider call.
3. **Embed phase.** Submit chunk texts to the embedding provider
   (batched per provider's API). If this phase fails, the op
   returns `embedding_provider_unavailable` or
   `embedding_provider_invalid_input` — **no DB mutation has
   happened yet**. Prior `content_chunks` rows stay intact.
4. **Write phase.** In a single DB transaction:
   - DELETE existing rows: `DELETE FROM content_chunks WHERE
     entity_id = ?`.
   - INSERT fresh rows with the embeddings from step 3.
   - COMMIT.
   If the transaction fails mid-way, it rolls back; prior rows
   are restored.

Order matters: embedding succeeds BEFORE the DB mutation. A
provider failure after we've deleted the old rows would leave the
entity with zero chunks indefinitely — that is the failure mode
this ordering prevents.

## Chunking

The op uses the engine's configured chunker tier (recursive,
semantic, or LLM-guided per `src/core/chunkers/`). Tier selection
is config-driven, not caller-driven. Tradeoffs:

- **Recursive** — deterministic; preferred for RECOVER so
  idempotent re-embed produces identical chunk texts.
- **Semantic** — LLM-free but uses heuristics (sentence boundaries,
  section breaks).
- **LLM-guided** — highest quality but non-deterministic; breaks
  RECOVER invariant 5.

Callers do not pick the tier. The engine config does. RECOVER
callers who care about byte-identical chunk texts across runs
ensure the deterministic tier is set in their environment — this
is tracked in `specs/skills/recover.md` §Open questions on
chunking determinism.

## Chunk source semantics

Each row's `chunk_source` field marks which part of the entity
the text originated in:

- `'compiled_truth'` — chunk drawn from the entity's synthesized
  body.
- `'timeline'` — chunk drawn from concatenated timeline entries
  (each entry's `summary` + `detail`, joined per the engine's
  timeline-text assembly rule).

The op does NOT blend the two sources into a single chunk; every
chunk is tagged with exactly one source. `query` filters on this
field when the caller narrows to timeline-vs-compiled retrieval.

Future `chunk_source` values (e.g., `'source_file'` when raw-zone
embedding lands per `K2_DESIGN.md` §Search reach) are additive —
adding them doesn't break existing callers.

## Model tracking

Each chunk row carries `model` (the embedding model that produced
its vector). When the configured model changes between runs:

- Existing chunks keep their old model value until the next
  `compile_embed` call for their entity.
- The next call for that entity re-embeds everything with the new
  model and rewrites the column.
- Mixing models in the same `content_chunks` table (different
  entities on different models) is temporary and expected during
  a model-migration run.

`query`'s vector pass encodes the query with the CURRENT model; a
row with an older model has a vector in a different space and
will produce meaningless cosine distances. A dedicated
"re-embed entities with model !=current" sweep belongs to
MAINTAIN or a migration tool, not this op.

## Empty-input handling

- **Empty `compiled_truth` AND zero timeline entries** → zero
  chunks produced, zero provider calls. Op returns
  `{ chunks_written: 0, chunks_removed: N_prior, tokens_encoded: 0, model: <configured> }`.
- **Empty `compiled_truth` but non-empty timeline** → chunks only
  from timeline text; every row has `chunk_source='timeline'`.
- **Non-empty `compiled_truth` and zero timeline** → chunks only
  from body text; every row has `chunk_source='compiled_truth'`.

In every case, prior chunks for the entity are removed first. The
op never adds to existing chunks; it replaces them in full.

## Idempotency

Structurally idempotent — calling twice with no DB mutation in
between produces the same set of chunk texts and counts. The
numerical embedding vectors may differ at float-epsilon level
across calls due to provider-side non-determinism (e.g., batch
position effects, backend version differences).

This is load-bearing for `specs/skills/recover.md` invariant 5
("byte-equivalent DB state after two RECOVER passes"), which
already carves out embedding vectors from the equivalence relation.
The op does NOT implement any "skip re-embed if content unchanged"
logic — that's orchestration at the caller (COMPILE §Phase 6
filters by struct_hash; same struct_hash → skip phase 8 entirely).

For callers that DO want struct_hash-keyed skip, the pattern is:

1. Check struct_hash against prior value.
2. If unchanged, skip `compile_embed` entirely.
3. If changed, call `compile_embed` unconditionally.

COMPILE phase 6 + 8 implement exactly that. This op does not
second-guess.

## Trust boundary

This op is **local-only**. `ctx.remote === true` rejects with
`remote_caller_denied`. Only `src/cli.ts` — as the entry point
for COMPILE, MAINTAIN, and RECOVER — may call this op.

Two reasons, both load-bearing:

1. **Provider API keys.** The embedding provider requires an API
   key loaded from the local environment. Exposing embed access
   over MCP would either leak the key or require the remote
   caller to supply one, both of which break the local-only
   credential model K2 assumes.
2. **Cost amplification.** Remote callers triggering embeds at
   will could run up the provider bill. Local-only gates the
   cost to operator-initiated runs (COMPILE, MAINTAIN, RECOVER).

`query`'s reads don't call the provider (they encode only the
query text, not the corpus), which is why query stays
MCP-exposed. Only this op writes to `content_chunks`; reads are
ASK's consumption path.

## Callers

- **COMPILE §Phase 8** — the canonical caller. Once per entity
  whose `struct_hash` changed in phase 5. Phase 6 filters out
  unchanged entities so phase 8 never receives no-op candidates.
- **COMPILE §Phase 9 re-embed** — after cascade alters a
  surviving entity (drop-link timeline append), if struct_hash
  changed, phase 6 re-enters and schedules this op as part of the
  re-render / re-embed pair.
- **MAINTAIN §Auto-fix** — stale entities re-render + re-embed.
  Invoked paired with `compile_render`.
- **RECOVER §Phase 9** — once per reconstituted entity. Chunk
  texts should match a prior RECOVER pass; embedding floats may
  drift (RECOVER invariant 5 carve-out).

## Notes

- **No partial-entity embed.** The op always covers the full
  entity. A caller wanting "re-embed just the timeline" has to
  re-embed everything.
- **No multi-entity batch.** One slug per call. Batch would
  complicate the atomic delete+insert semantic (do we roll back
  the whole batch if entity #17 fails to embed?) and the
  provider-failure reporting. Keeping it per-entity matches the
  per-entity cascade semantics in COMPILE phase 9.
- **No "skip if text unchanged" optimization.** The op always
  re-embeds. Struct_hash-keyed skip is the caller's responsibility
  (see §Idempotency).
- **Chunk order is stable.** Chunk 0 is the first chunk of
  `compiled_truth` (or first timeline chunk when compiled_truth
  is empty); subsequent chunks follow the chunker's natural
  ordering, with timeline chunks after compiled_truth chunks when
  both exist. The engine MUST produce the same ordering across
  runs for byte-stable replay under the deterministic chunker tier.
- **Token counts are best-effort.** Engines compute
  `token_count` using the provider's tokenizer if available, or
  a character-length proxy otherwise. Cost accounting via
  `tokens_encoded` is approximate unless the provider returns
  exact counts.
- **The op does not emit cascade timeline entries.** Unlike
  `delete_entity`, which appends drop-link entries to surviving
  neighbours, this op is silent on the ledger — embedding changes
  are not evidence events.

## Edge cases

- **Entity that just became empty** (previous synthesis wiped
  `compiled_truth` to `""` and dropped every timeline entry via
  source cascade): old chunks deleted, zero new rows, zero
  provider calls. Valid; the entity's wiki render is minimal but
  it still occupies a slug.
- **Provider returns fewer embeddings than chunks submitted.**
  Partial response handling: the op treats it as
  `embedding_provider_invalid_input` and performs no DB mutation.
  Engines that support partial retry MAY re-request missing
  chunks; if still incomplete, error.
- **Provider rate-limit + exponential backoff.** Engine-layer
  concern. From this op's contract perspective, rate-limiting is
  part of "provider temporarily unavailable" — the op blocks
  until backoff succeeds or gives up with
  `embedding_provider_unavailable`.
- **Model changes between chunk 1 and chunk 2 of the same
  entity.** Impossible — the op reads the model name once at the
  start and uses it for every chunk in the run. A concurrent
  config change does NOT interrupt the run.
- **Concurrent `compile_embed` on the same entity.** The atomic
  delete+insert transaction serializes the two calls. The last
  committer's chunks win; the first committer's rows are
  immediately superseded. Neither partial-row scenario nor
  deadlock is expected under row-level locking on `entity_id`.
- **Entity with extremely long `compiled_truth`** (pathological
  O(MB)): the chunker splits into many pieces; the provider is
  called once per batch; `tokens_encoded` grows accordingly.
  There is no cap at the op layer — callers that need to enforce
  one do it upstream of the embed op.

## Performance considerations

- Provider latency dominates. Embedding-3-large typically
  completes a batch of 100 chunks in ~100–500ms; the op is
  I/O-bound, not CPU-bound.
- Batching: the engine batches chunks per the provider's API
  limits. No caller control; picking the batch size is engine
  operational tuning.
- Delete+insert in one transaction is cheap for typical chunk
  counts (O(10s)–O(100s) per entity). HNSW index maintenance
  (`idx_chunks_embedding`) dominates for larger counts; Postgres
  deployments may want periodic vacuum on the `content_chunks`
  table.
- Running `compile_embed` sequentially across hundreds of
  changed entities is the default path in COMPILE phase 8.
  Parallelism is an engine-level optimization (respect
  provider rate limits); the op contract does not prescribe it.

## Open questions

- **Provider migration mechanism.** Changing the embedding model
  requires re-embedding every entity, but this op doesn't expose
  a "migrate all" signal. A dedicated migration tool or MAINTAIN
  sweep (scan `content_chunks` for stale `model` values, call
  `compile_embed` per entity) is the answer. Not in scope for
  this spec.
- **Chunker tier config surface.** The op doesn't document how
  the tier is selected (config file? env var? `config` table?).
  Tracked in `src/core/chunkers/` implementation; tidy up when
  Phase 2b schema work formalizes the `config` table contract.
- **Partial-batch retry.** Some providers support per-chunk
  success/failure signals. The current spec treats any provider
  inconsistency as total failure. Refining this to "retry failed
  chunks, embed the rest" is additive but requires the engine to
  track per-chunk status during the batch call. Deferred.

Inherited:

- **Re-embedding determinism** — tracked in
  `specs/skills/recover.md` §Open questions.
- **Chunking determinism across tiers** — tracked in
  `recover.md` §Open questions.
- **Transaction boundaries across COMPILE phases** — affects
  the ordering of phase 5 (struct_hash write) vs. phase 8 (this
  op) under a hypothetical crash.
- **Canonical slug format evolution** — same as every slug-aware
  op.

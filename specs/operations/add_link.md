# add_link

Upsert one directed edge in the relationship graph. The sole write
path for `links` under the K2 design.

## Signature

```ts
add_link(
  ctx: OperationContext,
  input: {
    from_slug: string;   // source entity of the edge
    to_slug: string;     // target entity of the edge
    link_type: string;   // verb, e.g. 'parent_of', 'works_at', 'references'
    inferred: boolean;   // false = evidence-based; true = structural inference
    context?: string;    // prose: quote, reason, or structural pattern
  },
): Promise<{
  link_id: number;                                 // primary key of the row
  status: 'created' | 'updated' | 'noop';
  prior: {
    inferred: boolean;
    context: string;
  } | null;                                        // null on create
}>
```

`from_slug` and `to_slug` are the caller surface; the op resolves them
to `entities.id` internally. Callers never touch surrogate ids. The
uniqueness key is `(from_entity_id, to_entity_id, link_type)` — a
parent–child pair can legally carry both `parent_of` and (say)
`employs` without conflict, but a second `parent_of` collides.

## CRUD class

**C / U** on `links`.

Writes: `links` (one row).
Reads: `entities` (slug → id lookup for both endpoints), `links` (the
existing row for the uniqueness key, to decide create vs. update vs.
noop and to populate `prior`).

Does NOT touch: `entities` (no struct_hash recompute — that's the
caller's batched `compile_put_page` at the end of phase 5),
`timeline_entries`, `sources`, `entity_sources`, `content_chunks`,
wiki files. Rendering the edge into `compiled_truth` prose or the
`## Inferred Connections` section belongs to `compile_render`.

## Preconditions

These are caller contract. Failing any is a caller bug, not a runtime
error the caller should catch.

- `from_slug` and `to_slug` both resolve to existing rows in
  `entities`. Callers that create either entity in the same run MUST
  land `compile_put_page` for both before calling this op.
- `from_slug !== to_slug`. Self-loops are disallowed at the op layer;
  no current K2 edge type (`parent_of`, `works_at`, `references`, …)
  is meaningful as a self-edge, and allowing one would complicate
  render and traversal. If a real case emerges, lift the constraint
  here, not in caller code.
- `link_type` is non-empty, lowercase, snake_case. RECOVER's current
  fallback verb for round-tripped inline links is `references`
  (`specs/skills/recover.md` §Phase 7); callers MAY use that, but
  MUST NOT pass an empty string.
- `inferred` is a boolean. Unspecified is not allowed.
- **Source-trail precondition for evidence edges.** When
  `inferred === false`, the caller MUST have already landed a
  `link_entity_source` row tying `from_slug` to the raw source that
  justifies the edge. This op does NOT verify the junction — COMPILE
  orchestrates the write order. See `specs/skills/compile.md`
  §Contract — *Every DB write has a source trail*.
- **Context required for inferred edges.** When `inferred === true`,
  `context` MUST be non-empty and MUST describe the structural pattern
  (e.g., `"both parent_of Alice"`). The rendered
  `## Inferred Connections` line uses this verbatim inside parentheses
  per `docs/plans/2026-04-21-inferred-links-render-format.md`. When
  `inferred === false`, `context` is optional (empty string is
  equivalent to omitted); callers typically populate it with a short
  quote or evidence reference.

## Postconditions

After a successful call:

- `links` contains a row keyed by `(from_entity_id, to_entity_id,
  link_type)` with:
  - `inferred` = the input value.
  - `context` = the input value, or empty string if omitted.
  - `created_at` set on insert, preserved on update.
- No other table has been mutated. In particular, `entities.struct_hash`
  and `entities.updated_at` are UNCHANGED — the caller runs
  `compile_put_page` after the full phase-5 write set lands to
  recompute and persist the new hash for every touched entity.
- `status`:
  - `created` — no row existed for the uniqueness key; one was inserted.
  - `updated` — a row existed and at least one of `inferred` or
    `context` differed; the row was overwritten.
  - `noop` — a row existed with identical `inferred` and `context`;
    nothing was written.
- `prior` is the `(inferred, context)` pair as of **before** this
  call, or `null` on create. Useful for COMPILE phase 9 cascade
  bookkeeping — a promote (inferred `true` → `false`) is itself an
  event worth recording via `add_timeline_entry`.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `entity_not_found` | `from_slug` or `to_slug` has no matching row. | Caller bug — land `compile_put_page` for both endpoints first. |
| `self_loop_forbidden` | `from_slug === to_slug`. | Caller bug — either the extraction pipeline or the inference rule is miswiring. |
| `invalid_link_type` | `link_type` is empty, contains whitespace, or is not lowercase snake_case. | Caller bug — normalize the verb before calling. |
| `context_required_for_inferred` | `inferred === true` and `context` is missing or empty. | Caller bug — every inferred edge carries a structural reason (K2_DESIGN.md §Principle 4). |
| `remote_caller_denied` | `ctx.remote === true`. | Not caller-recoverable. Route through COMPILE / RECOVER / MAINTAIN running locally. |

Runtime DB errors (connection loss, FK violations other than the
above, transaction aborts) surface as `OperationError` with the
engine's diagnostic intact; they are not pre-enumerated here.

## Idempotency

Calling twice with **identical inputs** is a `noop` on the second
call. "Identical" is field-by-field equality against the stored row:

- `from_entity_id`, `to_entity_id`, `link_type` — the uniqueness key,
  always compared.
- `inferred` — exact equality.
- `context` — exact string equality.

Differing `inferred` flags between calls with the same uniqueness key
are `updated`, NOT `noop`, and the new flag is stored verbatim. This
is the **promote/demote surface** — a COMPILE run that gathers new
evidence for what used to be an inferred edge passes
`inferred: false`, the row flips, and `prior.inferred: true` tells the
caller to record the promotion on timeline.

Differing `context` with the same `inferred` is `updated` — refinement
of the reason or quote is stored. Callers who need historical context
should capture it in `timeline_entries`, not in the link row.

**No demotion guard in the op.** If a caller passes `inferred: true`
for an edge that is currently `inferred: false`, the op overwrites to
`inferred: true`. That path should not occur in practice — evidence
does not spontaneously become inference — but the op does not second-
guess. Detection of accidental demotion belongs to COMPILE phase 5
consistency checks, not to this primitive.

## Trust boundary

This op is **local-only**. `ctx.remote === true` (set by
`src/mcp/server.ts`) rejects with `remote_caller_denied`. Only
`src/cli.ts` — as the entry point for COMPILE, RECOVER, and MAINTAIN
— may call this op.

Rationale: an MCP caller with graph-write access could fabricate
relationships between entities (Alice `parent_of` Bob with no
evidence), which is exactly what the evidence-trail invariant
protects against. Graph reads (`get_links`, `get_graph`) stay
MCP-exposed for ASK.

## Inferred vs. evidence-based — what the op sees

The op is indifferent to the *semantic* distinction; it stores the
boolean and the context. But the render and parse sides of the round
trip depend on the values being meaningful:

- `inferred: false`, arbitrary `link_type`, arbitrary `context` → the
  edge renders as an inline `[target title](path.md)` somewhere in
  `compiled_truth` or a timeline line. After RECOVER, V1 loses the
  original `link_type` (round-trip gap — see `recover.md` Open
  questions) and re-emerges as `link_type='references'`.
- `inferred: true`, `link_type` kept (backticked in render),
  `context` kept (parenthetical in render) → the edge renders on its
  own line under `## Inferred Connections` per
  `docs/plans/2026-04-21-inferred-links-render-format.md`. RECOVER
  parses the line back to the same three-tuple; flag, verb, and
  reason survive the round trip.

Callers SHOULD NOT pass `inferred: true` with an empty `context` to
"save work"; RECOVER's parser treats a missing parenthetical as a
malformed line, and the edge drops on the next backup/restore cycle.
The op rejects via `context_required_for_inferred`.

## Callers

- `specs/skills/compile.md` §Phase 5 — structured writes for both
  evidence-based edges (from extracted facts) and inferred edges
  (from structural patterns discovered during phase 3 extraction /
  cross-entity propagation).
- `specs/skills/recover.md` §Phase 7 — one call per parsed inline
  link (`inferred: false`, `link_type: 'references'` under V1) and
  one call per `## Inferred Connections` line (`inferred: true`).
- `specs/skills/maintain.md` §Auto-fix — create missing back-links.
  Invariant per MAINTAIN §Auto-fix rules: back-links always carry
  `inferred: false` (ledger symmetry, not new inference); MAINTAIN
  sets `context` to a short string naming the originating edge
  (e.g. `"inverse of alice→bob parent_of"`). See `maintain.md` Open
  questions on the inverse-verb registry — that is what determines
  `link_type` on the back-link; this op just stores what MAINTAIN
  passes.

## Notes

- **No `delete_link` relationship.** Removing dead links is
  `delete_link`, which does not yet have its own spec file; see
  `fix_plan.md` row 19 and `specs/skills/maintain.md` Open questions
  for the naming discussion. This op does not replace or fold in
  deletion.
- **No auto-creation of the inverse edge.** If the caller adds A→B
  `parent_of`, the B→A `child_of` row is NOT created by this op.
  MAINTAIN detects the missing back-link on its next pass and calls
  this op a second time. Coupling the inverse here would (a) require
  inverse-verb knowledge the op does not have, and (b) double the
  blast radius of every add_link call.
- **Render format coupling.** The `inferred` semantics in this op
  directly mirror the render-format decision in
  `docs/plans/2026-04-21-inferred-links-render-format.md`. If that
  decision changes, this spec's "inferred vs. evidence-based" section
  MUST be revisited.

## Open questions

Inherited, not specific to this op:

- **`link_type` round-trip for inline evidence-based links.** RECOVER
  cannot reconstruct the original verb from an `[text](path)` inline
  match under the current render format. V1 falls back to
  `link_type='references'`. Resolution lives in `recover.md` Open
  questions. This op stores whatever the caller provides; the gap is
  upstream of it.
- **Inverse-verb registry for MAINTAIN back-links.** The mapping from
  `parent_of` → `child_of`, `works_at` → `employs`, etc., is unset.
  Tracked in `maintain.md` §Open questions. Does not block this op —
  callers just pass a `link_type`.
- **`delete_link` op shape and ownership.** See `maintain.md` §Open
  questions and `fix_plan.md` row 19. Until resolved, this spec
  assumes link deletion is out of scope; edits MUST go through the
  upsert path here.

# get_graph

Multi-hop graph traversal over the `links` table from a seed entity.
Returns the reachable subgraph as separate node and edge lists.
Read-only.

Used by ASK's Relational intent for questions that cross more than
one hop ("how is X related to Y?", "who's in Alice's extended
family?"). One-hop queries use `get_links`.

## Signature

```ts
get_graph(
  ctx: OperationContext,
  input: {
    entity_slug: string;                            // seed entity
    direction: 'outbound' | 'inbound' | 'both';    // traversal direction
    depth: number;                                  // non-negative integer, 0..10
    link_type?: string;                             // restrict traversal to one verb
    inferred?: boolean;                             // true/false filter; unset = no filter
    max_nodes?: number;                             // hard cap on returned node count; default = no cap
  },
): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;         // true if `max_nodes` was hit or engine truncated
  depth_reached: number;      // how deep the traversal actually went before termination
}>

type GraphNode = {
  slug: string;
  type: EntityType;
  title: string;
  min_depth: number;          // shortest hop distance from seed; seed has 0
};

type GraphEdge = {
  from_slug: string;
  to_slug: string;
  link_type: string;
  inferred: boolean;
  context: string;            // '' when unset
};
```

Every field on `GraphNode` and `GraphEdge` mirrors `get_entity`'s and
`get_links`'s shape where applicable — no `compiled_truth`, no
`frontmatter`, no `created_at`. Traversal payloads stay minimal.

## CRUD class

**R** on `links` (recursive), joined to `entities` twice per hop.

Reads: `links`, `entities`.
Does NOT touch any other table, and performs no writes.

## Preconditions

- `entity_slug` follows `K2_SCHEMA.md` §Entity Identity canonical-slug
  rules. Violations return `invalid_slug`.
- `direction` is required. One of `'outbound' | 'inbound' | 'both'`.
  Same rule as `get_links`.
- `depth` is required. Non-negative integer in `[0, 10]`. Values
  outside this range error `invalid_depth` — 10 is the spec-level
  ceiling to prevent runaway recursion (see §Depth limit).
- `link_type`, if provided, is a non-empty lowercase snake_case
  string — same shape `get_links` requires.
- `inferred`, if provided, is a boolean.
- `max_nodes`, if provided, is a positive integer.

## Postconditions

- Returns `{ nodes, edges, truncated, depth_reached }`:
  - `nodes`: every entity reachable from `entity_slug` within `depth`
    hops under the direction and filters, including the seed (at
    `min_depth: 0`). Sorted by `(min_depth asc, slug asc)`.
  - `edges`: every `links` row whose endpoints are BOTH in `nodes`,
    subject to the same filters. Sorted by `(from_slug, to_slug,
    link_type)` ascending.
  - `truncated`: `true` if `max_nodes` was hit (BFS stopped) or the
    engine truncated for another reason; otherwise `false`. When
    `true`, `edges` covers only edges among the returned `nodes`.
  - `depth_reached`: the greatest `min_depth` present in `nodes`.
    Equals `depth` when the traversal saturated the requested depth;
    less when the reachable subgraph is smaller than `depth`.
- Missing seed entity produces `nodes: []`, `edges: []`, `truncated:
  false`, `depth_reached: 0`. No error — consistent with `get_links`
  §Not-found handling.
- No table is mutated. Repeat calls with identical inputs return
  byte-equivalent envelopes subject to concurrent writers.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_slug` | `entity_slug` violates canonical-slug format. | Caller bug — normalize upstream. |
| `invalid_direction` | `direction` is not one of the three allowed strings. | Use the enum. |
| `invalid_depth` | `depth` is negative, non-integer, or > 10. | Clamp or split the query. |
| `invalid_link_type` | `link_type` provided and violates `add_link` §Preconditions. | Caller bug — pass a valid verb or omit. |
| `invalid_max_nodes` | `max_nodes` provided and ≤ 0, or non-integer. | Caller bug. |

Runtime DB errors (connection loss, recursive CTE cancellation)
surface as `OperationError` with engine diagnostics intact; not
pre-enumerated.

No `entity_not_found`. A missing seed returns an empty envelope.

## Traversal semantics

The op implements a breadth-first search from the seed:

1. **Seed at depth 0.** The seed entity is always in `nodes` (unless
   the seed itself doesn't exist — empty envelope).
2. **Expand by direction.** At each depth step, take the frontier
   nodes and follow edges per `direction`:
   - `'outbound'` — follow `links.from_entity_id` to
     `links.to_entity_id`.
   - `'inbound'` — follow `links.to_entity_id` to
     `links.from_entity_id`.
   - `'both'` — follow in either direction; the seed is always
     expanded in both.
3. **Apply filters per-edge.** An edge is eligible for traversal
   only if it passes `link_type` and `inferred` filters. Filtered
   edges do NOT contribute to frontier expansion and do NOT appear
   in `edges`.
4. **Deduplicate via `min_depth`.** Each node appears once with its
   shortest hop distance from the seed. Cycles do not cause
   infinite traversal.
5. **Terminate when frontier empty OR depth reached OR max_nodes
   hit.** After termination, add every in-subgraph edge to `edges`
   (see §Reachable-subgraph edges below).

## Reachable-subgraph edges

After BFS terminates, `edges` contains **every edge among the
returned nodes**, not just the edges that were traversed to reach
them. This is "reachable subgraph" semantics, not "tree of
traversal."

Example: A → B, B → C, A → C, all `inferred=false`. Starting from A
with `direction='outbound', depth=2`:

- BFS visits A (depth 0), then B and C (depth 1, each reached via
  one edge from A).
- `nodes` = `[A@0, B@1, C@1]`.
- `edges` = `[A→B, A→C, B→C]` — all three, because all three
  endpoints are in `nodes`.

The traversal PATH to C was `A → C` directly (depth 1), but the
edge `B → C` is still in the result. Callers that want traversal
trees (edges actually crossed) filter `edges` by
`to_slug.min_depth > from_slug.min_depth` themselves.

Rationale: the reachable subgraph is a richer primitive for ASK's
relational answers ("is there a path from A to C?", "are B and C
also connected?"). Reconstructing the tree from the subgraph is
O(V+E); reconstructing the subgraph from the tree is impossible
without a second query.

## Direction-asymmetry

`direction` applies to the TRAVERSAL, not to the edges stored.
Every edge is stored as a directed from→to pair in `links`. At
depth 0, the seed is in `nodes`. At each step, expansion depends
on `direction`:

- `'outbound'` — at each step, expand only via edges leaving the
  current frontier node. A node reachable only via an inbound edge
  is NOT in `nodes`.
- `'inbound'` — symmetric; expand only via edges arriving at the
  current frontier node.
- `'both'` — either direction. Equivalent to treating the graph as
  undirected for traversal purposes; edges retain their directed
  attributes in the output.

Under `'outbound'`, an edge `X → Y` contributes to the result only
if X is reached FIRST. `'inbound'` is the mirror. `'both'` treats
edges symmetrically during expansion but still reports them with
their stored direction in `edges`.

## Filter interaction with traversal

`link_type` and `inferred` filters prune BOTH traversal and edge
emission:

- Traversal: edges that fail the filter do not contribute to
  frontier expansion. A node reachable only via a filtered-out
  edge is NOT in `nodes`.
- Emission: only edges passing the filter appear in `edges`.

Example: with `link_type='parent_of'` and `depth=2`, the subgraph
reflects only the parent-of chain. Non-parent-of edges linking
members of that chain are invisible. If the caller wants "all
reachable within depth=2 via any edge, then show me only parent_of
edges among them," that requires two calls and a client-side
intersect — the op does not split traversal from emission.

## Depth limit

`depth` is capped at `10` in the spec. Rationale:

- K2's typical relational answers (family, professional, project
  relationships) saturate within depth 3–5.
- Recursive CTEs with unbounded depth can destabilize the engine
  on high-degree hubs.
- Callers needing deeper traversal probably want graph analytics,
  not an ASK primitive; that's a different tool.

`depth: 0` is valid and returns just the seed with no edges (and
an empty `edges` array because reachable-subgraph edges require at
least two nodes). Useful as a cheap existence-check with a
metadata return shape.

## `max_nodes` semantics

When `max_nodes` is provided, BFS stops expanding the frontier as
soon as `nodes.length` would exceed `max_nodes`, completing the
current depth layer first for consistency:

- If the current layer can be added without exceeding `max_nodes`,
  it is. `truncated: false`.
- If the current layer would exceed, the op adds as many nodes from
  the next layer as fits (in slug-sort order for determinism) and
  sets `truncated: true`.
- `edges` then covers only the final `nodes` set.
- `depth_reached` reflects the actual deepest `min_depth` in
  `nodes`, which may be less than `depth`.

Without `max_nodes`, the op runs to `depth` saturation. Engines MAY
apply an internal safety cap (e.g., 10000 nodes) and set
`truncated: true` — but the spec's ceiling is `max_nodes` when
provided, and otherwise best-effort.

## MCP exposure

This op is **MCP-exposed**. Read-only, returns only summary-shape
node and edge data — no `compiled_truth`, no `frontmatter`. ASK's
multi-hop relational retrieval runs over MCP through this op.

The fanout concern on large subgraphs is operational, not a trust
boundary issue. Expose-side risk is DOS via pathological depth +
dense hub — mitigated by the `depth` ceiling of 10 and by
`max_nodes`. No remote-specific gate.

## Ordering

- `nodes` sorted by `(min_depth asc, slug asc)`. This makes the
  seed first, then BFS layer by layer, then slug tiebreak.
- `edges` sorted by `(from_slug asc, to_slug asc, link_type asc)`.
  Same ordering as `get_links` for cross-op consistency.

Callers MAY rely on this ordering for deterministic comparison.

## Idempotency

Trivially idempotent — read-only, no write. Repeat calls return
byte-equivalent data subject to concurrent writers.

## Trust boundary

Read-only; safe under `ctx.remote === true`. Operational guardrails
live in `depth` cap + `max_nodes`.

## Callers

- **ASK §Phase 2 Relational (multi-hop)** — "how is Alice related
  to Bob?", "who's connected to Project X through at least two
  degrees?" ASK calls with `direction='both'` in most cases and a
  depth tuned to the question.
- **ASK §Phase 2 Existence check (rare)** — occasionally useful
  when dedup signals require relational context (e.g., "is this
  'Alice' the same as the one related to Bob?"). One-hop
  `get_links` is usually sufficient; `get_graph` is the escalation.

No COMPILE caller. COMPILE's phase-3 cross-entity propagation uses
`get_links` one-hop; deeper propagation is not in COMPILE's current
phase design.

No MAINTAIN caller. MAINTAIN's checks are per-entity or pairwise,
not subgraph-wide.

No RECOVER caller.

## Notes

- **Subgraph edges include the direction they were stored.** A
  `'both'` traversal does not "undirect" edges in the output —
  `from_slug` and `to_slug` reflect the storage order.
- **No ordering by link weight or score.** The op is structural;
  ranking live in `search` and `query`. If a caller wants
  "strongest one-hop neighbor," it uses `get_links` + its own
  scoring.
- **No path enumeration.** Callers that want "all paths from A to
  B within depth N" reconstruct them from the `nodes + edges`
  result. Enumerating paths explicitly would blow up the payload
  for dense graphs.
- **Max-depth ceiling is normative.** The spec's `10` isn't a
  suggestion — engines MUST reject larger values. Callers needing
  deeper analysis use graph-analytics tooling outside this op.
- **Tags / type filters on NODES are not exposed.** Traversal only
  respects the direction + edge filters. A caller wanting "all
  `people` entities within 3 hops of Alice" fetches the subgraph
  and filters `nodes` client-side. Folding node-filters into
  traversal semantics is ambiguous (do we skip the node entirely,
  stopping the branch? Or just drop it from output?) and not worth
  the complication.

## Edge cases

- **Seed with no outbound edges.** Under `direction='outbound'`,
  `nodes = [seed]`, `edges = []`, `truncated: false`,
  `depth_reached: 0`.
- **Seed with inbound edges only, called outbound.** Same as above
  — `'outbound'` sees no expansion opportunities.
- **Disconnected component.** The subgraph is whatever is reachable
  from seed; other components don't appear.
- **`depth: 0`.** Returns just `[seed]` in `nodes`; `edges: []`
  even if the seed has self-loops (self-loops are forbidden by
  `add_link` anyway).
- **Cycle A → B → A.** Both nodes appear once with their shortest
  `min_depth`. `edges` contains both `A→B` and `B→A`.
- **Seed reachable from itself via cycle but with different
  `link_type`.** Each node still appears once; the edge set carries
  all verbs.
- **Concurrent write adding an edge mid-traversal.** Engine's
  snapshot isolation determines visibility. The op does not pin a
  transaction — consistency is best-effort per engine.
- **`link_type` filter excludes every outbound edge.** `nodes =
  [seed]`, `edges: []`. Valid; shows the seed has no outgoing
  edges of that verb.

## Performance considerations

- Recursive CTEs on deep traversals over dense graphs can be
  expensive. Depth 10 with 100-degree hubs hits large intermediate
  result sets.
- Engines SHOULD implement BFS with an explicit frontier loop if
  recursive CTE performance is inadequate. The spec's contract is
  output semantics, not implementation strategy.
- `max_nodes` is the operational pressure valve for dense-graph
  queries. ASK's call sites should pass it when rendering graph
  context for a user-facing answer — a question answered in 50
  nodes is better than one answered in 10000 after a pause.

## Open questions

- **Committing a default `depth`.** ASK's spec explicitly flags
  "graph traversal depth defaults are unset." The op currently
  REQUIRES `depth`. If a K2-wide default lands (say, `3`), make it
  optional with that default. Additive; not in scope today.
- **Node-filter traversal semantics.** If a future caller wants
  "traverse only through `people` entities (skip other types),"
  the op needs `node_type?: EntityType` with explicit semantics
  (stop traversal at filtered nodes? drop from output only?).
  Deferred until a concrete use case appears.
- **Weighted edges / ranked traversal.** K2 has no edge weights
  today. If the design adds them (e.g., confidence scores for
  inferred edges), `get_graph` would want a "top-N by weight"
  variant. Not in scope.
- **Path enumeration as a sibling op.** A `get_paths(from, to,
  depth)` op answering "paths between A and B" is a reasonable
  future addition. Separate op, not an extension of this one.

Inherited:

- **Canonical slug format evolution** — same as every slug-aware
  op.
- **Cross-engine collation differences** — `list_entities` §Open
  questions.
- **Transaction boundaries under concurrent writes** — `compile.md`
  §Open questions.

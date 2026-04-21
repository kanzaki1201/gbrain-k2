# get_links

Read edges from the `links` table that touch a seed entity. Returns
zero or more `Link` records, filtered by direction, link type, and
inferred flag. Read-only.

## Signature

```ts
get_links(
  ctx: OperationContext,
  input: {
    entity_slug: string;                            // seed entity
    direction: 'outbound' | 'inbound' | 'both';     // which side of the edge the seed sits on
    link_type?: string;                             // exact verb filter (e.g. 'parent_of'); default = no filter
    inferred?: boolean;                             // true, false, or unset = no filter
  },
): Promise<Link[]>

type Link = {
  from_slug: string;              // source endpoint slug, always resolved
  to_slug: string;                // target endpoint slug, always resolved
  link_type: string;              // verb, e.g. 'parent_of'
  inferred: boolean;              // K2 structural-inference flag
  context: string;                // quote or structural reason; '' if unset
  created_at: string;             // ISO-8601 UTC
};
```

`direction` is required — no default. `link_type` and `inferred` are
optional filters; omitting them means "match any."

## CRUD class

**R** on `links` (zero or more rows). Joins `entities` twice to
resolve `from_entity_id`/`to_entity_id` into slugs.

Reads: `links`, `entities` (id → slug lookup for endpoints).
Does NOT touch any other table, and performs no writes.

## Preconditions

- `entity_slug` follows `K2_SCHEMA.md` §Entity Identity canonical-slug
  rules. Shape validation errors return `invalid_slug`, the same
  convention as `get_entity`.
- `direction` is one of `'outbound' | 'inbound' | 'both'`. No default.
- `link_type`, if provided, is a non-empty lowercase snake_case string
  (the same shape `add_link` requires on write). An empty-string
  `link_type` errors `invalid_link_type` to disambiguate "filter by
  empty verb" (nonsensical) from "no filter".
- `inferred`, if provided, is a boolean. Absent means no filter.

## Postconditions

- Returns an array of `Link` records that satisfy every filter.
  Missing seed entity produces an empty array, not an error; see §Not
  found handling.
- No table is mutated. Repeat calls with the same arguments return
  byte-equivalent data subject to concurrent writers.

## Errors

| Error | When | Caller action |
|-------|------|---------------|
| `invalid_slug` | `entity_slug` violates canonical-slug format. | Caller bug — normalize or validate upstream. |
| `invalid_direction` | `direction` is not one of the three allowed strings. | Caller bug — use the enum. |
| `invalid_link_type` | `link_type` is provided and is empty, uppercase, contains whitespace, or otherwise violates `add_link` §Preconditions. | Caller bug — pass a valid verb or omit the filter. |

Runtime DB errors (connection loss, query cancellation) surface as
`OperationError` with engine diagnostics intact; not pre-enumerated.

No `entity_not_found`. A missing seed → empty result.

## Not-found handling

If `entity_slug` has no matching row in `entities`, the op returns
`[]`. Rationale:

- **Collection-shaped return.** Distinguishing "exists but has no
  links" from "doesn't exist" requires a separate `get_entity` probe.
  The common caller paths (ASK, COMPILE cascade, MAINTAIN back-link
  check) treat both as "nothing to do" and don't need the
  distinction.
- **Race absorption.** MAINTAIN's check phase iterates via
  `list_entities` → `get_links`; a cascade between those calls
  returns an empty array and the loop continues. No exception
  plumbing.
- **Consistency with `get_entity` philosophy.** Reads don't error on
  missing state — the primitive answers "what's there?", not "is
  this there?" If the caller needs the latter, chain `get_entity`.

## Direction semantics

| `direction` | Returns edges where… |
|-------------|----------------------|
| `'outbound'` | `from_entity_id` matches the seed. |
| `'inbound'`  | `to_entity_id` matches the seed. |
| `'both'`     | Either endpoint matches the seed. Deduped: a self-edge (if ever legal) appears once. |

The direction filter is applied BEFORE `link_type` and `inferred`
filters. Every returned row still has `from_slug` and `to_slug`
populated for both endpoints — the caller does not need to infer
which side matched.

Self-edges are currently disallowed by `add_link` §Preconditions
(`self_loop_forbidden`), so `'both'` never dedupes in practice.
Included for future-proofing if the K2 design relaxes the
constraint.

## Filter composition

All filters are AND-combined:

- `direction='outbound'`, `link_type='parent_of'`, `inferred=false`
  → edges FROM the seed, labeled `parent_of`, evidence-based only.
- `direction='both'`, `inferred=true`
  → all inferred edges touching the seed, regardless of verb.
- `direction='inbound'`, no type filter, no inferred filter
  → every edge pointing AT the seed.

No substring match on `link_type`, no regex, no multi-verb set. A
caller wanting "parent_of or mentor_of" issues two calls and merges.
Keeps the filter surface tiny and SQL-translatable.

## Return ordering

The returned array is sorted deterministically so callers can compare
results byte-for-byte across engines:

1. `from_slug` ascending (case-insensitive, codepoint tie-break).
2. `to_slug` ascending (same rule).
3. `link_type` ascending.
4. `created_at` ascending (tiebreaker for edges with identical
   composite key — shouldn't happen given `add_link`'s uniqueness,
   but deterministic under any future schema change).

Same sorting discipline as `get_entity`'s `tags`/`aliases`: the op
normalizes on read so callers don't each re-sort.

## MCP exposure

This op is **MCP-exposed**. Read-only, returns no raw-zone content,
exposes only graph topology already visible in rendered wiki files.
ASK's relational retrieval (`specs/skills/ask.md` §Phase 2 —
Relational) runs through this op over MCP.

The frontmatter-redaction concern flagged in `get_entity` §MCP
exposure does not apply here: `get_links` does not return any
frontmatter.

## Field semantics

- **`from_slug`, `to_slug`** — resolved from the stored
  `from_entity_id` / `to_entity_id` via a join on `entities.id`.
  Always present and non-empty; the FK constraint (`ON DELETE
  CASCADE` on both endpoints) means a dangling edge cannot exist
  under a consistent DB. If schema drift produces one, the join
  fails and the row is excluded from the result — detection of that
  drift belongs to MAINTAIN's dead-link check via a dedicated op,
  not to this primitive.
- **`link_type`** — verb as stored (lowercase snake_case).
- **`inferred`** — boolean as stored. The caller's downstream
  render decisions (does this edge go inline into `compiled_truth`
  or into `## Inferred Connections`?) hinge on this flag.
- **`context`** — the stored context string. Empty string if the
  `add_link` caller omitted it. For `inferred=true` edges this is
  the structural reason rendered in the `## Inferred Connections`
  parenthetical.
- **`created_at`** — ISO-8601 UTC, normalized at the op layer.

No `link_id` in the return shape. The composite `(from_slug,
to_slug, link_type)` is the logical key; callers don't need the
surrogate integer id. If a future caller (e.g., a link-audit
feature) needs it, add to the return shape — additive change, no
contract break.

## Dead-link / dangling-edge handling

Current schema has `ON DELETE CASCADE` on `links.from_page_id` and
`links.to_page_id`, which means deleting an entity prunes all edges
touching it. Under that invariant, dangling edges cannot exist in a
consistent DB, and the join in this op will not surface one.

MAINTAIN's dead-link check (`specs/skills/maintain.md` §Check —
*Dead links*) is therefore really a schema-drift canary or a
race-safety net, not a routine finding. Implementing that check as
a direct `get_links` call would miss a schema-violating dangling
edge (the join excludes it); it needs a separate enumeration path.
Surface the gap in Open questions rather than twisting this op to
compensate.

## Pagination

This op does NOT paginate. Per K2's design, an entity's immediate
link degree is bounded by the structural claims made in its
compiled_truth and surrounding timeline — typically O(10s), rarely
breaching three digits. Callers that receive unusually large
results SHOULD treat that as a signal to re-examine the entity (it
may be a hub or a structural hot-spot worth investigating), not to
ask the op for a page size.

If a future K2 evolution requires bounded fetches (e.g., public-
figure people entities with thousands of inferred connections),
add pagination parameters then. Additive change.

## Idempotency

Trivially idempotent — read-only, no write. Repeat calls with the
same arguments return byte-equivalent data subject to concurrent
writers.

## Trust boundary

Read-only; safe under `ctx.remote === true`. See §MCP exposure.

## Callers

- **ASK §Phase 2 Relational** — "who knows X?", "what links A and
  B?". Calls with `direction='outbound'` or `'inbound'` depending
  on the question shape.
- **ASK §Phase 2 Temporal (rare)** — some temporal questions hinge
  on relational context (e.g., "when did my relationship with X
  start?"); the skill may fan out to this op for a one-hop graph.
- **COMPILE §Phase 3 cross-entity propagation** — when extraction
  on a file implies changes to entity A, and A has outbound edges
  to B, B is added to the affected-entity set. Calls with
  `direction='outbound'` or `'both'`.
- **COMPILE §Phase 9 cascade** — when entity X is deleted, fetch
  `direction='inbound', entity_slug=X` to find every surviving
  entity that needs a drop-link timeline entry.
- **MAINTAIN §Check dead links** — caveat per §Dead-link handling.
- **MAINTAIN §Check missing back-links** — for each edge A→B,
  `get_links(B, direction='outbound', link_type=<inverse verb>)`
  to check whether the inverse edge exists.

No RECOVER caller. RECOVER's phase 7 writes links via `add_link`
rather than reading them; selective-mode diffing is a separate op
(`list_entities` with a filter) for entities, not edges.

## Notes

- **No batch form.** Callers fetching links for N seeds issue N
  calls. The common call patterns are single-seed (cascade, ASK
  lookup), and a bulk op would have to define cross-seed dedup
  semantics that the primitives don't need.
- **No filter on `context` text.** Context is freeform prose for
  evidence edges and structural reason for inferred edges; filtering
  on it would invite brittle regex patterns in callers. If a
  specific verb carries substructure worth querying, it should
  probably be promoted to its own `link_type`.
- **Sorting is normative.** Callers may rely on the documented
  order for deterministic comparison.
- **ISO-8601 timestamps are normative** — same rule as `get_entity`.
- **Seed must be an entity slug, not a source or a tag.** Source
  attribution lives on `entity_sources`; use the (not-yet-spec'd)
  source-registry read op for that. Tag-based link enumeration
  lives on `list_entities` + this op as a follow-up.

## Edge cases

- **Seed with zero links.** Returns `[]`. Indistinguishable at the
  op level from a missing seed; the caller chains `get_entity` if
  the distinction matters.
- **All-direction call on a high-degree hub.** Can return a large
  array. No pagination; see §Pagination.
- **Concurrent edge write.** A caller interleaving `get_links` with
  `add_link` / `delete_link` (when that op lands) may observe the
  pre- or post-write state depending on the engine's isolation
  level. No explicit consistency guarantee is provided here; the
  engine's default row-level snapshot behavior is relied upon.
- **`inferred=true` with `link_type` filter.** Perfectly fine:
  inferred edges also carry verbs. Common use for ASK when the user
  asks specifically about inferred relationships of a known type
  ("what's obvious given the data?").

## Open questions

Inherited, not specific to this op:

- **Dangling-edge enumeration.** MAINTAIN's dead-link check needs
  to surface `links` rows whose endpoints don't resolve. A
  dedicated `scan_dead_links` read op is the cleanest fit, but not
  yet spec'd. Tracked in `maintain.md` §Open questions alongside
  the `delete_link` op-naming decision.
- **Link `link_id` exposure.** If a caller needs the surrogate
  primary key (for logging, auditing, or an eventual `delete_link`
  op keyed by id), add it to the return shape. Additive, deferred.
- **Canonical slug format evolution.** Same inherited concern as
  `get_entity` — any `K2_SCHEMA.md` §Entity Identity change
  propagates to every slug-accepting op's `invalid_slug` rule.

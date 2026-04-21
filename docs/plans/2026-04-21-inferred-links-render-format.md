# Decision: Render format for inferred links

**Status:** proposed (pending review)
**Date:** 2026-04-21
**Decides:** Open question raised in `specs/skills/recover.md` §Open
questions, with ripple effects on `K2_DESIGN.md` §Render and
`specs/skills/compile.md` §Render.

## Context

K2 distinguishes two kinds of relationship-graph edges:

- **Evidence-based** — stated or clearly implied by a source. Stored with
  `links.inferred = false`.
- **Inferred** — structurally required (e.g., Bob↔Cathy co-parents because
  both are `parent_of` Alice). Stored with `links.inferred = true`.

`K2_DESIGN.md` §Inference Rules commits to the distinction being visible:

> Inferred links are flagged distinctly. They can be promoted (source
> confirms) or dismissed (user rejects).

Two downstream contracts depend on the flag surviving render → parse:

1. **RECOVER roundtrip fidelity** (`specs/skills/recover.md` invariant 1):
   `render(DB) → parse(markdown) → DB` must produce equivalent structured
   data. Under the current render format, the `inferred` flag is lost —
   every parsed link comes back `inferred=false`.
2. **MAINTAIN dead-link handling**: removing an inferred edge whose
   structural basis disappeared is a different category of event from
   removing an evidence-based edge whose target was deleted. Without a
   rendered marker, MAINTAIN cannot behave differently in the two cases
   after a DB wipe + RECOVER pass.

Today's render format (per K2_DESIGN.md §Render and the Alice/Bob/Cathy
walkthrough) uses a single markdown link syntax for both kinds:

```markdown
Alice is the biological daughter of [Bob](people/bob.md) and
[Cathy](people/cathy.md).
```

The inferred `bob↔cathy` edge is not surfaced at all in the rendered
output — it exists in the DB but has no markdown home. A human reading
Bob's page cannot see that his co-parent link to Cathy is inferred, not
direct evidence.

## Candidates

From `specs/skills/recover.md` §Open questions, plus refinements.

### (a1) Inline attribute syntax

```markdown
Alice's co-parent is [Cathy](people/cathy.md){.inferred}.
```

Pros: adjacent to the link. Cons: `{.class}` attribute syntax is Pandoc-
specific and not supported by GFM or Obsidian renderers. Introduces a
non-standard dependency for every downstream reader.

### (a2) Frontmatter array

```yaml
---
title: Bob
type: people
inferred_links:
  - target: cathy
    link_type: co_parent
    context: shared parent_of Alice
---
```

Pros: clean machine surface, zero body pollution. Cons: invisible to a
human reading the rendered page, duplicates link data already present
in the DB, and drifts if edited carelessly.

### (a3) Dedicated body section

```markdown
---
## Timeline
- **2026-10-10** | …

---
## Inferred Connections

- [Cathy](people/cathy.md) — co-parent (shared `parent_of` Alice)
- [Blender](tools/blender.md) — uses (via ARP plugin)
```

Pros: human-visible (satisfies "flagged distinctly" literally),
machine-parseable (stable section header), single-file portable, uses
only standard markdown. Cons: extends the canonical page format with a
third section, must be excluded from struct_hash if we don't want
round-trip noise (struct_hash already includes the `links` table so
this is a non-issue — see §Struct_hash below).

### (b) Accept drift

Do nothing on render. All parsed links after RECOVER become
`inferred=false`. MAINTAIN cannot re-infer because inference needs raw-
zone access, which neither MAINTAIN nor RECOVER has.

Pros: zero format change. Cons: backup/restore silently loses a
load-bearing design distinction. The promote/dismiss lifecycle breaks
permanently after any RECOVER pass. Undermines `K2_DESIGN.md` §Principle
4 on structural inference.

### (c) Side-channel file

Per entity, emit a parallel `people/bob.inferred.json` (or similar)
holding the inferred edges.

Pros: decouples inference metadata from the rendered prose. Cons:
breaks the "single-file-per-entity portable backup" model — copying a
vault to another tool without this side-channel file silently loses
structural inferences. Two-file synchronization is a whole category of
bugs we don't currently have.

## Decision

**Option (a3): dedicated `## Inferred Connections` section in the
rendered markdown body.**

The section lives below `## Timeline`. Each line names an inferred edge
with its target entity, link type, and the structural reason the edge
exists. The section is optional — entities with no inferred outbound
edges omit it entirely.

### Rendered format

```markdown
---
title: Bob
type: people
…
---

# Bob

Bob is [Alice](people/alice.md)'s biological father. Alice's mother is
[Cathy](people/cathy.md). ^[…]

---

## Timeline

- **2026-10-10** | Zettel revealed Cathy as co-parent of Alice ^[…]
- **2026-01-01** | Clipping revealed Bob is Alice's biological father ^[…]

---

## Inferred Connections

- [Cathy](people/cathy.md) — `co_parent` (both `parent_of` Alice)
```

Canonical entry shape:

```
- [<Display Name>](<path>) — `<link_type>` (<structural reason>)
```

- The backticks around `<link_type>` distinguish the verb from prose.
- The parenthetical holds the inference context (what structural
  pattern justifies this edge). Matches `K2_DESIGN.md` §Inference Rules
  patterns (containment / co-parentage / co-attendance / shared
  context).
- Section is emitted only for entities with ≥1 outbound inferred link.
- Section order: alphabetical by target slug for deterministic render
  (same discipline as timeline sort order, for struct_hash stability —
  but see §Struct_hash).

### Why this variant

- **Satisfies "flagged distinctly" literally.** A human reading Bob's
  page sees the inferred edges in a clearly labeled section separate
  from evidence-based prose.
- **Round-trippable.** `## Inferred Connections` is a stable, unique
  section header; RECOVER parses it with the same section-based
  strategy it uses for `## Timeline`.
- **Portable.** Lives in the single markdown file per entity. A wiki
  copy to another tool preserves the inference metadata.
- **Standard markdown.** No Pandoc attributes, no frontmatter
  duplication, no side files.
- **Extensible.** Future K2 versions can add per-line metadata
  (confidence score, inference date) without changing the section
  header contract.

### Promote / dismiss workflow

The design says inferred links can be promoted (source confirms) or
dismissed (user rejects). With this format:

- **Promote**: the human adds a citation footnote to the target entry,
  or writes a zettel that references the connection. Next COMPILE
  flips `inferred` to `false` and the edge moves into compiled_truth
  prose. The `## Inferred Connections` section line disappears.
- **Dismiss**: the human deletes the line from the rendered markdown.
  Next RECOVER omits the edge from the parsed links. (If only COMPILE
  runs, the inferred edge would re-appear on the next render — dismissal
  without eviction from the DB is temporary. Durable dismissal needs a
  separate mechanism; see §Open follow-ups.)

## Struct_hash

`K2_DESIGN.md` §Structural Hash includes `sorted(links)` in the hash
input. The `links` table already carries `inferred`, so two DB states
that differ only in the inferred flag of one edge produce different
struct_hashes. The *rendered* markdown was the lossy stage, not the DB.

This decision changes only the render and parse sides. The DB
representation, the struct_hash algorithm, and all existing DB writes
are unchanged.

## Spec impact

### K2_DESIGN.md

Update §Render to add:

> 6. If the entity has any outbound `links` rows with `inferred=true`,
>    append a `## Inferred Connections` section after `## Timeline`.
>    Each line follows the canonical shape
>    `- [<display>](<path>) — \`<link_type>\` (<reason>)`.

Update §Example: Alice/Bob/Cathy — Bob's rendered page to include the
new section showing the inferred co-parent edge to Cathy.

### specs/skills/compile.md

In §Phases §7. Render, append:

> Entities whose outbound link set includes `inferred=true` edges get an
> `## Inferred Connections` section below `## Timeline`, per the decision
> in `docs/plans/2026-04-21-inferred-links-render-format.md`. Entities
> with no inferred outbound edges omit the section entirely.

### specs/skills/recover.md

In §Phases §2. Wiki scan and parse, add to the parsed-page structure:

> - `inferred_links` — every entry in the `## Inferred Connections`
>   section, parsed to `(target_path, link_type, reason)`.

In §Phases §7. Insert links, update the rule:

> Evidence-based links (those inside `compiled_truth` or timeline
> entries) get `inferred=false`. Entries from the `## Inferred
> Connections` section get `inferred=true` with `context` set to the
> structural reason.

In §Open questions, mark the inferred-link round-trip question as
closed by this decision and strike it from the list.

In §Contract invariant 1, update the equivalence carve-out list: the
`inferred` flag is no longer excluded; it round-trips under this
format.

### specs/skills/maintain.md

No immediate required change. A follow-up can tighten dead-link
removal to distinguish inferred vs. evidence-based targets once op
specs cover it. Filing as a non-blocking follow-up.

## Rejected alternatives — why not

- **(a1) inline attribute syntax** — non-standard; breaks Obsidian and
  GFM rendering.
- **(a2) frontmatter array** — invisible to humans, defeats "flagged
  distinctly", and duplicates link data that's already in the DB.
- **(b) accept drift** — silently loses a design primitive on every
  backup/restore cycle. Unacceptable.
- **(c) side-channel file** — breaks single-file portability.

## Open follow-ups

These remain open even after this decision lands:

- **Durable dismissal.** If a user deletes a `## Inferred Connections`
  line and doesn't re-run RECOVER, next COMPILE re-adds the inferred
  edge. A "dismissed_inferences" set on the entity (frontmatter array?
  DB table?) may be needed so repeat compiles honor the dismissal.
  Scope this as a separate design question.
- **Inferred link to/from non-existent entity.** If Cathy's page is
  deleted, Bob's `## Inferred Connections` line points at a missing
  target. MAINTAIN's dead-link check should handle this, but the
  auto-fix action may differ: evidence-based dead link → remove; inferred
  dead link → the inference itself is invalidated, remove + record on
  Bob's timeline. Spec tightening belongs in MAINTAIN.
- **Link-type rendering.** This decision pins the verb inside inferred
  connections (backticked). The symmetric question for evidence-based
  edges inside compiled_truth prose is still open (see recover.md
  Open question on link-type reconstruction). Resolving that later can
  reuse the backticked-verb convention for consistency.

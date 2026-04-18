---
name: zettel-processor
version: 3.0.0
description: |
  DEPRECATED. Responsibilities were split between two skills:
  - Content compile (new/updated zettels → wiki pages) → maintain
  - Zettel lifecycle (archival candidates, archival execution) → zettel-status-check
  Do not invoke this skill directly. Use maintain for compilation and
  zettel-status-check for lifecycle. This stub exists to preserve historical
  references while downstream skills/crons migrate.
triggers:
  - "process zettels"
  - "compile zettels"
tools:
  - bash
mutating: false
---

# Zettel Processor (deprecated)

This skill was split in v3.0.0:

- **Content compilation** (new zettels → wiki pages, updated zettels →
  recompiled wiki pages, orphan handling when zettels are deleted) moved to
  `maintain` Phase 1 (Content Recompile). Maintain runs nightly by default
  and handles `human/` + `sources/` file changes.

- **Zettel lifecycle** (archival candidacy, approved archival moves, citation
  rewrites on manual archive moves) moved to `zettel-status-check`. Runs
  evening by default.

## Redirect

If you were about to invoke `zettel-processor`:

- **To compile zettels** → invoke `maintain` (covers compile + health checks).
- **To check archival candidates or archive a zettel** → invoke
  `zettel-status-check`.

## Why the split

`zettel-processor` mixed two distinct concerns:
1. Keeping the wiki aligned with raw content (compile / recompile).
2. Managing the human-gated zettel lifecycle (archival).

These run on different cadences and have different mutation profiles. Compile
modifies wiki pages (agent-owned zone). Archival moves human-authored files
(sacred zone, human-gated). Mixing them meant either conservative prose that
blocked compile, or liberal prose that risked human-zone mutations.

## Historical behaviour

For the prior design, see git history:
- `skills/zettel-processor/SKILL.md` at commit 89720cf or earlier (v2.x)
- `K2_SCHEMA.md` Operating Principle 6 documented the intended workflow.

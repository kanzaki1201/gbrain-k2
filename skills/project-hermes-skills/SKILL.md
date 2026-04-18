---
name: project-hermes-skills
version: 2.0.0
description: |
  Refresh ~/.hermes/skills/brain/ from ~/gbrain-k2/skills/ as THIN projections.
  Each Hermes skill is a tiny YAML frontmatter + one-line pointer to the
  canonical source skill. No body mirroring, no drift, edit-in-one-place.
triggers:
  - "project Hermes skills"
  - "refresh brain skills"
  - "sync Hermes skills"
  - "rewrite brain skill pack"
tools:
  - bash
mutating: true
---

# Project Hermes Skills (v2 — thin projection model)

The Hermes projection is no longer a content mirror. Each Hermes skill is
now a **thin pointer** to the canonical source skill at `~/gbrain-k2/skills/`.
This eliminates projection drift and collapses the update workflow to
"edit source, done."

## Why thin projections

The previous model copied full skill content from source to projection
and rewrote the `tools:` frontmatter. In practice:

- The `tools:` rewrite was solving a real-but-narrow problem (Hermes had no
  binding for gbrain's abstract tool verbs like `search`, `put_page`).
- Mirroring required every source-skill edit to be followed by a projection
  pass, or the projection drifted.
- Skill SELECTION is driven by frontmatter (`name`, `description`,
  `triggers`) which fits in ~10-20 lines. Skill EXECUTION is driven by
  body prose which the agent can load lazily via `cat`.

Separating selection metadata (projection) from execution body (source)
lets us update the body freely without needing to reproject.

## The thin projection template

```yaml
---
name: <SAME_AS_SOURCE>
version: <SAME_AS_SOURCE>
description: |
  <COPY_VERBATIM_FROM_SOURCE>
triggers:
  - <COPY_VERBATIM_FROM_SOURCE>
tools:
  - bash
mutating: <SAME_AS_SOURCE>
---

# <SAME_AS_SOURCE title>

Read `~/gbrain-k2/skills/<name>/SKILL.md` and follow it end to end.

```bash
cat ~/gbrain-k2/skills/<name>/SKILL.md
```
```

That's the entire body. The agent sees the frontmatter in the skills
index (for selection) and reads the source content via `cat` at execution
time.

## Procedure

1. **Enumerate source skills** at `~/gbrain-k2/skills/*/SKILL.md`.
2. **For each source skill, generate a thin projection** at
   `~/.hermes/skills/brain/<name>/SKILL.md`:
   - Extract `name`, `version`, `description`, `triggers`, `mutating`
     from source frontmatter.
   - Force `tools: [bash]` (single source of truth for Hermes tool surface).
   - Body is the fixed "Read ~/gbrain-k2/skills/<name>/SKILL.md" pointer.
3. **Copy RESOLVER.md** verbatim to `~/.hermes/skills/brain/RESOLVER.md`.
   This is the routing table — not projectable, just a file copy.
4. **Copy conventions/** verbatim to `~/.hermes/skills/brain/conventions/`.
   Referenced by path from multiple skills. Plain copies.
5. **Skip the wrapper skill** — don't touch
   `~/.hermes/skills/brain/run-project-hermes-skills/SKILL.md` (Hermes-owned).
6. **Verify** each thin projection loads via `skills_list(category="brain")`.

## What this replaces

Old v1.x behaviour (mirror + rewrite `tools:`):
- Source edit → must reproject → Hermes skill updated.
- Drift risk between source and projection.
- Classifier-contract sections had to be copied byte-for-byte to avoid
  classifier regressions.

New v2.0 behaviour (thin projection):
- Source edit → Hermes picks up changes on next invocation via `cat`.
- Drift impossible — source IS the body.
- Classifier-contract sections live only in source; projection doesn't
  touch them.

## Rules

- **Frontmatter only.** Never inline skill body prose into a projection.
  The body is always the fixed pointer.
- **`tools: [bash]` always.** No exceptions for non-mutating skills either
  — `cat` needs bash.
- **Don't touch `run-project-hermes-skills/`.** Hermes-owned wrapper.
- **Don't write to `/home/k/gbrain-k2/hermes-skills/`.** Retired path.
- **If source frontmatter is missing `description` or `triggers`, fix the
  source.** The projection depends on these for selection.

## Report

- Skills re-projected this pass
- Skills skipped (no source SKILL.md found at expected path)
- RESOLVER.md and conventions/ copy verification

## Verification

- Every file in `~/.hermes/skills/brain/<name>/SKILL.md` has `tools: [bash]`
  and body length ≤ 10 lines after frontmatter.
- `~/.hermes/skills/brain/RESOLVER.md` exists and matches source byte-for-byte.
- `~/.hermes/skills/brain/conventions/` exists and matches source directory.
- `~/.hermes/skills/brain/run-project-hermes-skills/SKILL.md` is byte-unchanged.
- No files exist under `/home/k/gbrain-k2/hermes-skills/`.

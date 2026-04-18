---
name: project-hermes-skills
version: 2.0.0
description: |
  Refresh ~/.hermes/skills/brain/ from ~/gbrain-k2/skills/. Each Hermes
  skill is a thin projection: frontmatter + one-line pointer that says
  "read the canonical source and follow it." Runs scripts/project-thin.py.
triggers:
  - "project Hermes skills"
  - "refresh brain skills"
  - "sync Hermes skills"
tools:
  - bash
mutating: true
---

# Project Hermes Skills

Keep Hermes in sync with gbrain-k2's skillpack. Projections are THIN —
frontmatter-only pointers that tell Hermes to read the canonical source.
No body mirroring, no drift.

## Procedure

```bash
python3 ~/gbrain-k2/scripts/project-thin.py
```

That's it. The script:

- Enumerates `~/gbrain-k2/skills/*/SKILL.md`
- For each, writes `~/.hermes/skills/brain/<name>/SKILL.md` with:
  - Name, description, triggers, mutating from source frontmatter
  - `tools: [bash]` (forced)
  - Body: `Read ~/gbrain-k2/skills/<name>/SKILL.md and follow it end to end.`
- Copies `RESOLVER.md`, `conventions/`, `_brain-filing-rules.md`,
  `_output-rules.md` verbatim
- Skips `run-project-hermes-skills/` (Hermes-owned wrapper)
- Removes stale `references/` dirs left by prior v1.x mirror passes

## Dry run first

```bash
python3 ~/gbrain-k2/scripts/project-thin.py --dry-run
```

Reports what would be projected without writing. Use on unfamiliar states.

## Verification

After the projection:

```bash
# Every thin projection has tools: [bash]
grep -L '^  - bash$' ~/.hermes/skills/brain/*/SKILL.md

# Hermes can list the skills
hermes skills list | grep brain/
```

## When to rerun

- After adding a new skill under `~/gbrain-k2/skills/`
- After renaming or removing a skill
- After editing RESOLVER.md, conventions/, or shared reference files

**You do NOT need to rerun** after editing a skill's body — the thin
projection points to source, so Hermes picks up changes automatically.

## Anti-patterns

- **Hand-editing files under `~/.hermes/skills/brain/`.** They get
  regenerated. Edit the source in `~/gbrain-k2/skills/` instead.
- **Reintroducing body content into a thin projection.** The whole point
  is that the projection has no body — the source is the body.
- **Writing to `/home/k/gbrain-k2/hermes-skills/`.** Retired path. Only
  output location is `~/.hermes/skills/brain/`.

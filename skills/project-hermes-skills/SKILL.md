---
name: project-hermes-skills
version: 1.3.0
description: |
  Refresh ~/.hermes/skills/brain/ from ~/gbrain-k2/skills/.
  Keep each Hermes skill close to the source skill and only change what Hermes needs.
triggers:
  - "project Hermes skills"
  - "refresh brain skills"
  - "sync Hermes skills"
  - "rewrite brain skill pack"
tools:
  - read_file
  - search_files
  - write_file
  - patch
  - terminal
  - skills_list
  - skill_view
mutating: true
---

# Project Hermes Skills

Refresh `~/.hermes/skills/brain/` from `~/gbrain-k2/skills/`.

## Procedure

1. Compare source skills against `~/.hermes/skills/brain/` and start with missing or drifted skills.
2. For each touched skill, keep the same intent, section order, and approximate length as the source.
3. Change only what Hermes needs:
   - Hermes frontmatter (see Tool Frontmatter Rule below — REQUIRED)
   - `references/blueprint.md` for traceability
4. Keep projection-only metadata out of `SKILL.md`.
5. Write the touched skill under `~/.hermes/skills/brain/<skill>/SKILL.md`.
6. **Copy shared reference dirs verbatim.** `skills/conventions/` and any other
   non-skill directories referenced by SKILL.md files MUST be copied as-is to
   `~/.hermes/skills/brain/`. These are not projectable (no SKILL.md to rewrite),
   just plain file copies. Multiple SKILL.md files reference them by path — a
   missing conventions/ dir silently breaks brain-first lookup, citation rules,
   and cross-modal review.
6b. **Copy RESOLVER.md to brain projection root.** `~/gbrain-k2/skills/RESOLVER.md`
   MUST be copied verbatim to `~/.hermes/skills/brain/RESOLVER.md`. This is the
   master dispatch table mapping user triggers to brain skills. Without it,
   Hermes cannot route messages to the correct skill (e.g. URL → idea-ingest).
   The file is NOT projectable (no frontmatter rewrite needed), just a plain copy.
7. Verify the touched skills load with `skills_list(category="brain")` and spot `skill_view(...)` calls.

## Tool Frontmatter Rule (REQUIRED, not a judgment call)

Source skills declare abstract verbs in `tools:` (e.g., `search`, `query`, `get_page`, `put_page`, `add_link`, `add_timeline_entry`). These are gbrain CLI intents, not Hermes tool names. Hermes has no binding for them — leaving them in the projection causes the model to return empty output because it cannot find a callable matching the declared tool.

Every projection MUST rewrite the `tools:` field. The real execution surface for every brain-writing skill is:

- `gbrain <verb>` CLI invocations (shell)
- direct markdown file read/write (shell)

So every projection declares:

```yaml
tools:
  - bash
```

Nothing else. Drop the abstract verbs entirely. The body prose already contains the concrete `gbrain search "name"`, `gbrain put-page`, and markdown read/write calls — those are the real execution path. The `tools:` list is only about what Hermes binds at runtime.

Exception: if a skill is genuinely non-mutating and reads no files (pure prompt-processing), it may declare `tools: []` or omit the field. Skills that touch the brain always declare `tools: [bash]`.

## Rules

- Keep projected skills short.
- Preserve the source skill's wording whenever it already works for Hermes.
- Keep the generated pack in `~/.hermes/skills/brain/`.
- Skip extra explanation about projection mechanics inside the generated skill body.
- The `tools:` frontmatter rewrite is not optional. Every projection pass checks it.
- **Classifier-contract sections are verbatim, not paraphrasable.** Any section
  marked `(CONTRACT — do not soften on re-projection)` in a source skill MUST
  be copied byte-for-byte into the projection. Paraphrasing these sections has
  produced live classifier failures (e.g. signal-detector returning 0 signals
  on obvious originals material). Examples and negative examples carry semantic
  weight — touching them changes behaviour.
- **Do NOT rewrite `~/.hermes/skills/brain/run-project-hermes-skills/SKILL.md`.** That wrapper skill is Hermes-owned and frozen — it has no source in `~/gbrain-k2/skills/` and is not a projection target. The projection pass must skip it entirely. If it appears drifted or "improvable", leave it alone; any change belongs in a separate, explicit edit by the human, not inside this projection workflow.
- Do NOT write anywhere under `/home/k/gbrain-k2/hermes-skills/`. That path is retired. The only projection output location is `~/.hermes/skills/brain/`.

## Report

- rewritten skills
- healthy unchanged skills
- any skill that still needs manual review

## Verification

- each touched skill has `references/blueprint.md`
- touched skills stay close to source length and structure
- Hermes can load the touched skills
- no projection carries an abstract verb in `tools:` (grep each touched SKILL.md for `get_page|put_page|add_link|add_timeline_entry|^\s*- search$|^\s*- query$`; any match is a failed projection)
- `~/.hermes/skills/brain/run-project-hermes-skills/SKILL.md` is byte-unchanged after the projection pass
- `~/.hermes/skills/brain/RESOLVER.md` exists and matches `~/gbrain-k2/skills/RESOLVER.md`
- no files exist under `/home/k/gbrain-k2/hermes-skills/`

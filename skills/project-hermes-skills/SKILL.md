---
name: project-hermes-skills
version: 1.0.0
description: |
  Rewrite Hermes-facing skill projections from the canonical gbrain-k2 blueprints.
  Treat ~/gbrain-k2/skills/ as source of truth. Use LLM judgment to map blueprint
  intent onto real Hermes tools and workflows, then write/update
  ~/.hermes/skills/brain/.
triggers:
  - "project Hermes skills"
  - "rewrite Hermes projections"
  - "refresh brain skill projections"
  - "sync Hermes skills from blueprints"
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

Rewrite the Hermes-facing skillpack from the canonical K2 blueprints.

`~/gbrain-k2/skills/` is the authority.
`~/.hermes/skills/brain/` is the Hermes-owned generated artifact.

## Contract

This skill guarantees:
- Source blueprints stay canonical; projected Hermes skills are disposable artifacts.
- Projection is semantic, not mechanical. Rewrite for Hermes runtime reality.
- Tool mapping must be explicit. Source-only tool names do not survive without a concrete Hermes execution path.
- `references/blueprint.md` is copied from the source blueprint for traceability.
- Healthcheck stays thin: projection count, source/projection pairing, and Hermes skill loading.

## Phases

### 1. Discover what needs projection work

Inspect these roots:
- source: `~/gbrain-k2/skills/`
- projection output: `~/.hermes/skills/brain/`

For each source blueprint:
1. confirm whether `~/.hermes/skills/brain/<skill>/SKILL.md` exists
2. compare the source blueprint against:
   - projection metadata hash/path if present
   - `references/blueprint.md` if present
   - obvious projection drift in content or missing sections
3. prioritize changed or missing projections first

If a full refresh is clearly safer than selective updates, do a full refresh.

### 2. Inspect Hermes runtime reality

Before writing any projection:
1. inspect the current Hermes tool surface available in this session
2. inspect any relevant Hermes-local helper skills
3. translate blueprint operations into actual Hermes moves

Typical mappings:
- source query/get/put/link operations → concrete `gbrain ...` CLI calls through `terminal`
- source file inspection → `read_file` / `search_files`
- source file edits → `write_file` / `patch`
- background or parallel work → `delegate_task`, background runtime hooks, or explicit cron/gateway wiring
- scheduler behavior → `cronjob`

A projected skill is only good when a future Hermes session can actually execute it.

### 3. Rewrite the projection with LLM judgment

For each target skill, write:
- `~/.hermes/skills/brain/<skill>/SKILL.md`
- `~/.hermes/skills/brain/<skill>/references/blueprint.md`

Projection rules:
- Preserve the blueprint's doctrine and behavioral contract.
- Rewrite the procedure for Hermes-native execution.
- Prefer concrete commands and explicit tool paths over abstract source verbs.
- Use Hermes sections that are useful in practice:
  - `When to Use`
  - `Quick Reference`
  - `Procedure`
  - `Pitfalls`
  - `Verification`
- Include source traceability in metadata.
- Do not cargo-cult the source `tools:` list into the body.
- Do not leave unresolved source-only verbs like `get_page`, `put_page`, `add_link`, `add_timeline_entry` unless you immediately explain the real Hermes execution path.

### 4. Keep install/loading lightweight

Keep the generated pack Hermes-owned:
- `~/.hermes/skills/brain/`

Do not treat `~/gbrain-k2/hermes-skills/` as the normal destination.
That repo path is legacy/bootstrap material only.

### 5. Thin healthcheck

After rewriting:
1. confirm projected skill count is sane relative to source blueprint count
2. confirm each projected skill has a matching `references/blueprint.md`
3. confirm Hermes can load the skills with:
   - `skills_list(category="brain")`
   - spot `skill_view(...)` calls for touched skills

This healthcheck is structural only. The real projection work happened in the rewrite step.

## Output Format

Report:
- which projections were rewritten
- which projections were already healthy
- any blueprint that still needs human review
- whether Hermes successfully loaded the touched skills

## Anti-Patterns

- Treating projection as a hash-preserving copy job
- Assuming source tool names are executable in Hermes as written
- Auditing section shape while skipping tool-path reality
- Hand-editing source blueprints when only the Hermes projection needs to change
- Creating extra one-off helper skills for temporary audit chores

## Verification

- Touched projected skills read like Hermes-native procedures
- Each touched projection has a fresh `references/blueprint.md`
- `skills_list(category="brain")` exposes the touched skills in a fresh Hermes session
- No unresolved source-only tool path remains in the rewritten procedure

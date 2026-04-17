---
name: project-hermes-skills
version: 1.0.0
description: |
  Rewrite Hermes-facing skill projections from the canonical gbrain-k2 blueprints.
  Treat ~/gbrain-k2/skills/ as source of truth and write concise
  Hermes-owned projections to ~/.hermes/skills/brain/.
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
- Projected skills stay close to the source blueprint.
- Projection changes stay limited to Hermes frontmatter and any wording required for real Hermes execution.
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

### 3. Write the projection with minimal change

For each target skill, write:
- `~/.hermes/skills/brain/<skill>/SKILL.md`
- `~/.hermes/skills/brain/<skill>/references/blueprint.md`

Projection rules:
- Preserve the blueprint's meaning, structure, and brevity.
- Keep the body close to the source blueprint.
- Change frontmatter so the skill is Hermes-native.
- Change body wording only when a source-only tool path needs a real Hermes execution path.
- Include source traceability in metadata.
- Avoid projection boilerplate, commentary, and restated sections.

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

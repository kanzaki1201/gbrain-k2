---
name: update-k2
version: 1.0.0
description: |
  Pull upstream gbrain changes into the k2 fork safely, preserving k2
  customizations. Preview, selective cherry-pick, backup, conflict resolution,
  validation. Never pushes to upstream.
triggers:
  - "update k2"
  - "pull upstream gbrain"
  - "merge upstream"
  - "sync with gbrain"
tools:
  - bash
mutating: true
---

# Update K2

The k2 fork (`kanzaki1201/gbrain-k2`) drifts from upstream
(`garrytan/gbrain`) as k2-specific customizations accumulate. This skill pulls
upstream changes into the fork without losing k2 mods.

Run `/update-k2` in Claude Code from inside `~/gbrain-k2/`.

## Contract

This skill guarantees:
- Clean worktree check and upstream fetch-only remote before any operation
- Backup branch + tag created before any merge/rebase/cherry-pick
- K2-divergent files preserve their k2 content during conflict resolution
- Validation (bun install + build + test) after merge
- Hermes brain-skill projections regenerated and audited after any `skills/` changes
- Breaking-changes prompt if CHANGELOG entries mark [BREAKING]
- Rollback instructions printed at the end of every run
- Never pushes to upstream — push URL is a poison pill

## Phases

See the full step-by-step workflow below under Step 0 through Step 7.

## Output Format

- Printed diff summary (bucketed by file area)
- Printed list of conflicts resolved
- Printed list of breaking changes + skills invoked
- Rollback tag name + command
- Remaining local diff vs upstream

## Safety invariants (non-negotiable)

- **Never push to upstream.** The k2 fork is personal; upstream is not a PR
  target. All pushes go to `origin` only.
- **Never proceed with a dirty working tree.** Stash or commit first.
- **Always create a rollback point** (backup branch + tag) before touching
  anything.
- **Preserve all k2 mods** during conflict resolution. Upstream improvements
  merge in; k2 customizations stay.

## K2 files that are intentionally divergent

These files have significant k2 customizations. Expect conflicts here on most
upstream merges — resolve by keeping the k2 version and integrating upstream
fixes where they don't clash with k2 intent:

- `HERMES_HANDOVER.md` — k2-only file, no upstream equivalent. Post-intake
  operator handover guide. Complements upstream `INSTALL_FOR_AGENTS.md`.
- `K2_SCHEMA.md` — repo-root, no upstream equivalent. Upstream never writes here.
- `docs/GBRAIN_RECOMMENDED_SCHEMA.md` — upstream file with a small pointer header. Preserve header on merge.
- `skills/_brain-filing-rules.md` — sources-interpretation section is rewritten. Preserve local content; accept upstream additions to unrelated sections (citation format, back-link rules, raw preservation).
- `skills/repo-architecture/SKILL.md` — decision tree rewritten with the local category set. Keep local version.
- `skills/signal-detector/SKILL.md` — Phase 1 routing and the human/-never-write rule are local. Keep local version.
- `skills/zettel-processor/SKILL.md` — no upstream equivalent.
- `skills/update-k2/SKILL.md` — this file, no upstream equivalent.

Other files under `skills/`, `docs/`, `src/` are expected to match upstream
unless noted otherwise.

## How it works

**Preflight:** clean worktree check, upstream remote presence (adds if
missing with fetch-only URL by default to prevent accidental pushes),
branch detection.

**Backup:** timestamped backup branch + tag.

**Preview:** bucketed diff of upstream changes grouped by impact area
(docs, skills, src, build/config, other).

**Update paths:** merge (default), cherry-pick, rebase, abort.

**Conflict preview:** dry-run merge to list conflicts before committing.

**Conflict resolution:** open only conflicted files, keep k2 mods, merge
upstream improvements.

**Validation:** `bun install` and `bun run build` and `bun test` if
configured.

**Hermes projection refresh:** if any files under `skills/` changed, run the
projection workflow through the wrapper skill so Hermes rewrites the external
pack with Hermes-native tool mappings:

```text
/run-project-hermes-skills
```

The legacy sync script remains a bootstrap/repair fallback:

```bash
~/gbrain-k2/scripts/sync-hermes-brain-skills.sh
```

Then start a new Hermes session so the available-skills prompt cache refreshes.

**Summary + rollback:** tag name, new HEAD, remaining diff, rollback
command.

## Step 0: Preflight

```bash
cd ~/gbrain-k2
git status --porcelain
```

If output is non-empty → tell the user to commit or stash first, then stop.

Check remotes:
```bash
git remote -v
```

- If `upstream` is missing: ask the user whether to add it. Default URL is
  `https://github.com/garrytan/gbrain.git`. **IMPORTANT:** set the push URL
  to a poison pill so accidental pushes to upstream are impossible:
  ```bash
  git remote add upstream https://github.com/garrytan/gbrain.git
  git remote set-url --push upstream DISABLED_NEVER_PUSH_TO_UPSTREAM
  git fetch upstream --prune
  ```
- If `upstream` exists: verify its push URL is a poison pill (not a real
  URL). If it is a real URL, rewrite it to the poison pill. Explain to the
  user that this prevents accidental PRs or pushes.

Determine the upstream branch:
```bash
git branch -r | grep upstream/
```
- Prefer `upstream/master` for gbrain (that's its default). Fall back to
  `upstream/main` if master is missing. Store as `UPSTREAM_BRANCH`.

Fetch fresh:
```bash
git fetch upstream --prune
```

## Step 1: Safety net

```bash
HASH=$(git rev-parse --short HEAD)
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
git branch backup/pre-update-$HASH-$TIMESTAMP
git tag pre-update-$HASH-$TIMESTAMP
```

Save the tag name for the summary.

## Step 2: Preview

```bash
BASE=$(git merge-base HEAD upstream/$UPSTREAM_BRANCH)
git log --oneline $BASE..upstream/$UPSTREAM_BRANCH   # upstream commits since base
git log --oneline $BASE..HEAD                        # local (k2) commits since base
git diff --name-only $BASE..upstream/$UPSTREAM_BRANCH
```

Bucket the upstream-changed files:

- **K2-divergent files** (see list above): expect conflicts, plan to keep k2 version
- **Skills (`skills/`)** other than divergent ones: usually safe to merge
- **Docs (`docs/`)** other than GBRAIN_RECOMMENDED_SCHEMA.md: usually safe
- **Source (`src/`)**: may conflict if k2 patches any TypeScript (so far k2 does not)
- **Build/config** (`package.json`, `tsconfig*.json`, `bun.lock`): review needed
- **Other**: tests, CI, etc.

Present the buckets. Use AskUserQuestion:

- A) Full merge (recommended for most updates)
- B) Selective cherry-pick (specific commits only)
- C) Rebase (advanced — conflicts resolve per commit)
- D) Abort (just view the changelog, make no changes)

If D: stop.

## Step 3: Conflict preview

For A or C:

```bash
git merge --no-commit --no-ff upstream/$UPSTREAM_BRANCH
git diff --name-only --diff-filter=U    # list conflicted files
git merge --abort
```

Chain these as a single command so the abort always runs. If conflicts were
listed, show them and confirm the user wants to proceed.

## Step 4A: Merge (default)

```bash
git merge upstream/$UPSTREAM_BRANCH --no-edit
```

If conflicts occur:

- `git status` to list conflicted files.
- For each conflicted file:
  - If it's in the "K2-divergent files" list: keep the k2 version for any
    section that has k2-specific content. Integrate upstream improvements ONLY
    in sections that are not k2-customized.
  - Otherwise: resolve by preserving both sides' intent; normally upstream
    "wins" in ambiguous cases since k2 didn't touch the file.
  - `git add <file>`
- When all resolved: `git commit --no-edit` (if merge didn't auto-commit).

## Step 4B: Cherry-pick

```bash
git log --oneline $BASE..upstream/$UPSTREAM_BRANCH
```

Ask which commit hashes to apply.

```bash
git cherry-pick <hash1> <hash2> ...
```

Resolve conflicts per commit (same rules as Step 4A), then
`git cherry-pick --continue`. To abort mid-stream: `git cherry-pick --abort`.

## Step 4C: Rebase

```bash
git rebase upstream/$UPSTREAM_BRANCH
```

Resolve conflicts per commit, `git add <file>`, `git rebase --continue`. If
the rebase gets tangled (more than 3 rounds of conflicts), abort and suggest
a merge instead:

```bash
git rebase --abort
```

## Step 5: Validation

```bash
bun install             # sync dependencies if package.json changed
bun run build           # if defined in package.json
bun test                # if tests are configured; tolerate skip if not
```

If build fails:

- Show the error.
- Fix only issues directly caused by the merge (missing imports, type
  mismatches from merged code).
- Do NOT refactor unrelated code.
- If the failure is ambiguous, ask the user before making changes.

## Step 6: Breaking changes check

```bash
git diff <backup-tag-from-step-1>..HEAD -- CHANGELOG.md
```

Parse for `[BREAKING]` entries. If found:

- Display a warning with each breaking change description.
- For each breaking change that references a skill to run (format
  `Run /<skill-name> to <action>`), use AskUserQuestion (multiSelect) to let
  the user pick which migration skills to run now.
- Invoke selected skills via the Skill tool.

If none: skip silently.

## Step 7: Summary + rollback

Show:

- Backup tag: `<tag-from-step-1>`
- New HEAD: `git rev-parse --short HEAD`
- Upstream HEAD: `git rev-parse --short upstream/$UPSTREAM_BRANCH`
- Conflicts resolved (list files)
- Breaking changes applied (list skills run)
- Remaining local diff vs upstream: `git diff --name-only upstream/$UPSTREAM_BRANCH..HEAD`

Rollback instructions:

```
To rollback entirely:
  git reset --hard <backup-tag-from-step-1>

Backup branch also exists:
  backup/pre-update-<HASH>-<TIMESTAMP>

To push the updated fork to origin (never upstream):
  git push origin master
```

## Token usage

Only open files with actual conflicts. `git log`, `git diff`, `git status`
cover everything else. Do not scan or refactor unrelated code.

## Anti-Patterns

- Pushing to `upstream` (never — the push URL is the poison-pill guard)
- Overwriting k2-divergent files with upstream versions without reviewing
  per-section intent
- Making "cleanup" refactors while resolving merge conflicts
- Skipping the backup step (step 1) "because it's a small update"
- Merging without running validation
- Running `git merge --abort` and calling it a successful update

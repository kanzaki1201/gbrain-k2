# CLAUDE.md

GBrain K2 is a personal knowledge brain — a portable data standard for
agent-assisted knowledge management. Four core operations define the system:
**INGEST** (content enters raw zone), **COMPILE** (raw → structured DB → rendered wiki),
**MAINTAIN** (quality enforcement), **RECOVER** (wiki → DB reconstruction).

See `K2_DESIGN.md` for principles, operations, and zone ownership rules.
See `K2_SCHEMA.md` for vault structure, page types, and frontmatter specs.

## Architecture

Contract-first: `src/core/operations.ts` defines ~30 shared operations. CLI and MCP
server are both generated from this single source. Engine factory (`src/core/engine-factory.ts`)
dynamically imports the configured engine (`'pglite'` or `'postgres'`).

**Trust boundary:** `OperationContext.remote` distinguishes trusted local CLI callers
(`remote: false` set by `src/cli.ts`) from untrusted agent-facing callers
(`remote: true` set by `src/mcp/server.ts`). Security-sensitive operations tighten
filesystem confinement when `remote=true`.

## Key files

**Contract + types:**
- `src/core/operations.ts` — operation definitions, upload validators, trust boundary
- `src/core/engine.ts` — pluggable BrainEngine interface (37 methods)
- `src/core/types.ts` — Page, Link, and other type definitions

**Database engines:**
- `src/core/engine-factory.ts` — dynamic engine import (`'pglite'` | `'postgres'`)
- `src/core/pglite-engine.ts` — PGLite (embedded Postgres 17.5 via WASM)
- `src/core/pglite-schema.ts` — PGLite-specific DDL
- `src/core/postgres-engine.ts` — Postgres + pgvector (Supabase / self-hosted)
- `src/core/db.ts` — connection management, schema init
- `src/core/migrate.ts` — schema migrations
- `src/schema.sql` — source DDL (generates schema-embedded.ts)
- `src/core/schema-embedded.ts` — auto-generated (run `bun run build:schema`)

**Content pipeline:**
- `src/core/import-file.ts` — importFromFile + importFromContent (chunk + embed + tags)
- `src/core/sync.ts` — manifest parsing, filtering, slug conversion
- `src/core/embedding.ts` — OpenAI text-embedding-3-large, batch, retry
- `src/core/chunkers/` — 3-tier chunking (recursive, semantic, LLM-guided)
- `src/core/markdown.ts` — frontmatter parsing

**Search:**
- `src/core/search/` — hybrid search: vector + keyword + RRF + multi-query expansion + dedup
- `src/core/search/intent.ts` — query intent classifier
- `src/core/search/eval.ts` — retrieval eval harness (P@k, R@k, MRR, nDCG@k)
- `src/core/search/expansion.ts` — multi-query expansion via Haiku

**CLI + MCP:**
- `src/cli.ts` — CLI entry point
- `src/mcp/server.ts` — MCP stdio server (generated from operations)

**Commands:**
- `src/commands/init.ts` — brain initialization (PGLite default, Supabase for large vaults)
- `src/commands/sync.ts` — vault sync
- `src/commands/import.ts` — file import
- `src/commands/extract.ts` — batch link/timeline extraction
- `src/commands/eval.ts` — search quality evaluation
- `src/commands/doctor.ts` — health checks
- `src/commands/lint.ts` — page quality linter
- `src/commands/backlinks.ts` — back-link checker and fixer
- `src/commands/embed.ts` — embedding management
- `src/commands/report.ts` — structured report saver
- `src/commands/upgrade.ts` — self-update CLI
- `src/commands/check-update.ts` — version check
- `src/commands/migrate-engine.ts` — bidirectional engine migration
- `src/commands/integrations.ts` — integration recipe management

**Utilities:**
- `src/core/utils.ts` — shared SQL utilities
- `src/core/storage.ts` — pluggable storage interface
- `src/core/file-resolver.ts` — file resolution with fallback chain
- `src/core/config.ts` — configuration management
- `src/core/backoff.ts` — adaptive load-aware throttling
- `src/core/yaml-lite.ts` — lightweight YAML parser
- `src/core/pglite-lock.ts` — PGLite connection locking

## Build

`bun build --compile --outfile bin/gbrain src/cli.ts`

## Testing

`bun test` runs all unit tests. Unit tests run without a database.

E2E tests (`test/e2e/`): Run against real Postgres+pgvector. Require `DATABASE_URL`.
- `bun run test:e2e` runs Tier 1 (mechanical, all operations, no API keys)
- `test/e2e/search-quality.test.ts` runs search quality E2E against PGLite
- Tier 2 (`skills.test.ts`) requires OpenClaw + API keys

### API keys

Source the user's shell profile before running tests:
```bash
source ~/.zshrc 2>/dev/null || true
```
This loads `OPENAI_API_KEY` and `ANTHROPIC_API_KEY`.

### E2E test DB lifecycle

1. Check for `.env.testing` — if missing, copy from sibling worktree
2. Check if port is free: `docker ps --filter "publish=PORT"`
3. Start: `docker run -d --name gbrain-test-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=gbrain_test -p PORT:5432 pgvector/pgvector:pg16`
4. Wait: `docker exec gbrain-test-pg pg_isready -U postgres`
5. Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:PORT/gbrain_test bun run test:e2e`
6. Tear down: `docker stop gbrain-test-pg && docker rm gbrain-test-pg`

## CHANGELOG voice

Write entries that sell the upgrade, not document the implementation.
- Lead with what the user can now DO
- Frame as benefits, not files changed
- Always credit community contributions with `Contributed by @username`

## GitHub Actions SHA maintenance

All actions in `.github/workflows/` are pinned to commit SHAs. Before shipping:
```bash
for action in actions/checkout oven-sh/setup-bun actions/upload-artifact actions/download-artifact softprops/action-gh-release gitleaks/gitleaks-action; do
  tag=$(grep -r "$action@" .github/workflows/ | head -1 | grep -o '#.*' | tr -d '# ')
  [ -n "$tag" ] && echo "$action@$tag: $(gh api repos/$action/git/ref/tags/$tag --jq .object.sha 2>/dev/null)"
done
```

## Community PR wave process

Never merge external PRs directly. Use collector branches, test the wave,
close with context, ship as one PR with `Co-Authored-By:` trailers.

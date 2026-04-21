# INGEST

Capture user-provided content (URL, text, transcript, image, agent-chat
excerpt) into the raw zone as a new markdown or attachment file. Never
touches the database or the wiki.

## Layer reach

| Layer    | Access |
|----------|--------|
| Raw zone | C      |
| DB       | —      |
| Wiki     | —      |

**Writes:** new files under `sources/ingested/**` per `K2_SCHEMA.md`
§Directory Structure. Binary attachments MAY land in `sources/assets/`
when referenced by an ingested markdown file.
**Reads:** the user-supplied payload; filesystem only to check whether a
target path is free (collision avoidance, not file contents).
**Does NOT touch:** `human/**` (human-owned), existing files under
`sources/**` (immutable from INGEST's view — see Open questions on the
daily-note append exception), any DB table, any wiki-zone directory,
anything outside the vault tree.

## Contract

Testable invariants INGEST guarantees to the rest of the skill system and
to downstream COMPILE.

- **New-file-only.** INGEST creates files. It never modifies, moves,
  renames, or deletes files that already exist. Corrections flow either
  via a new ingest, direct human edit, or COMPILE cascades — never by
  INGEST rewriting an earlier capture. The single unresolved exception is
  daily notes (see Open questions).
- **Raw-only.** INGEST touches no DB table and no file outside
  `sources/ingested/**` (plus `sources/assets/**` for referenced binaries).
  Running INGEST leaves the compiled wiki and the structured store byte-
  identical.
- **Confinement to `sources/ingested/`.** Other subtrees of `sources/`
  (clippings, legacy imports, human-arranged material) are not agent-
  writable. INGEST will refuse a path that resolves outside
  `sources/ingested/**` or `sources/assets/**`.
- **Minimal normalization.** Content is stored in its original form.
  INGEST may decode encoding headers, line-ending normalize, and wrap a
  raw payload in a markdown code fence when the payload is binary-unsafe
  text (e.g., HTML dump) — but it does not paraphrase, summarize,
  re-structure, or strip anything that affects meaning. Synthesis is
  COMPILE's job.
- **Verbatim user voice.** When the content is user-authored prose
  (agent-chat excerpts, transcripts, zettel-style notes), INGEST preserves
  capitalization, punctuation, incomplete sentences, and vivid phrasing.
  Mirrors the `originals/` rule in `K2_SCHEMA.md` §Filing Rules.
- **Checkpoint-safe.** COMPILE discovers ingested files via its ordinary
  git diff pass. INGEST does not register the file in `sources`, does not
  compute `content_hash`, and does not touch `entity_sources`. All
  DB-side bookkeeping is COMPILE's.
- **Failure is non-partial.** If INGEST cannot complete (fetch fails,
  disk write fails, path collision cannot be resolved), it leaves the raw
  zone unchanged — no stub files, no half-written markdown.
- **Stable return shape.** On success, INGEST returns the resolved
  vault-root-relative path plus a one-line summary so the user or caller
  can verify the capture without re-reading the file.

## Dependencies

### CLI ops used

None. INGEST does no DB work — the `—` in its DB layer-reach row is
load-bearing. If an implementation is tempted to call a DB op (e.g., to
pre-register the source), that's a contract breach and the op belongs in
COMPILE's phase 2 instead.

Filesystem primitives (write-once, collision detection) are library calls,
not CLI ops, and are not listed here.

### Other skills called

None. INGEST is a leaf skill and sits strictly upstream of COMPILE. The
reverse direction is forbidden: COMPILE never calls INGEST.

## Phases

Each invocation moves through these phases in order. A failure in any
phase aborts the run without writing partial state.

### 1. Classify input

**Input:** the user's payload plus an optional hint (URL, transcript,
agent-chat, clipping, note, image).
**Output:** a classification label (`url` / `text` / `transcript` /
`agent-chat` / `image` / `daily`) and any metadata extracted from the
payload (detected title, capture timestamp, MIME type).
**State change:** none.

Classification drives the target directory, filename pattern, and
normalization rules.

### 2. Resolve target path

**Input:** classification + metadata from phase 1, plus the current date.
**Output:** a single vault-root-relative path under
`sources/ingested/**` (or `sources/assets/**` for binaries). Filenames
follow `K2_SCHEMA.md` §Directory Structure conventions — e.g., daily
notes map to `sources/ingested/daily/agent-daily-YYYY-MM-DD.md`; other
ingests use a dated slug such as `sources/ingested/YYYY-MM-DD-<slug>.md`.
**State change:** none.

Rules:
- The resolved path MUST sit under `sources/ingested/**` or
  `sources/assets/**`. A path outside either tree is a caller bug and the
  run aborts.
- Slug generation strips or replaces reserved characters (case-insensitive
  filesystem safety) — rule details in Open questions.
- If the resolved path is already taken, fall back to a numeric suffix
  (`-2`, `-3`, …) rather than overwrite.

### 3. Normalize minimally

**Input:** raw payload.
**Output:** a UTF-8 text body ready to write (for markdown captures) or
an opaque binary buffer (for assets).
**State change:** none.

Allowed transforms:
- Line-ending normalization (CRLF → LF).
- Encoding detection and decode to UTF-8.
- For fetched URLs, stripping the HTTP envelope to keep the document body
  (policy on whether INGEST fetches at all is an Open question).
- Adding a minimal leading metadata block (source URL, fetch timestamp,
  speaker) when the classification has structured metadata that COMPILE
  later needs — format is an Open question; default for v1 is a short
  YAML frontmatter stub only for URL captures.

Forbidden transforms: paraphrasing, summarizing, reordering paragraphs,
stripping user quotes, normalizing capitalization of prose, or anything
that changes meaning.

### 4. Write file

**Input:** resolved path + normalized payload.
**Output:** a new file at that path.
**State change:** one new file on disk under `sources/**`.

Writes are exclusive creates — if the target path exists at write time
(race with phase 2), the run aborts without touching the existing file.

### 5. Return pointer

**Input:** the resolved path + a synthesized one-line summary of what was
captured.
**Output:** a structured response the caller can surface to the user
(path + summary + classification + any warnings).
**State change:** none.

The summary is a one-liner for human confirmation. It is NOT a compiled
synthesis — deeper understanding waits for COMPILE.

## Anti-patterns

What INGEST must NEVER do. Explicit so SKILL.md stays honest.

- **Write to `human/`.** The human zone is sacred. If the user pastes a
  zettel-style note and asks INGEST to "put it in zettel", refuse and
  suggest they drop the file into `human/zettel/` themselves.
- **Modify an existing raw zone file.** Capture-through-editing is not
  INGEST. The one open exception (daily-note append) is under Open
  questions; until that resolves, the default is "never modify".
- **Touch the DB.** No `register_source`, no `entity_sources` row, no
  `ingest_log` write. All DB-side accounting happens in COMPILE's phase 2.
- **Touch the wiki.** Category directories (`people/`, `projects/`, etc.)
  are COMPILE-rendered. INGEST has no reason to open a file under them.
- **Synthesize or summarize content.** Prose coming out of INGEST is the
  same prose that went in, minus encoding noise.
- **Overwrite on collision.** Two ingests aiming at the same filename
  produce two files (with suffixes), not one merged file. Silent
  overwrite is data loss.
- **Fan out beyond `sources/ingested/`.** Scattering ingests across
  arbitrary `sources/` subtrees (or, worse, into wiki dirs) destroys the
  clean raw/wiki separation the design is built on.
- **Invent entity links.** Link extraction is COMPILE's job. An ingested
  file that mentions "Alice" is plain text until COMPILE reads it.

## Edge cases

- **URL fetch failure.** Return the error to the caller; write nothing.
  Partial fetches are not stored even as a placeholder.
- **Binary attachment.** Write the binary to `sources/assets/<stable>.<ext>`
  with a content-hash-derived filename (so re-ingesting the same file
  detects the collision and reuses the existing asset rather than
  duplicating). The referencing markdown capture, if any, links to that
  asset path. Exact filename scheme deferred to implementation.
- **Empty payload.** Refuse. Empty files add noise for COMPILE and gain
  nothing for the user.
- **Path collision after suffix exhaustion.** Extremely rare — surface
  a hard error so the caller can investigate (likely an infinite-loop
  ingest bug upstream).
- **Daily conversational capture.** Schema §Directory Structure shows
  `agent-daily-YYYY-MM-DD.md` with "agent appends throughout day". Design
  §INGEST says "creates new files only". Treated as an Open question
  below; v1 default is "create once at the first turn of the day, then
  refuse later turns until the append policy is decided" — this is a
  conservative stand-in, not the final contract.
- **Reserved-character title (emoji, slashes, Windows-reserved names).**
  Slug-sanitize per the path-canonicalization rule (Open questions), then
  fall back to a date-only filename when the sanitized slug is empty.
- **User supplies an explicit target path.** Allowed only when the path
  resolves under `sources/ingested/**`. Paths outside that tree are
  refused, regardless of the user's intent.
- **Agent-chat excerpts with embedded images.** Write the chat as
  markdown under `sources/ingested/**` and each image as a separate
  asset under `sources/assets/**`; the markdown references the assets
  by relative path.

## Open questions

- **Daily-note append exception.** K2_SCHEMA.md and K2_DESIGN.md
  conflict: schema says the agent "appends throughout day" to
  `sources/ingested/daily/agent-daily-YYYY-MM-DD.md`, design says INGEST
  "creates new files only. Never modifies existing raw zone files." One
  must give. Three candidate resolutions:
  1. Document daily notes as the single append exception in INGEST's
     contract, and narrow the "never modify" invariant accordingly.
  2. Change the schema so each conversational turn writes a new
     timestamped file under `sources/ingested/daily/YYYY-MM-DD/HH-MM-SS.md`,
     preserving "never modify".
  3. Split into two skills: INGEST for one-shot captures, a separate
     `APPEND` (or similar) for stream-append. Re-scopes the operation
     count from 5 to 6.
  Blocks implementation of conversational ingest.
- **Path canonicalization rule.** No written policy yet for turning
  arbitrary titles into filesystem-safe slugs. Needs a rule covering
  Unicode normalization form, reserved characters on Windows/macOS,
  and case-collision handling (on case-insensitive filesystems).
- **Per-input frontmatter.** URL captures carry metadata COMPILE would
  benefit from (source URL, fetch timestamp, author). Options: a YAML
  frontmatter stub at the top of the markdown, an inline header
  paragraph, or a sidecar `.meta` file. Raw zone convention so far is
  "no wiki frontmatter" — any metadata format chosen here should stay
  out of the way of COMPILE's frontmatter handling in the wiki zone.
- **Fetch policy for URL ingest.** Does INGEST fetch the page, or just
  record the URL and let COMPILE fetch on demand? Fetch-at-ingest locks
  in a snapshot (good) but drifts from the live page (bad). Fetch-at-
  compile keeps things fresh but couples COMPILE to network availability.
  Caching strategy interacts with both.
- **`ingest_log` table.** K2_DESIGN.md §Four Primitives §Supporting
  tables names `ingest_log`, but INGEST's CRUD map has `—` on DB. Either
  the table is written by a future shim between INGEST and COMPILE, or
  the table is an artifact of an earlier design iteration and should be
  dropped. Needs a decision.
- **Notability pre-filtering at ingest time.** Some payloads are clearly
  junk (ad-heavy clips, duplicate transcripts). K2_SCHEMA.md §Notability
  Gate lives in COMPILE, but short-circuiting at ingest saves raw-zone
  clutter. Whether INGEST does any notability check — and if so, how
  conservatively — is undecided. Default for v1: capture everything,
  let COMPILE decide.

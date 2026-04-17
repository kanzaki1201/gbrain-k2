---
name: media-ingest
description: Ingest video, audio, PDF, book, screenshot, and GitHub repo content into
  the brain. Multi-format handling with entity extraction and backlink propagation.
  Covers video-ingest, youtube-ingest, and book-ingest subtypes.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - media-ingest
    related_skills:
    - enrich
    - ingest
    - query
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/media-ingest/SKILL.md
    blueprint_sha256: bf1acdba31b2e9b229afb19db1086b6cb4cefff4ac0eaa59882ec7d088b68267
    generated_from: gbrain-k2/skills
---

# Media Ingest Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `media-ingest` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- watch this video
- process this YouTube link
- ingest this PDF
- save this podcast
- process this book
- what's in this screenshot
- check out this repo
- Blueprint source: `/home/k/gbrain-k2/skills/media-ingest/SKILL.md`
- This projection keeps the source doctrine while translating execution into Hermes-standard tools and `gbrain` CLI commands.

## Quick Reference
| Need | Hermes move |
|---|---|
| Run `gbrain` commands | `terminal` |
| Read source blueprints or repo docs | `read_file` |
| Search markdown and docs | `search_files` |
| Edit local markdown or config | `patch` / `write_file` |
| Delegate a larger workflow | `delegate_task` |
| Schedule recurring checks | `cronjob` |

## Procedure
1. Read `references/blueprint.md` when exact K2 wording matters, then follow the source workflow exactly.
2. Use Hermes-native tools for execution: run `gbrain ...` through `terminal`, inspect local markdown with `read_file` and `search_files`, and patch files with `patch` or `write_file` when the task needs repository edits.
3. Keep the blueprint as the authority for filing rules, quality bar, and chaining behavior. Translate source-only tool names into Hermes capabilities instead of assuming custom GBrain tools exist inside Hermes.

### Blueprint Contract

This skill guarantees:
- Every ingested media item has a brain page with analysis (not just a transcript dump)
- Transcripts (video/audio) saved in raw and human-readable formats
- Entity extraction: every person and company mentioned gets back-linked
- Raw source files preserved via `gbrain files upload-raw`
- Filing by primary subject, not by media format

### Blueprint Phases

### Phase 1: Identify format and fetch

| Format | Action |
|--------|--------|
| YouTube/video URL | Fetch transcript (Whisper, transcription service, or captions) |
| Audio file | Transcribe with available STT service |
| PDF | Extract text (OCR if needed) |
| Book PDF | Extract text, identify chapters/sections |
| Screenshot/image | OCR via vision model, extract text and entities |
| GitHub repo | Clone, read README + key files, summarize architecture |

### Phase 2: Upload raw source

Save the original file for provenance: `gbrain files upload-raw <file> --page <slug>`

### Phase 3: Create brain page

File by primary subject (not format). Use this template:

```markdown
# {Title}

**Source:** {URL or file path}
**Format:** {video/audio/PDF/book/screenshot/repo}
**Created:** {date}

## Pitfalls
- Dumping raw transcripts without analysis
- Skipping entity extraction ("I'll do that separately")
- Filing by format (all videos in `media/videos/`) instead of by subject
- Not preserving raw source files
- Creating stub pages without meaningful content
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
Brain page created with summary, highlights, and entity cross-links. Report to user:
"Ingested {title}: {N} entities detected, {N} pages updated."
```

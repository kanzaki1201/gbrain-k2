---
name: publish
description: Share brain pages as beautiful password-protected HTML with zero LLM
  calls
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags:
    - brain
    - gbrain-k2
    - publish
    related_skills:
    - briefing
    requires_tools:
    - terminal
    - read_file
    - search_files
  gbrain:
    blueprint_path: /home/k/gbrain-k2/skills/publish/SKILL.md
    blueprint_sha256: e06b609db780a3cc93a1755a87b30ff08ffdc0fdbc834c1422b2ad2489b57497
    generated_from: gbrain-k2/skills
---

# Publish Skill — Hermes Projection

This skill is the Hermes-native projection of the GBrain K2 `publish` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.

## When to Use
Load this skill when work matches any of these blueprint triggers:
- share this page
- publish page
- create shareable link
- Blueprint source: `/home/k/gbrain-k2/skills/publish/SKILL.md`
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

- Published HTML is fully self-contained: no external dependencies, no server needed.
- All private metadata (frontmatter, source citations, confirmation numbers, brain cross-links, timeline) is stripped before publishing.
- Password protection uses AES-256-GCM with PBKDF2 key derivation; plaintext never appears in the encrypted HTML file.
- Default is always encrypted unless the user explicitly requests "open", "no password", or "public".
- External URLs (`https://...`) are preserved; only internal brain paths are stripped.

### Source Tool Intent

These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.

- `gbrain publish` -- deterministic HTML generation (no LLM calls)
- `gbrain files upload` -- upload to cloud storage (optional)
- `gbrain files signed-url` -- generate access links (optional)

## Pitfalls
- **Publishing without encryption.** Brain content is private. Default to password-protected unless the user explicitly says "open", "no password", or "public".
- **Sharing password and URL in the same channel.** Always share the password via a different channel than the URL for security.
- **Assuming the user wants raw markdown.** The publish command produces beautiful HTML. Don't copy-paste markdown when `gbrain publish` exists.
- **Including internal metadata.** Never manually share content that contains frontmatter, source citations, or timeline sections. Let the publish command strip it.
- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes.

## Verification
- Confirm the projection hash in this skill matches the current source blueprint.
- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.
- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.
- Check the expected output/report shape from the blueprint:

```text
```
PUBLISHED: [page title]
========================

File: [output path]
Encrypted: [yes (AES-256-GCM) / no]
Password: [auto-generated password / user-provided / none]
Size: [file size]

Share the file via: [email / Slack / Airdrop / cloud upload]
Share the password via: [a different channel]
```
```

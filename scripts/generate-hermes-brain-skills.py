#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path
from typing import Iterable

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPO_ROOT / "skills"
OUTPUT_ROOT = REPO_ROOT / "hermes-skills" / "brain"

SECTION_RE = re.compile(r"^##\s+(.+?)\s*$", re.M)
H1_RE = re.compile(r"^#\s+(.+?)\s*$", re.M)


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    if raw.startswith("---\n"):
        end = raw.find("\n---\n", 4)
        if end != -1:
            return yaml.safe_load(raw[4:end]) or {}, raw[end + 5 :]
    return {}, raw


def get_section(body: str, section_name: str) -> str:
    matches = list(SECTION_RE.finditer(body))
    for i, match in enumerate(matches):
        if match.group(1).strip().lower() != section_name.lower():
            continue
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        return body[start:end].strip()
    return ""


def first_h1(body: str, fallback: str) -> str:
    match = H1_RE.search(body)
    return match.group(1).strip() if match else fallback


def compact_text(text: str) -> str:
    return " ".join(text.split())


def bullet_list(items: Iterable[str]) -> str:
    return "\n".join(f"- {item}" for item in items if item)


def related_skill_names(raw: str, skill_name: str, all_names: list[str]) -> list[str]:
    found = []
    lower = raw.lower()
    for name in all_names:
        if name == skill_name:
            continue
        if name.lower() in lower:
            found.append(name)
    return sorted(set(found))[:8]


def build_skill(skill_dir: Path, all_names: list[str]) -> tuple[str, str]:
    raw = skill_dir.joinpath("SKILL.md").read_text(encoding="utf-8")
    frontmatter, body = parse_frontmatter(raw)
    name = str(frontmatter.get("name") or skill_dir.name)
    title = first_h1(body, name.replace("-", " ").title())
    description = compact_text(str(frontmatter.get("description") or ""))
    version = str(frontmatter.get("version") or "1.0.0")
    triggers = [str(item).strip() for item in (frontmatter.get("triggers") or []) if str(item).strip()]
    blueprint_sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()

    contract = get_section(body, "Contract")
    phases = get_section(body, "Phases")
    anti_patterns = get_section(body, "Anti-Patterns")
    output_format = get_section(body, "Output Format")
    tools_used = get_section(body, "Tools Used")

    metadata = {
        "hermes": {
            "tags": ["brain", "gbrain-k2", name],
            "related_skills": related_skill_names(raw, name, all_names),
            "requires_tools": ["terminal", "read_file", "search_files"],
        },
        "gbrain": {
            "blueprint_path": str(skill_dir / "SKILL.md"),
            "blueprint_sha256": blueprint_sha,
            "generated_from": "gbrain-k2/skills",
        },
    }

    fm = {
        "name": name,
        "description": description or f"Hermes-native projection of the GBrain K2 {name} workflow.",
        "version": version,
        "author": "Hermes Agent",
        "license": "MIT",
        "metadata": metadata,
    }

    when_to_use = []
    if triggers:
        when_to_use.append("Load this skill when work matches any of these blueprint triggers:")
        when_to_use.extend(f"- {trigger}" for trigger in triggers)
    else:
        when_to_use.append(f"Load this skill when the `{name}` workflow from GBrain K2 is the right fit.")
    when_to_use.extend(
        [
            f"- Blueprint source: `{skill_dir / 'SKILL.md'}`",
            "- This projection keeps the source doctrine while translating execution into Hermes-standard tools and `gbrain` CLI commands.",
        ]
    )

    quick_reference = "\n".join(
        [
            "| Need | Hermes move |",
            "|---|---|",
            "| Run `gbrain` commands | `terminal` |",
            "| Read source blueprints or repo docs | `read_file` |",
            "| Search markdown and docs | `search_files` |",
            "| Edit local markdown or config | `patch` / `write_file` |",
            "| Delegate a larger workflow | `delegate_task` |",
            "| Schedule recurring checks | `cronjob` |",
        ]
    )

    procedure_parts = [
        "1. Read `references/blueprint.md` when exact K2 wording matters, then follow the source workflow exactly.",
        "2. Use Hermes-native tools for execution: run `gbrain ...` through `terminal`, inspect local markdown with `read_file` and `search_files`, and patch files with `patch` or `write_file` when the task needs repository edits.",
        "3. Keep the blueprint as the authority for filing rules, quality bar, and chaining behavior. Translate source-only tool names into Hermes capabilities instead of assuming custom GBrain tools exist inside Hermes.",
    ]
    if contract:
        procedure_parts.append("\n### Blueprint Contract\n")
        procedure_parts.append(contract)
    if phases:
        procedure_parts.append("\n### Blueprint Phases\n")
        procedure_parts.append(phases)
    if tools_used:
        procedure_parts.append("\n### Source Tool Intent\n")
        procedure_parts.append(
            "These are the operations the original blueprint expects. In Hermes, execute them through `gbrain` CLI commands in `terminal` or local file tools.\n"
        )
        procedure_parts.append(tools_used)

    pitfalls = anti_patterns.strip() if anti_patterns.strip() else bullet_list(
        [
            "Skipping the source blueprint before acting on a nuanced brain workflow",
            "Assuming custom GBrain tool names exist directly in Hermes",
            "Performing broad batch edits before validating a small sample",
        ]
    )
    if "drift" not in pitfalls.lower():
        pitfalls += "\n- Letting the Hermes projection drift from the blueprint. Run the blueprint audit whenever `gbrain-k2/skills/` changes."

    verification = [
        "- Confirm the projection hash in this skill matches the current source blueprint.",
        "- Run `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` to verify blueprint parity and Hermes section conformance.",
        "- When the task touched the brain itself, validate the result with the relevant `gbrain` CLI command before reporting success.",
    ]
    if output_format:
        verification.append("- Check the expected output/report shape from the blueprint:")
        verification.append("")
        verification.append("```text")
        verification.append(output_format)
        verification.append("```")

    skill_md = "\n".join(
        [
            "---",
            yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip(),
            "---",
            "",
            f"# {title} — Hermes Projection",
            "",
            f"This skill is the Hermes-native projection of the GBrain K2 `{name}` blueprint. Use it to keep Hermes aligned with the source workflow while executing through Hermes-standard tools.",
            "",
            "## When to Use",
            *when_to_use,
            "",
            "## Quick Reference",
            quick_reference,
            "",
            "## Procedure",
            *procedure_parts,
            "",
            "## Pitfalls",
            pitfalls,
            "",
            "## Verification",
            *verification,
            "",
        ]
    )
    return skill_md, raw


def build_blueprint_audit_skill() -> str:
    fm = {
        "name": "blueprint-audit",
        "description": "Audit Hermes brain projections against the gbrain-k2 blueprints and regenerate them when drift appears.",
        "version": "1.0.0",
        "author": "Hermes Agent",
        "license": "MIT",
        "metadata": {
            "hermes": {
                "tags": ["brain", "gbrain-k2", "audit", "projection"],
                "related_skills": ["testing", "update-k2"],
                "requires_tools": ["terminal", "read_file", "search_files"],
            }
        },
    }
    return "\n".join(
        [
            "---",
            yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip(),
            "---",
            "",
            "# Blueprint Audit",
            "",
            "## When to Use",
            "Use this skill when you need Hermes to compare the generated brain skills against `~/gbrain-k2/skills/` and report or fix drift.",
            "",
            "## Quick Reference",
            "| Need | Command |",
            "|---|---|",
            "| Audit only | `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` |",
            "| Audit + regenerate | `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py --fix` |",
            "| Regenerate all projections | `python ~/gbrain-k2/scripts/generate-hermes-brain-skills.py` |",
            "",
            "## Procedure",
            "1. Run the audit script first.",
            "2. If hashes or generated files drifted, rerun with `--fix` to regenerate projections from the blueprints.",
            "3. Re-run the audit and confirm a clean result before reporting success.",
            "4. When Hermes skill discovery should use the projections, confirm `skills.external_dirs` includes `~/gbrain-k2/hermes-skills`.",
            "",
            "## Pitfalls",
            "- Auditing the mirrored legacy skills in `~/.hermes/skills/brain` instead of the generated external skillpack",
            "- Reporting drift without re-running the audit after regeneration",
            "- Forgetting that `~/gbrain-k2/skills/` remains the source of truth",
            "",
            "## Verification",
            "- `python ~/gbrain-k2/scripts/audit-hermes-brain-skills.py` exits successfully",
            "- The report states every projection hash matches its blueprint",
            "- `skills_list(category=\"brain\")` shows the external projection pack in a fresh Hermes session",
            "",
        ]
    )


def main() -> None:
    source_skill_dirs = [p for p in sorted(SOURCE_ROOT.iterdir()) if p.is_dir() and (p / 'SKILL.md').exists()]
    all_names = [p.name for p in source_skill_dirs]

    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    for skill_dir in source_skill_dirs:
        skill_md, raw_blueprint = build_skill(skill_dir, all_names)
        out_dir = OUTPUT_ROOT / skill_dir.name
        (out_dir / 'references').mkdir(parents=True, exist_ok=True)
        (out_dir / 'SKILL.md').write_text(skill_md, encoding='utf-8')
        (out_dir / 'references' / 'blueprint.md').write_text(raw_blueprint, encoding='utf-8')

    audit_dir = OUTPUT_ROOT / 'blueprint-audit'
    if audit_dir.exists():
        (audit_dir / 'references').mkdir(parents=True, exist_ok=True)
        (audit_dir / 'references' / 'paths.md').write_text(
            "\n".join(
                [
                    "- Generator: `~/gbrain-k2/scripts/generate-hermes-brain-skills.py`",
                    "- Audit: `~/gbrain-k2/scripts/audit-hermes-brain-skills.py`",
                    "- Projection root: `~/gbrain-k2/hermes-skills/brain/`",
                    "- Blueprint root: `~/gbrain-k2/skills/`",
                    "- Reports: `~/gbrain-k2/reports/hermes-skill-audits/`",
                    "",
                ]
            ),
            encoding='utf-8',
        )

    print(f"Generated {len(source_skill_dirs)} brain projections under {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()

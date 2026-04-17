#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
import re

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPO_ROOT / "skills"
PROJECTION_ROOT = REPO_ROOT / "hermes-skills" / "brain"
REPORT_ROOT = REPO_ROOT / "reports" / "hermes-skill-audits"
SECTION_RE = re.compile(r"^##\s+(.+?)\s*$", re.M)


def parse_frontmatter(raw: str) -> tuple[dict, str]:
    if raw.startswith("---\n"):
        end = raw.find("\n---\n", 4)
        if end != -1:
            return yaml.safe_load(raw[4:end]) or {}, raw[end + 5 :]
    return {}, raw


def section_titles(body: str) -> list[str]:
    return [m.group(1).strip() for m in SECTION_RE.finditer(body)]


def blueprint_sha(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def audit_projection() -> dict:
    expected = {
        p.name: p / "SKILL.md"
        for p in sorted(SOURCE_ROOT.iterdir())
        if p.is_dir() and (p / "SKILL.md").exists()
    }
    projections = {
        p.name: p / "SKILL.md"
        for p in sorted(PROJECTION_ROOT.iterdir())
        if p.is_dir() and (p / "SKILL.md").exists()
    }

    missing = sorted(set(expected) - set(projections))
    extra = sorted(set(projections) - set(expected))
    issues: list[str] = []
    checked = []

    required_sections = ["When to Use", "Quick Reference", "Procedure", "Pitfalls", "Verification"]

    for name, source_path in expected.items():
        projection_path = projections.get(name)
        if not projection_path:
            continue
        projection_raw = projection_path.read_text(encoding="utf-8")
        projection_fm, projection_body = parse_frontmatter(projection_raw)
        actual_sha = blueprint_sha(source_path)
        declared_sha = (
            (((projection_fm.get("metadata") or {}).get("gbrain") or {}).get("blueprint_sha256"))
            or ""
        )
        titles = section_titles(projection_body)
        missing_sections = [section for section in required_sections if section not in titles]
        if declared_sha != actual_sha:
            issues.append(
                f"{name}: blueprint hash mismatch (declared={declared_sha or 'missing'} actual={actual_sha})"
            )
        if missing_sections:
            issues.append(f"{name}: missing Hermes sections -> {', '.join(missing_sections)}")
        checked.append(name)

    status = "clean" if not (missing or extra or issues) else "drift"
    return {
        "status": status,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "repo_root": str(REPO_ROOT),
        "projection_root": str(PROJECTION_ROOT),
        "checked": checked,
        "missing_projections": missing,
        "extra_projections": extra,
        "issues": issues,
    }


def write_report(report: dict) -> Path:
    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = REPORT_ROOT / f"{ts}-brain-skill-audit.md"
    lines = [
        "# Hermes Brain Skill Audit",
        "",
        f"- Time: {report['timestamp']}",
        f"- Status: {report['status']}",
        f"- Repo: `{report['repo_root']}`",
        f"- Projection root: `{report['projection_root']}`",
        f"- Skills checked: {len(report['checked'])}",
        "",
    ]
    if report["missing_projections"]:
        lines.append("## Missing projections")
        lines.extend(f"- {item}" for item in report["missing_projections"])
        lines.append("")
    if report["extra_projections"]:
        lines.append("## Extra projections")
        lines.extend(f"- {item}" for item in report["extra_projections"])
        lines.append("")
    if report["issues"]:
        lines.append("## Issues")
        lines.extend(f"- {item}" for item in report["issues"])
        lines.append("")
    if not (report["missing_projections"] or report["extra_projections"] or report["issues"]):
        lines.append("## Result")
        lines.append("All Hermes brain projections match the current gbrain-k2 blueprints.")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def maybe_fix(enabled: bool) -> None:
    if not enabled:
        return
    subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "generate-hermes-brain-skills.py")],
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit Hermes brain skill projections against gbrain-k2 blueprints.")
    parser.add_argument("--fix", action="store_true", help="Regenerate projections before re-running the audit")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of a human summary")
    parser.add_argument("--write-report", action="store_true", help="Write a markdown report under reports/hermes-skill-audits")
    args = parser.parse_args()

    maybe_fix(args.fix)
    report = audit_projection()
    report_path = write_report(report) if args.write_report else None
    if report_path:
        report["report_path"] = str(report_path)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Status: {report['status']}")
        print(f"Checked: {len(report['checked'])}")
        if report["missing_projections"]:
            print("Missing projections:")
            for item in report["missing_projections"]:
                print(f"  - {item}")
        if report["extra_projections"]:
            print("Extra projections:")
            for item in report["extra_projections"]:
                print(f"  - {item}")
        if report["issues"]:
            print("Issues:")
            for item in report["issues"]:
                print(f"  - {item}")
        if report_path:
            print(f"Report: {report_path}")

    return 0 if report["status"] == "clean" else 1


if __name__ == "__main__":
    raise SystemExit(main())

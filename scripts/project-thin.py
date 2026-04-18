#!/usr/bin/env python3
"""Generate thin Hermes projections from ~/gbrain-k2/skills/.

Each Hermes skill is a tiny YAML frontmatter + one-line pointer to the
canonical source skill. See skills/project-hermes-skills/SKILL.md for the
design rationale.

Usage:
  ./project-thin.py [--source DIR] [--dest DIR] [--dry-run]
"""

import argparse
import re
import shutil
import sys
from pathlib import Path

DEFAULT_SOURCE = Path.home() / "gbrain-k2" / "skills"
DEFAULT_DEST = Path.home() / ".hermes" / "skills" / "brain"

# Skills that are Hermes-owned wrappers, never reproject them
SKIP_SKILLS = {"run-project-hermes-skills"}

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)


def parse_frontmatter(text: str) -> tuple[str, str]:
    """Return (frontmatter_yaml, body). frontmatter without --- delimiters."""
    m = FRONTMATTER_RE.match(text)
    if not m:
        return "", text
    return m.group(1), text[m.end():]


def extract_field(fm: str, field: str) -> str:
    """Extract a top-level YAML field value. Supports scalars and block scalars."""
    lines = fm.split("\n")
    for i, line in enumerate(lines):
        if line.startswith(f"{field}:"):
            rest = line[len(field) + 1:].strip()
            if rest == "|" or rest == ">":
                # Block scalar — collect indented lines
                block = []
                j = i + 1
                while j < len(lines) and (lines[j].startswith("  ") or lines[j].strip() == ""):
                    if lines[j].strip() == "":
                        block.append("")
                    else:
                        block.append(lines[j][2:] if lines[j].startswith("  ") else lines[j].lstrip())
                    j += 1
                return "\n".join(block).strip()
            return rest
    return ""


def extract_list_field(fm: str, field: str) -> list[str]:
    """Extract a YAML list field (one per line with `- `)."""
    lines = fm.split("\n")
    out = []
    in_field = False
    for line in lines:
        if line.startswith(f"{field}:"):
            rest = line[len(field) + 1:].strip()
            if rest.startswith("["):
                # Inline list — e.g. tools: [bash]
                return [x.strip() for x in rest.strip("[]").split(",") if x.strip()]
            in_field = True
            continue
        if in_field:
            if line.startswith("  - "):
                out.append(line[4:].strip())
            elif line.startswith("- "):
                out.append(line[2:].strip())
            elif line and not line.startswith(" "):
                break
    return out


def generate_projection(source_skill_path: Path, skill_name: str) -> str:
    """Build the thin projection content."""
    src_text = source_skill_path.read_text(encoding="utf-8")
    fm, _ = parse_frontmatter(src_text)

    name = extract_field(fm, "name") or skill_name
    version = extract_field(fm, "version") or "1.0.0"
    description = extract_field(fm, "description") or f"Skill: {name}"
    triggers = extract_list_field(fm, "triggers")
    mutating = extract_field(fm, "mutating") or "false"

    # Format description as block scalar (preserving multi-line if present)
    desc_lines = description.strip().split("\n")
    if len(desc_lines) == 1:
        desc_block = f"description: {desc_lines[0]}"
    else:
        desc_block = "description: |\n" + "\n".join(f"  {line}" for line in desc_lines)

    trigger_block = "triggers:\n" + "\n".join(f"  - {t}" for t in triggers) if triggers else "triggers: []"

    projection = f"""---
name: {name}
version: {version}
{desc_block}
{trigger_block}
tools:
  - bash
mutating: {mutating}
---

# {name} (thin projection)

Read `~/gbrain-k2/skills/{skill_name}/SKILL.md` and follow it end to end.

```bash
cat ~/gbrain-k2/skills/{skill_name}/SKILL.md
```
"""
    return projection


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    source = args.source.resolve()
    dest = args.dest.resolve()

    if not source.is_dir():
        print(f"ERROR: source not found: {source}", file=sys.stderr)
        sys.exit(1)

    dest.mkdir(parents=True, exist_ok=True)

    projected = []
    skipped = []
    removed = []

    # Generate thin projections for each source skill
    for skill_dir in sorted(source.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            continue
        skill_name = skill_dir.name
        if skill_name in SKIP_SKILLS:
            skipped.append(skill_name)
            continue

        projection = generate_projection(skill_md, skill_name)
        dest_dir = dest / skill_name
        dest_md = dest_dir / "SKILL.md"

        if not args.dry_run:
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_md.write_text(projection, encoding="utf-8")
            # Remove any old references/ subdir left over from v1.x mirror
            old_refs = dest_dir / "references"
            if old_refs.exists():
                shutil.rmtree(old_refs)
                removed.append(f"{skill_name}/references/")
        projected.append(skill_name)

    # Copy RESOLVER.md verbatim
    resolver_src = source / "RESOLVER.md"
    resolver_dst = dest / "RESOLVER.md"
    if resolver_src.exists():
        if not args.dry_run:
            shutil.copy2(resolver_src, resolver_dst)
        projected.append("RESOLVER.md")

    # Copy conventions/ verbatim
    conv_src = source / "conventions"
    conv_dst = dest / "conventions"
    if conv_src.is_dir():
        if not args.dry_run:
            if conv_dst.exists():
                shutil.rmtree(conv_dst)
            shutil.copytree(conv_src, conv_dst)
        projected.append("conventions/")

    # Copy shared reference files (like _brain-filing-rules.md, RESOLVER.md)
    for shared_name in ["_brain-filing-rules.md", "_output-rules.md"]:
        shared_src = source / shared_name
        shared_dst = dest / shared_name
        if shared_src.exists():
            if not args.dry_run:
                shutil.copy2(shared_src, shared_dst)
            projected.append(shared_name)

    print(f"Source: {source}")
    print(f"Dest:   {dest}")
    print(f"Mode:   {'dry-run' if args.dry_run else 'WRITE'}")
    print()
    print(f"Projected {len([p for p in projected if not p.endswith('/') and not p.endswith('.md') or p == 'RESOLVER.md'])} skill frontmatters")
    for p in projected:
        print(f"  ✓ {p}")
    if skipped:
        print("\nSkipped (Hermes-owned):")
        for s in skipped:
            print(f"  - {s}")
    if removed:
        print("\nRemoved legacy mirror artifacts:")
        for r in removed:
            print(f"  - {r}")


if __name__ == "__main__":
    main()

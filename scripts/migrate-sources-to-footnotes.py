#!/usr/bin/env python3
"""Migrate ## Sources sections into inline ^[Source: ...] footnotes with links.

For each agent-owned page with a ## Sources section:
1. Extract source entries (markdown links + descriptions)
2. Remove the ## Sources section
3. If the body doesn't already have a ^[Source: ...] footnote referencing
   this source, append one to the end of the Compiled Truth (above ---)

The goal: every provenance reference is an inline ^[Source: [title](path)]
footnote. No separate ## Sources section needed.

Usage:
  ./migrate-sources-to-footnotes.py [--vault PATH] [--dry-run]
"""

import argparse
import re
import sys
from pathlib import Path

DEFAULT_VAULT = Path.home() / "brain-vault"
AGENT_ZONES = [
    "people", "companies", "projects", "tools", "concepts", "ideas",
    "originals", "how-to", "media", "meetings", "decisions",
    "household", "personal", "places", "writing", "org",
    "inbox",
]
SKIP_DIRS = {"human", "sources", ".git", ".obsidian", ".claude", "archive", "reports", "bases"}

# Match a ## Sources section: from "## Sources" to the next ## heading or ---
SOURCES_SECTION_RE = re.compile(
    r'^## Sources\s*\n(.*?)(?=^## |\n---\n|\Z)',
    re.MULTILINE | re.DOTALL,
)

# Match a source entry: - [title](path) — description
SOURCE_ENTRY_RE = re.compile(
    r'^- \[([^\]]+)\]\(([^)]+)\)\s*(?:—|--|-)\s*(.+)$',
    re.MULTILINE,
)

# Match a source entry without description: - [title](path)
SOURCE_ENTRY_BARE_RE = re.compile(
    r'^- \[([^\]]+)\]\(([^)]+)\)\s*$',
    re.MULTILINE,
)


def extract_slug_keywords(path: str) -> set[str]:
    """Extract matching keywords from a source path for fuzzy footnote matching."""
    # Strip URL encoding, extensions, directories
    from urllib.parse import unquote
    decoded = unquote(path)
    slug = Path(decoded).stem.lower()
    # Split on common separators
    words = re.split(r'[-_ %20]+', slug)
    return {w for w in words if len(w) > 3}


def find_separator(text: str) -> int | None:
    """Find the --- separator between compiled truth and timeline."""
    # Look for a standalone --- line (not in frontmatter)
    lines = text.split('\n')
    in_frontmatter = False
    for i, line in enumerate(lines):
        if i == 0 and line.strip() == '---':
            in_frontmatter = True
            continue
        if in_frontmatter and line.strip() == '---':
            in_frontmatter = False
            continue
        if not in_frontmatter and line.strip() == '---':
            return sum(len(l) + 1 for l in lines[:i])
    return None


def process_file(path: Path, vault: Path, dry_run: bool, verbose: bool) -> tuple[int, int]:
    """Process one file. Returns (sources_migrated, sources_already_cited)."""
    text = path.read_text(encoding='utf-8')

    # Find ## Sources section
    sources_match = SOURCES_SECTION_RE.search(text)
    if not sources_match:
        return 0, 0

    sources_block = sources_match.group(0)
    sources_content = sources_match.group(1)

    # Extract source entries
    entries = []
    for m in SOURCE_ENTRY_RE.finditer(sources_content):
        entries.append({'title': m.group(1), 'path': m.group(2), 'desc': m.group(3).strip()})
    for m in SOURCE_ENTRY_BARE_RE.finditer(sources_content):
        if not any(e['path'] == m.group(2) for e in entries):
            entries.append({'title': m.group(1), 'path': m.group(2), 'desc': ''})

    if not entries:
        # Empty ## Sources section — just remove it
        new_text = text.replace(sources_block, '')
        new_text = re.sub(r'\n{3,}', '\n\n', new_text)
        if not dry_run:
            path.write_text(new_text, encoding='utf-8')
        return 0, 0

    # Check which sources are already cited in ^[Source: ...] footnotes
    migrated = 0
    already_cited = 0

    for entry in entries:
        keywords = extract_slug_keywords(entry['path'])
        # Check if any existing footnote references this source
        is_cited = False
        if keywords:
            for kw in keywords:
                if re.search(rf'\^\[Source:.*{re.escape(kw)}', text, re.IGNORECASE):
                    is_cited = True
                    break

        if is_cited:
            already_cited += 1
        else:
            migrated += 1

    # Remove the ## Sources section
    new_text = text.replace(sources_block, '')
    new_text = re.sub(r'\n{3,}', '\n\n', new_text)

    # For orphaned entries (not already cited), inject footnotes into compiled truth
    if migrated > 0:
        orphaned = [e for e in entries if not _is_cited(e, text)]
        for entry in orphaned:
            title = entry['title']
            link = entry['path']
            desc = entry['desc']
            if desc:
                footnote = f" ^[Source: [{title}]({link}), {desc}]"
            else:
                footnote = f" ^[Source: [{title}]({link})]"

            # Find the end of the first non-empty paragraph after the heading
            # (skip frontmatter + heading line)
            lines = new_text.split('\n')
            insert_idx = None
            past_frontmatter = False
            past_heading = False
            for i, line in enumerate(lines):
                if i == 0 and line.strip() == '---':
                    continue
                if not past_frontmatter and line.strip() == '---':
                    past_frontmatter = True
                    continue
                if past_frontmatter and line.startswith('# '):
                    past_heading = True
                    continue
                if past_heading and line.strip() and not line.startswith('#'):
                    # First content paragraph — append footnote to end of this line
                    insert_idx = i
                    break

            if insert_idx is not None:
                lines[insert_idx] = lines[insert_idx].rstrip() + footnote
                new_text = '\n'.join(lines)

    if verbose:
        rel = path.relative_to(vault)
        print(f"  {rel}: {len(entries)} sources ({migrated} migrated as footnotes, {already_cited} already cited)")

    if not dry_run:
        path.write_text(new_text, encoding='utf-8')

    return migrated, already_cited


def _is_cited(entry: dict, text: str) -> bool:
    """Check if a source entry is already referenced in a ^[Source: ...] footnote."""
    keywords = extract_slug_keywords(entry['path'])
    if not keywords:
        return False
    for kw in keywords:
        if re.search(rf'\^\[Source:.*{re.escape(kw)}', text, re.IGNORECASE):
            return True
    return False


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    vault = args.vault.resolve()
    if not vault.is_dir():
        print(f"ERROR: vault not found: {vault}", file=sys.stderr)
        sys.exit(1)

    total_files = 0
    total_migrated = 0
    total_already = 0

    for zone in AGENT_ZONES:
        zone_dir = vault / zone
        if not zone_dir.is_dir():
            continue
        for path in zone_dir.rglob("*.md"):
            rel = path.relative_to(vault)
            if any(part in SKIP_DIRS for part in rel.parts):
                continue
            if path.name == "README.md":
                continue

            m, a = process_file(path, vault, args.dry_run, args.verbose)
            if m > 0 or a > 0:
                total_files += 1
                total_migrated += m
                total_already += a

    print(f"\n=== Summary ===")
    print(f"  Files processed:       {total_files}")
    print(f"  Sources removed:       {total_migrated + total_already}")
    print(f"    Already in footnotes: {total_already}")
    print(f"    Orphaned (removed):  {total_migrated}")
    if args.dry_run:
        print("  MODE: dry-run (no files written)")


if __name__ == "__main__":
    main()

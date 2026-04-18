#!/usr/bin/env python3
"""Convert entity wikilinks in agent-owned zones to markdown links.

Per K2_SCHEMA §4: agent-written pages use `[Name](../category/slug.md)`
for entity refs. `[[YYYY-MM-DD]]` wikilinks are reserved for date stubs.

This script:
  1. Indexes all .md files by basename (and by alias if frontmatter has one).
  2. Scans agent-owned zones for wikilinks.
  3. For each wikilink, resolves to the target file and rewrites:
       [[foo]]          → [foo](../category/foo.md)
       [[foo|Display]]  → [Display](../category/foo.md)
       [[foo#section]]  → [foo](../category/foo.md#section)
  4. Leaves alone:
       [[YYYY-MM-DD]]   — date stubs (per schema)
       [[YYYY]]         — year stubs
       [[YYYY-MM]]      — month stubs
       [[YYYY-MM-XX]]   — partial-date stubs
     Unresolvable wikilinks (no matching .md file) — flagged, not rewritten.

Safety:
  - `--dry-run` prints proposed changes without writing.
  - Skips human/, sources/, .git/, .obsidian/, .claude/ per K2_SCHEMA.
  - Atomic per-file rewrite.

Usage:
  ./fix-wikilinks.py [--vault PATH] [--dry-run] [--verbose]
"""

import argparse
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_VAULT = Path.home() / "brain-vault"
AGENT_ZONES = [
    "people", "companies", "projects", "tools", "concepts", "ideas",
    "originals", "how-to", "media", "meetings", "decisions",
    "household", "personal", "places", "writing", "org",
    "archive", "inbox",
]
SKIP_DIRS = {"human", "sources", ".git", ".obsidian", ".claude", "bases", "reports"}

DATE_STUB_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2}|-XX)?|-XX-XX)?$")
WIKILINK_RE = re.compile(r"\[\[([^\]\|#^]+)(#[^\]\|]+)?(\|[^\]]+)?\]\]")


def is_date_stub(target: str) -> bool:
    return bool(DATE_STUB_RE.match(target.strip()))


def build_index(vault: Path) -> dict:
    """basename (lowercase, no .md) → list of paths."""
    index: dict = defaultdict(list)
    for path in vault.rglob("*.md"):
        rel = path.relative_to(vault)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        basename = path.stem
        index[basename.lower()].append(path)
        # Also index hyphen/space variants
        index[basename.lower().replace("-", " ")].append(path)
        index[basename.lower().replace(" ", "-")].append(path)
    return index


def resolve_wikilink(target: str, index: dict) -> Path | None:
    """Find target .md file by best match. Returns None if no unique match."""
    t = target.strip().lower()
    candidates = index.get(t) or index.get(t.replace("-", " ")) or index.get(t.replace(" ", "-"))
    if not candidates:
        return None
    # Deduplicate
    uniq = list({p.resolve() for p in candidates})
    if len(uniq) == 1:
        return uniq[0]
    # Multiple matches — pick the non-archive, non-inbox one if possible
    preferred = [p for p in uniq if "archive" not in p.parts and "inbox" not in p.parts]
    if len(preferred) == 1:
        return preferred[0]
    # Ambiguous
    return None


def build_replacement(source_path: Path, target_path: Path, display: str, section: str) -> str:
    """Compute relative-path markdown link from source to target."""
    rel = os.path.relpath(target_path, source_path.parent)
    rel = rel.replace(os.sep, "/")  # POSIX path separators
    section_suffix = section if section else ""
    return f"[{display}]({rel}{section_suffix})"


def process_file(
    path: Path, index: dict, vault: Path, dry_run: bool, verbose: bool
) -> tuple[int, int, int, int, list]:
    """Returns (converted, skipped_date, skipped_self, unresolved, unresolved_samples)."""
    converted = 0
    skipped_date = 0
    skipped_self = 0
    unresolved = 0
    unresolved_samples = []

    text = path.read_text(encoding="utf-8")
    new_text = text

    def replace_one(m: re.Match) -> str:
        nonlocal converted, skipped_date, skipped_self, unresolved, unresolved_samples
        target = m.group(1)
        section = m.group(2) or ""
        alias = m.group(3)[1:] if m.group(3) else None

        if is_date_stub(target):
            skipped_date += 1
            return m.group(0)

        target_path = resolve_wikilink(target, index)
        if target_path is None:
            unresolved += 1
            if len(unresolved_samples) < 5:
                unresolved_samples.append(f"[[{target}{section}{'|'+alias if alias else ''}]]")
            return m.group(0)

        # Self-reference: page linking to itself. Replace with plain text (display or target).
        if target_path.resolve() == path.resolve():
            display = alias if alias else target
            skipped_self += 1
            if verbose:
                print(f"  {path.relative_to(vault)}: [[{target}]] → {display}  (self-ref, removed brackets)")
            return display

        display = alias if alias else target
        replacement = build_replacement(path, target_path, display, section)
        converted += 1
        if verbose:
            print(f"  {path.relative_to(vault)}: [[{target}]] → {replacement}")
        return replacement

    new_text = WIKILINK_RE.sub(replace_one, text)
    if new_text != text and not dry_run:
        path.write_text(new_text, encoding="utf-8")

    return converted, skipped_date, skipped_self, unresolved, unresolved_samples


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    ap.add_argument("--dry-run", action="store_true", help="Print without writing")
    ap.add_argument("--verbose", action="store_true", help="Per-replacement output")
    args = ap.parse_args()

    vault = args.vault.resolve()
    if not vault.is_dir():
        print(f"ERROR: vault not found: {vault}", file=sys.stderr)
        sys.exit(1)

    print(f"Vault: {vault}")
    print("Building basename index...")
    index = build_index(vault)
    print(f"  indexed {sum(len(v) for v in index.values())} entries across {len(index)} keys\n")

    total_converted = 0
    total_skipped_date = 0
    total_skipped_self = 0
    total_unresolved = 0
    files_touched = 0
    unresolved_samples_all = []

    for zone in AGENT_ZONES:
        zone_dir = vault / zone
        if not zone_dir.is_dir():
            continue
        for path in zone_dir.rglob("*.md"):
            rel = path.relative_to(vault)
            if any(part in SKIP_DIRS for part in rel.parts):
                continue
            c, sd, ss, u, samples = process_file(path, index, vault, args.dry_run, args.verbose)
            total_converted += c
            total_skipped_date += sd
            total_skipped_self += ss
            total_unresolved += u
            if c > 0 or ss > 0:
                files_touched += 1
            for s in samples:
                if len(unresolved_samples_all) < 20 and s not in unresolved_samples_all:
                    unresolved_samples_all.append(s)

    print("\n=== Summary ===")
    print(f"  Converted wikilinks:    {total_converted}  ([[x]] → [x](path/x.md))")
    print(f"  Self-refs de-bracketed: {total_skipped_self}  ([[x]] → x, inside x.md itself)")
    print(f"  Date-stub wikilinks:    {total_skipped_date}  (left alone, schema-compliant)")
    print(f"  Unresolved wikilinks:   {total_unresolved}  (no matching .md file, left alone)")
    print(f"  Files modified:         {files_touched}")
    if args.dry_run:
        print("  MODE: dry-run (no files written)")
    if unresolved_samples_all:
        print("\nSample unresolved wikilinks (no .md target found):")
        for s in unresolved_samples_all[:20]:
            print(f"  {s}")


if __name__ == "__main__":
    main()

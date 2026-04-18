#!/usr/bin/env bash
# Convert [Source: ...] citations to ^[Source: ...] footnotes in brain-vault.
# Safe to run multiple times — skips files that already use ^[Source: format
# and won't double-convert.
#
# Usage: ./convert-citations.sh [brain-vault-path]

set -euo pipefail

VAULT="${1:-$HOME/brain-vault}"

if [ ! -d "$VAULT" ]; then
  echo "ERROR: vault not found at $VAULT" >&2
  exit 1
fi

converted=0
skipped=0
total_citations=0

while IFS= read -r -d '' file; do
  # Skip files inside .obsidian, .git, .claude
  case "$file" in
    */.obsidian/*|*/.git/*|*/.claude/*) continue ;;
  esac

  # Check if file has old-format citations (not already ^[Source:)
  old_count=$(grep -c '\[Source:' "$file" 2>/dev/null || true)
  already=$(grep -c '\^\[Source:' "$file" 2>/dev/null || true)

  if [ "$old_count" -eq 0 ]; then
    continue
  fi

  # Avoid files where all citations are already converted
  if [ "$old_count" -eq 0 ] && [ "$already" -gt 0 ]; then
    skipped=$((skipped + 1))
    continue
  fi

  # Convert: [Source: ...] → ^[Source: ...]
  # Match [Source: that is NOT preceded by ^ (avoid double-convert)
  sed -i 's/\([^^]\)\[Source:/\1^[Source:/g; s/^\[Source:/^[Source:/g' "$file"

  new_count=$(grep -c '\^\[Source:' "$file" 2>/dev/null || true)
  total_citations=$((total_citations + new_count))
  converted=$((converted + 1))

done < <(find "$VAULT" -name "*.md" -type f -print0)

echo "Done."
echo "  Files converted: $converted"
echo "  Citations converted: $total_citations"
echo "  Files skipped (already clean): $skipped"

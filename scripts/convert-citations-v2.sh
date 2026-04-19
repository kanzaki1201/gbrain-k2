#!/usr/bin/env bash
# Convert citation format in brain-vault agent-owned zones:
# 1. ^[Source: ...] → ^[...] (drop Source: prefix)
# 2. Remove ## Sources sections
# 3. Convert bare dates YYYY-MM-DD inside ^[...] to [[YYYY-MM-DD]]
#
# Usage: ./convert-citations-v2.sh [brain-vault-path]

set -euo pipefail

VAULT="${1:-$HOME/brain-vault}"

if [ ! -d "$VAULT" ]; then
  echo "ERROR: vault not found at $VAULT" >&2
  exit 1
fi

source_dropped=0
sections_removed=0
dates_converted=0
files_touched=0

while IFS= read -r -d '' file; do
  case "$file" in
    */.obsidian/*|*/.git/*|*/.claude/*|*/human/*|*/sources/*) continue ;;
  esac

  changed=false

  # 1. Drop "Source: " prefix from ^[Source: ...]
  if grep -q '\^\[Source: ' "$file" 2>/dev/null; then
    sed -i 's/\^\[Source: /\^[/g' "$file"
    source_dropped=$((source_dropped + 1))
    changed=true
  fi

  # 2. Remove ## Sources sections (from ## Sources to next ## or --- or EOF)
  if grep -q '^## Sources' "$file" 2>/dev/null; then
    # Use perl for multi-line removal
    perl -i -0pe 's/\n## Sources\n.*?(?=\n## |\n---\n|\z)//s' "$file"
    sections_removed=$((sections_removed + 1))
    changed=true
  fi

  # 3. Convert bare dates inside ^[...] to [[YYYY-MM-DD]]
  # Match YYYY-MM-DD that's NOT already inside [[ ]]
  if grep -qP '\^\[.*\d{4}-\d{2}-\d{2}(?!\])' "$file" 2>/dev/null; then
    # Only convert dates inside ^[...] context, not elsewhere
    perl -i -pe '
      # For lines containing ^[, convert bare dates to wikilink dates
      if (/\^\[/) {
        s/(?<!\[)(\d{4}-\d{2}-\d{2})(?!\])/[[$1]]/g;
      }
    ' "$file"
    dates_converted=$((dates_converted + 1))
    changed=true
  fi

  if $changed; then
    files_touched=$((files_touched + 1))
  fi

done < <(find "$VAULT" -name "*.md" -type f -print0)

echo "Done."
echo "  Files touched:       $files_touched"
echo "  Source: prefix drops: $source_dropped"
echo "  ## Sources removed:  $sections_removed"
echo "  Date → [[date]]:    $dates_converted"

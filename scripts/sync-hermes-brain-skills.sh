#!/usr/bin/env bash
set -euo pipefail

SRC_ROOT="${1:-$HOME/gbrain-k2/skills}"
DEST_ROOT="${2:-$HOME/.hermes/skills/brain}"

mkdir -p "$(dirname "$DEST_ROOT")"
rm -rf "$DEST_ROOT"
mkdir -p "$DEST_ROOT"

count=0
while IFS= read -r -d '' skill_file; do
  skill_dir="$(dirname "$skill_file")"
  name="$(basename "$skill_dir")"
  dest_dir="$DEST_ROOT/$name"
  mkdir -p "$dest_dir"
  cp -R "$skill_dir/"* "$dest_dir/" 2>/dev/null || true
  cp "$skill_file" "$dest_dir/SKILL.md"
  count=$((count + 1))
done < <(find "$SRC_ROOT" -mindepth 2 -maxdepth 2 -type f -name 'SKILL.md' -print0 | sort -z)

mkdir -p "$DEST_ROOT/_shared"
for shared in RESOLVER.md _brain-filing-rules.md _output-rules.md manifest.json; do
  if [[ -f "$SRC_ROOT/$shared" ]]; then
    cp "$SRC_ROOT/$shared" "$DEST_ROOT/_shared/$shared"
  fi
done

if [[ -d "$SRC_ROOT/conventions" ]]; then
  mkdir -p "$DEST_ROOT/_shared/conventions"
  cp -R "$SRC_ROOT/conventions/"* "$DEST_ROOT/_shared/conventions/" 2>/dev/null || true
fi

printf 'Mirrored %d brain skills into %s\n' "$count" "$DEST_ROOT"
printf 'Restart Hermes sessions to refresh the available-skills prompt cache.\n'

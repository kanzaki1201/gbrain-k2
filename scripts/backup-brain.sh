#!/bin/bash
# Snapshot ~/.gbrain/brain.pglite to ~/.gbrain/backups/ with rotation.
# Keeps last 7 daily snapshots. Skips if autopilot is writing (checks .gbrain-lock).

set -euo pipefail

GBRAIN_DIR="$HOME/.gbrain"
SRC="$GBRAIN_DIR/brain.pglite"
BACKUP_DIR="$GBRAIN_DIR/backups"
LOCK_DIR="$SRC/.gbrain-lock"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

if [ ! -d "$SRC" ]; then
  echo "no brain.pglite to back up"
  exit 0
fi

# Skip if autopilot is holding the lock (don't interrupt an embed job)
if [ -d "$LOCK_DIR" ]; then
  echo "skip: .gbrain-lock exists (autopilot or another process is writing)"
  exit 0
fi

mkdir -p "$BACKUP_DIR"

# Use rsync with --link-dest for incremental deduplication (hardlinks unchanged files)
LATEST=$(ls -t "$BACKUP_DIR" 2>/dev/null | head -1)
if [ -n "$LATEST" ] && [ -d "$BACKUP_DIR/$LATEST" ]; then
  rsync -a --link-dest="$BACKUP_DIR/$LATEST" "$SRC/" "$BACKUP_DIR/brain.pglite-$TIMESTAMP/"
else
  rsync -a "$SRC/" "$BACKUP_DIR/brain.pglite-$TIMESTAMP/"
fi

# Rotate: keep 7 most recent backups
cd "$BACKUP_DIR"
ls -t | tail -n +8 | while read -r old; do
  echo "rotating out: $old"
  rm -rf "$old"
done

echo "backup done: brain.pglite-$TIMESTAMP"

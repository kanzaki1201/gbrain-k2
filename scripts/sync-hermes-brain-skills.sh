#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "$REPO_ROOT/scripts/generate-hermes-brain-skills.py"
python3 "$REPO_ROOT/scripts/install-hermes-brain-skills.py"
python3 "$REPO_ROOT/scripts/audit-hermes-brain-skills.py" --write-report

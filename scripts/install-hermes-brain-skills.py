#!/usr/bin/env python3
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path.home() / ".hermes" / "config.yaml"
LEGACY_BRAIN_DIR = Path.home() / ".hermes" / "skills" / "brain"
LEGACY_ARCHIVE_ROOT = Path.home() / ".hermes" / "skill-archives"
EXTERNAL_DIR = str(REPO_ROOT / "hermes-skills")


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
    return {}


def save_config(config: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(yaml.safe_dump(config, sort_keys=False, allow_unicode=True), encoding="utf-8")


def ensure_external_dir(config: dict) -> bool:
    skills = config.setdefault("skills", {})
    external_dirs = skills.setdefault("external_dirs", [])
    if EXTERNAL_DIR in external_dirs:
        return False
    external_dirs.append(EXTERNAL_DIR)
    return True


def archive_legacy_brain() -> Path | None:
    if not LEGACY_BRAIN_DIR.exists():
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    LEGACY_ARCHIVE_ROOT.mkdir(parents=True, exist_ok=True)
    target = LEGACY_ARCHIVE_ROOT / f"brain-legacy-{stamp}"
    LEGACY_BRAIN_DIR.rename(target)
    return target


def main() -> None:
    config = load_config()
    changed = ensure_external_dir(config)
    if changed:
        save_config(config)

    archived = archive_legacy_brain()
    print(f"external_dir_added={changed}")
    print(f"external_dir={EXTERNAL_DIR}")
    if archived:
        print(f"archived_legacy_brain={archived}")
    else:
        print("archived_legacy_brain=(none)")


if __name__ == "__main__":
    main()

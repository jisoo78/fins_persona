from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "archive"
EVAL_DIR = ROOT / "archive_eval"
TRAIN_DIR = EVAL_DIR / "train"
HOLDOUT_DIR = EVAL_DIR / "holdout"
HOLDOUT_PREFIXES = ("fy2017_", "fy2018_", "fy2019_")


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def main() -> None:
    reset_dir(TRAIN_DIR)
    reset_dir(HOLDOUT_DIR)

    train_count = 0
    holdout_count = 0

    for source in sorted(SOURCE_DIR.iterdir()):
        if not source.is_file():
            continue

        is_holdout = source.name.startswith(HOLDOUT_PREFIXES)
        target_dir = HOLDOUT_DIR if is_holdout else TRAIN_DIR
        shutil.copy2(source, target_dir / source.name)

        if is_holdout:
            holdout_count += 1
        else:
            train_count += 1

    print(f"train files: {train_count}")
    print(f"holdout files: {holdout_count}")
    print(f"train dir: {TRAIN_DIR}")
    print(f"holdout dir: {HOLDOUT_DIR}")


if __name__ == "__main__":
    main()

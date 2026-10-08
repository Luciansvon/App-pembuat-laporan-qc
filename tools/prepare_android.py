"""Create a private APK payload containing app code and clean templates only."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def prepare(destination: Path) -> Path:
    destination = destination.resolve()
    if not destination.is_relative_to((ROOT / ".artifacts").resolve()):
        raise ValueError("Android stage must stay inside .artifacts")
    if destination.exists():
        raise FileExistsError(f"Android stage already exists: {destination}")
    destination.mkdir(parents=True)
    shutil.copy2(ROOT / "android" / "main.py", destination / "main.py")
    shutil.copytree(ROOT / "backend" / "app", destination / "backend" / "app",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copytree(ROOT / "backend" / "migrations", destination / "backend" / "migrations",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    shutil.copy2(ROOT / "backend" / "alembic.ini", destination / "backend" / "alembic.ini")
    templates = destination / "templates"
    templates.mkdir()
    for name in ("catalog.json", "default.docx", "poliform.docx", "rh.docx"):
        shutil.copy2(ROOT / "templates" / name, templates / name)
    shutil.copytree(ROOT / "frontend" / "dist", destination / "frontend" / "dist")
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / ".artifacts" / "android-stage")
    args = parser.parse_args()
    print(prepare(args.output))

"""A packaged APK keeps migration revisions as sourceless .pyc files."""
from __future__ import annotations

import py_compile
import shutil
import sqlite3
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory


ROOT = Path(__file__).resolve().parents[1]


def test_sourceless_android_migration_creates_domain_tables(tmp_path: Path, monkeypatch) -> None:
    migrations = tmp_path / "migrations"
    shutil.copytree(ROOT / "backend" / "migrations", migrations)
    for source in migrations.glob("versions/*.py"):
        py_compile.compile(str(source), cfile=str(source.with_suffix(".pyc")), doraise=True)
        source.unlink()

    data_dir = tmp_path / "data"
    monkeypatch.setenv("QC_DATA_DIR", str(data_dir))
    config = Config(str(ROOT / "backend" / "alembic.ini"))
    config.set_main_option("script_location", str(migrations))
    assert ScriptDirectory.from_config(config).get_current_head() == "446c624e36d9"
    command.upgrade(config, "head")

    with sqlite3.connect(data_dir / "qc.sqlite3") as database:
        tables = {row[0] for row in database.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
    assert {"customers", "products", "inspections", "defect_library"} <= tables

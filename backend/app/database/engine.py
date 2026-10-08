from __future__ import annotations

import sqlite3
from typing import Any

from sqlalchemy import Engine, URL, event
from sqlmodel import create_engine

from app.core.config import Settings


def create_database_engine(settings: Settings) -> Engine:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    url = URL.create("sqlite", database=str(settings.database_path))
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 10})

    @event.listens_for(engine, "connect")
    def configure_sqlite(connection: sqlite3.Connection, _: Any) -> None:
        cursor = connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=10000")
        finally:
            cursor.close()

    return engine


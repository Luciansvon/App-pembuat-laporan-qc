"""Local paths and explicit development origins."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
RESOURCE_ROOT = Path(os.environ.get("QC_RESOURCE_ROOT", str(PROJECT_ROOT))).resolve()


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    allowed_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173")

    @property
    def database_path(self) -> Path:
        return self.data_dir / "qc.sqlite3"


def load_settings() -> Settings:
    data_dir = Path(os.environ.get("QC_DATA_DIR", str(PROJECT_ROOT / "data"))).expanduser().resolve()
    origins = tuple(origin.strip() for origin in os.environ.get(
        "QC_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if origin.strip())
    if not origins or "*" in origins:
        raise ValueError("QC_ALLOWED_ORIGINS must contain explicit origins")
    return Settings(data_dir=data_dir, allowed_origins=origins)


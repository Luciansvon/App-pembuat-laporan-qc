"""Inspectra's on-device entry point for the python-for-android WebView bootstrap."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent
    private = os.environ.get("ANDROID_PRIVATE")
    if not private:
        raise RuntimeError("ANDROID_PRIVATE is required for on-device storage")
    os.environ["QC_RESOURCE_ROOT"] = str(root)
    os.environ["QC_DATA_DIR"] = str(Path(private) / "inspectra-data")
    backend = root / "backend"
    sys.path.insert(0, str(backend))

    import uvicorn
    from app.main import create_app

    uvicorn.run(create_app(), host="127.0.0.1", port=5000, log_level="warning")


if __name__ == "__main__":
    main()

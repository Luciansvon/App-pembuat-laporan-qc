"""Configured photo-page layouts shared by the API, review and DOCX renderer."""
from __future__ import annotations

import json
from functools import lru_cache

from app.core.config import RESOURCE_ROOT


@lru_cache(maxsize=1)
def photo_layout_catalog() -> dict:
    path = RESOURCE_ROOT / "templates" / "photo-layouts.json"
    catalog = json.loads(path.read_text(encoding="utf-8"))
    templates = catalog.get("templates")
    if not isinstance(templates, list) or not templates:
        raise ValueError("Photo layout catalog is empty")
    ids = [item.get("id") for item in templates]
    if len(ids) != len(set(ids)):
        raise ValueError("Photo layout IDs must be unique")
    for item in templates:
        if item.get("photo_count") != item.get("columns", 0) * item.get("rows", 0):
            raise ValueError(f"Photo layout {item.get('id')} has inconsistent slot dimensions")
        if item.get("columns", 0) > 2:
            raise ValueError(f"Photo layout {item.get('id')} exceeds two columns")
    return catalog


def photo_layout_by_id(template_id: str) -> dict | None:
    return next((item for item in photo_layout_catalog()["templates"] if item["id"] == template_id), None)

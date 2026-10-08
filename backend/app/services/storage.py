"""Private photo storage with bounded decode and generated paths."""
from __future__ import annotations

import io
import os
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import Settings
from app.models.tables import Inspection, InspectionPhoto

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_IMAGE_PIXELS = 30_000_000
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def inspection_dir(settings: Settings, inspection: Inspection) -> Path:
    return settings.data_dir / "inspections" / inspection.date.strftime("%Y") / inspection.date.strftime("%m") / inspection.inspection_number


def photo_path(settings: Settings, photo: InspectionPhoto) -> Path:
    root = settings.data_dir.resolve()
    path = (root / photo.file_path).resolve()
    if not path.is_relative_to(root):
        raise HTTPException(status_code=500, detail="Invalid photo path")
    return path


def save_photo(settings: Settings, inspection: Inspection, upload: UploadFile, photo_id: str) -> str:
    contents = upload.file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Photo exceeds 20 MB")
    try:
        with Image.open(io.BytesIO(contents)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Unsupported photo format")
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("Photo exceeds pixel limit")
            normalized = ImageOps.exif_transpose(image)
            if normalized.mode not in {"RGB", "L"}:
                normalized = normalized.convert("RGB")
            elif normalized.mode == "L":
                normalized = normalized.convert("RGB")
            output = inspection_dir(settings, inspection) / "photos" / f"{photo_id}.jpg"
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary = output.with_name(f".{photo_id}-{uuid4().hex}.tmp")
            try:
                normalized.save(temporary, format="JPEG", quality=88, optimize=True)
                os.replace(temporary, output)
            finally:
                temporary.unlink(missing_ok=True)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail="Invalid or oversized photo") from exc
    return output.relative_to(settings.data_dir.resolve()).as_posix()


def rotate_photo(path: Path, degrees: int) -> None:
    temporary = path.with_name(f".{path.stem}-{uuid4().hex}.tmp")
    try:
        with Image.open(path) as image:
            image.rotate(-degrees, expand=True).save(temporary, format="JPEG", quality=88, optimize=True)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

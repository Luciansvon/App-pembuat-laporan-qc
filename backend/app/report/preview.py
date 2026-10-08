"""Private page images rendered from the exact generated Word document."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from threading import Lock

from app.core.config import RESOURCE_ROOT

_word_lock = Lock()
_render_version = b"word-preview-v1-144dpi"
_max_pages = 100


class PreviewUnavailable(RuntimeError):
    pass


def preview_key(docx: Path) -> str:
    digest = hashlib.sha256()
    digest.update(_render_version)
    with docx.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def preview_directory(docx: Path, key: str) -> Path:
    return docx.parent / "preview" / key


def _export_pdf(docx: Path, pdf: Path) -> None:
    if sys.platform != "win32":
        raise PreviewUnavailable("Preview Word per halaman saat ini memerlukan Windows dan Microsoft Word.")
    script = RESOURCE_ROOT / "backend" / "app" / "report" / "render_word.ps1"
    shell = shutil.which("powershell.exe") or shutil.which("pwsh.exe")
    if shell is None or not script.is_file():
        raise PreviewUnavailable("PowerShell atau skrip render Word tidak tersedia.")
    try:
        result = subprocess.run(
            [shell, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-File", str(script), "-Source", str(docx), "-Pdf", str(pdf)],
            capture_output=True, text=True, timeout=120, check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired as exc:
        raise PreviewUnavailable("Microsoft Word terlalu lama saat membuat preview.") from exc
    if result.returncode or not pdf.is_file():
        detail = (result.stderr or result.stdout).strip().splitlines()
        raise PreviewUnavailable("Preview gagal: " + (detail[-1] if detail else "Microsoft Word tidak tersedia."))


def render_preview(docx: Path) -> tuple[str, int]:
    key = preview_key(docx)
    target = preview_directory(docx, key)
    marker = target / "pages.json"
    with _word_lock:
        if marker.is_file():
            data = json.loads(marker.read_text(encoding="utf-8"))
            count = int(data["page_count"])
            if count > 0 and all((target / f"page-{index}.jpg").is_file() for index in range(1, count + 1)):
                return key, count
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="word-preview-", dir=target.parent) as temp:
            work = Path(temp)
            pdf_path = work / "report.pdf"
            _export_pdf(docx, pdf_path)
            import pypdfium2 as pdfium
            pdf = pdfium.PdfDocument(pdf_path)
            try:
                count = len(pdf)
                if not 1 <= count <= _max_pages:
                    raise PreviewUnavailable(f"Jumlah halaman {count} di luar batas preview (1–{_max_pages}).")
                for index in range(count):
                    page = pdf[index]
                    try:
                        bitmap = page.render(scale=2)
                        image = bitmap.to_pil().convert("RGB")
                        image.save(work / f"page-{index + 1}.jpg", format="JPEG", quality=86, optimize=True)
                    finally:
                        page.close()
            finally:
                pdf.close()
            (work / "pages.json").write_text(json.dumps({"page_count": count}), encoding="utf-8")
            target.mkdir(exist_ok=True)
            for item in work.glob("page-*.jpg"):
                os.replace(item, target / item.name)
            os.replace(work / "pages.json", marker)
    return key, count

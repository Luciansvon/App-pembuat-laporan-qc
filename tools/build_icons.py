"""Derive PWA icon sizes from Bima's Inspectra artwork."""
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "assets" / "qc-android.png"
public = root / "frontend" / "public"
with Image.open(source) as image:
    art = image.convert("RGB")
    for size in (192, 512):
        target = public / f"icon-{size}.png"
        art.resize((size, size), Image.Resampling.LANCZOS).save(target, optimize=True)
        print(target)

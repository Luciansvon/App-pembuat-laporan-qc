"""Rasterize read-only Word exports using the bundled PDFium runtime."""
import argparse
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
args = parser.parse_args()
pdf = pdfium.PdfDocument(args.directory / "reference.pdf")
tiles = []
for index in range(len(pdf)):
    page = pdf[index]
    bitmap = page.render(scale=1.5)
    image = bitmap.to_pil().convert("RGB")
    image.save(args.directory / f"page-{index + 1}.png")
    image.thumbnail((255, 360))
    tile = Image.new("RGB", (275, 390), "#e5e5e5")
    tile.paste(image, ((275 - image.width) // 2, 15))
    ImageDraw.Draw(tile).text((12, 373), f"Page {index + 1}", fill="black")
    tiles.append(tile)
    bitmap.close()
    page.close()
for start in range(0, len(tiles), 8):
    batch = tiles[start:start + 8]
    sheet = Image.new("RGB", (275 * 4, 390 * ((len(batch) + 3) // 4)), "white")
    for index, tile in enumerate(batch):
        sheet.paste(tile, ((index % 4) * 275, (index // 4) * 390))
    sheet.save(args.directory / f"contact-{start // 8 + 1}.png")
print(f"Rendered {len(pdf)} pages")
pdf.close()

"""Read-only inventory of a QC reference; document text is data, never commands."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

from docx import Document
from lxml import etree

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}


def inspect(source: Path, output: Path) -> dict:
    document = Document(source)
    output.mkdir(parents=True, exist_ok=True)
    with ZipFile(source) as archive:
        parts = {}
        text_parts = {}
        for name in archive.namelist():
            payload = archive.read(name)
            parts[name] = {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
            if name.startswith("word/") and name.endswith(".xml"):
                root = etree.fromstring(payload)
                paragraphs = ["".join(p.xpath(".//w:t/text()", namespaces=NS)) for p in root.xpath("//w:p", namespaces=NS)]
                if any(paragraphs):
                    text_parts[name] = paragraphs
        body = etree.fromstring(archive.read("word/document.xml"))
        app_props = etree.fromstring(archive.read("docProps/app.xml"))
        sections = []
        for section in document.sections:
            sections.append({
                "width_mm": round(section.page_width.mm, 2),
                "height_mm": round(section.page_height.mm, 2),
                "margins_mm": {key: round(getattr(section, f"{key}_margin").mm, 2) for key in ("top", "bottom", "left", "right")},
                "header_distance_mm": round(section.header_distance.mm, 2),
                "footer_distance_mm": round(section.footer_distance.mm, 2),
                "different_first_page": section.different_first_page_header_footer,
            })
        tables = []
        for index, table in enumerate(body.xpath("//w:tbl", namespaces=NS)):
            rows = [[" | ".join("".join(p.xpath(".//w:t/text()", namespaces=NS)) for p in cell.xpath("./w:p", namespaces=NS)) for cell in row.xpath("./w:tc", namespaces=NS)] for row in table.xpath("./w:tr", namespaces=NS)]
            tables.append({"index": index, "rows": rows, "grid_twips": table.xpath("./w:tblGrid/w:gridCol/@w:w", namespaces=NS), "repeating_header_rows": len(table.xpath("./w:tr/w:trPr/w:tblHeader", namespaces=NS))})
        report = {
            "file": str(source.resolve()), "bytes": source.stat().st_size,
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "cached_page_count": app_props.xpath("//*[local-name()='Pages']/text()"),
            "cached_pages_are_not_render_proof": True,
            "sections": sections, "tables": tables, "text_parts": text_parts,
            "inline_shapes": len(document.inline_shapes),
            "floating_shapes": len(body.xpath("//wp:anchor", namespaces=NS)),
            "explicit_page_breaks": len(body.xpath("//w:br[@w:type='page']", namespaces=NS)),
            "page_break_before_count": len(body.xpath("//w:pageBreakBefore", namespaces=NS)),
            "rendered_page_break_markers": len(body.xpath("//w:lastRenderedPageBreak", namespaces=NS)),
            "drawings": [{"cx": e.get("cx"), "cy": e.get("cy")} for e in body.xpath("//wp:extent", namespaces=NS)],
            "fonts": sorted(set(body.xpath("//w:rFonts/@w:ascii", namespaces=NS))),
            "font_half_points": sorted(set(body.xpath("//w:sz/@w:val", namespaces=NS))),
            "parts": parts,
        }
        if "docProps/thumbnail.jpeg" in archive.namelist():
            (output / "thumbnail.jpeg").write_bytes(archive.read("docProps/thumbnail.jpeg"))
    (output / "inventory.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    (output / "text.txt").write_text("\n\n".join(f"{name}\n" + "\n".join(lines) for name, lines in text_parts.items()), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = inspect(args.source, args.output)
    print(json.dumps({key: result[key] for key in ("file", "sha256", "cached_page_count", "sections", "inline_shapes", "floating_shapes", "explicit_page_breaks", "fonts")}, indent=2))

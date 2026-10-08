"""Template-backed deterministic DOCX report from confirmed database facts."""
from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from zipfile import ZipFile, ZipInfo

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor
from PIL import Image
from sqlmodel import Session, select

from app.core.config import RESOURCE_ROOT, Settings
from app.models.tables import Inspection, InspectionPhoto, Issue, Measurement, TestReading
from app.services.storage import inspection_dir, photo_path

TEMPLATE_DIR = RESOURCE_ROOT / "templates"
SECTION_TITLES = {
    "PRODUCT_VIEW": "Product View", "PRODUCT_DETAIL": "Product Detail",
    "DRAWING": "Drawing Product", "DIMENSION": "Product Dimension",
    "MC": "MC Check", "GLOSS": "Gloss Meter Check", "SWATCH": "Panel Swatch",
    "ISSUE": "ISSUE", "OTHER": "Other Inspection",
}


def template_for(inspection: Inspection, settings: Settings) -> tuple[dict, bool]:
    catalog = json.loads((TEMPLATE_DIR / "catalog.json").read_text(encoding="utf-8"))
    key = catalog["customer_templates"].get(inspection.customer_code.upper(), catalog["default_template"])
    config = catalog["templates"][key]
    path = TEMPLATE_DIR / config["output_template"]
    return config, config["status"] == "READY" and path.is_file()


def paragraph_format(paragraph, size: int = 9, bold: bool = False) -> None:
    paragraph.paragraph_format.space_after = Pt(4)
    for run in paragraph.runs:
        run.font.name = "Calibri"
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = RGBColor(20, 27, 23)


def heading(document, label: str, page_break: bool = False) -> None:
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.page_break_before = page_break
    paragraph.paragraph_format.keep_with_next = True
    paragraph.paragraph_format.space_before = Pt(7)
    paragraph.add_run(label)
    paragraph_format(paragraph, 10, True)


def fill_header(document, inspection: Inspection, config: dict) -> None:
    def number(value: float | None) -> str:
        return "" if value is None else f"{value:g}"

    dimension_axes = config.get("dimension_axes", ["L", "W", "H"])
    box_axes = config.get("box_axes", ["L", "W", "H"])
    date_text = inspection.date.strftime("%y%m%d")
    if config.get("date_label") == "DATE-LOC" and inspection.location:
        date_text += "-" + inspection.location
    values = {
        "DESC": inspection.product_name,
        "INSPECT": config.get("inline_label", "INLINE") if inspection.inspection_type == "INLINE" else inspection.inspection_type.replace("_", " "),
        "CUSTOMER": inspection.customer_name, "PO": inspection.po,
        "DATE": date_text, "QC": inspection.qc_name,
        "QTY": str(inspection.quantity), "AQL": inspection.aql or "",
    }
    for index, axis in enumerate(dimension_axes, 1):
        values[f"DIM_{index}"] = number(inspection.product_dimensions.get(axis))
    for index, axis in enumerate(box_axes, 1):
        values[f"BOX_{index}"] = number(inspection.box_dimensions.get(axis))
    for table in document.sections[0].header.tables:
        # The source template has 18.38 cm cell widths on an 18 cm text area.
        # Scale every merged cell as well as the grid so both edges align with the body.
        table.autofit = False
        grid_columns = list(table._tbl.tblGrid.gridCol_lst)
        grid_total = sum(column.w for column in grid_columns)
        for column in grid_columns:
            column.w = int(column.w * Cm(18).emu / grid_total)
        for row in table.rows:
            cells = row._tr.tc_lst
            row_total = sum(cell.width for cell in cells)
            for cell in cells:
                cell.width = int(cell.width * Cm(18).emu / row_total)
        table_width = table._tbl.tblPr.find(qn("w:tblW"))
        if table_width is None:
            table_width = OxmlElement("w:tblW")
            table._tbl.tblPr.insert(0, table_width)
        table_width.set(qn("w:type"), "dxa")
        table_width.set(qn("w:w"), str(Cm(18).twips))
        for row in table.rows:
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    if "{{" not in paragraph.text:
                        continue
                    replaced = paragraph.text
                    for key, value in values.items():
                        replaced = replaced.replace("{{" + key + "}}", value)
                    paragraph.text = replaced
                    paragraph_format(paragraph, 9)
        for row_number, row in enumerate(table.rows):
            for cell in row.cells:
                for paragraph in cell.paragraphs:
                    paragraph.paragraph_format.space_before = Pt(0)
                    paragraph.paragraph_format.space_after = Pt(0)
                    for run in paragraph.runs:
                        run.font.size = Pt(10 if row_number == 0 else 9)
    remaining = "\n".join(cell.text for table in document.sections[0].header.tables for row in table.rows for cell in row.cells)
    if "{{" in remaining:
        raise ValueError("DOCX header has unresolved fields")


def fitted_size(path: Path, max_width_cm: float = 7.5, max_height_cm: float = 6.0) -> tuple[float, float]:
    with Image.open(path) as image:
        width, height = image.size
    scale = min(max_width_cm / width, max_height_cm / height)
    return width * scale, height * scale


def photo_grid(document, photos: list[InspectionPhoto], settings: Settings,
               *, width_cm: float = 18, border: bool = True,
               single_height_cm: float = 10) -> None:
    if not photos:
        return
    table = document.add_table(rows=0, cols=2)
    table.autofit = False
    if border:
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "bottom", "left", "right"):
            edge_border = OxmlElement(f"w:{edge}")
            edge_border.set(qn("w:val"), "single")
            edge_border.set(qn("w:sz"), "4")
            borders.append(edge_border)
        for edge in ("insideH", "insideV"):
            edge_border = OxmlElement(f"w:{edge}")
            edge_border.set(qn("w:val"), "nil")
            borders.append(edge_border)
        table._tbl.tblPr.append(borders)
    table.columns[0].width = Cm(width_cm / 2)
    table.columns[1].width = Cm(width_cm / 2)
    for start in range(0, len(photos), 2):
        pair = photos[start:start + 2]
        row = table.add_row()
        for cell in row.cells:
            cell.width = Cm(width_cm / 2)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        if len(pair) == 1:
            row.cells[0].merge(row.cells[1])
        for index, photo in enumerate(pair):
            cell = row.cells[index]
            paragraph = cell.paragraphs[0]
            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph.paragraph_format.space_after = Pt(0)
            path = photo_path(settings, photo)
            width, height = fitted_size(path, width_cm - 2 if len(pair) == 1 else width_cm / 2 - 0.8,
                                        single_height_cm if len(photos) == 1 else 5.8)
            paragraph.add_run().add_picture(str(path), width=Cm(width), height=Cm(height))
        captions = [photo.caption.strip() for photo in pair if photo.caption and photo.caption.strip()]
        if captions:
            caption_cell = table.add_row().cells[0].merge(table.rows[-1].cells[1])
            caption_cell.text = "  |  ".join(captions)
            caption = caption_cell.paragraphs[0]
            caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
            paragraph_format(caption, 8, True)


def combined_section_block(document, sections: list[str], photos_by_section: dict[str, list[InspectionPhoto]],
                           settings: Settings) -> None:
    outer = document.add_table(rows=1, cols=1)
    outer.style = "Table Grid"
    outer.autofit = False
    outer.columns[0].width = Cm(18)
    cell = outer.cell(0, 0)
    cell.width = Cm(18)
    for index, section in enumerate(sections):
        paragraph = cell.paragraphs[0] if index == 0 else cell.paragraphs[-1]
        if paragraph.text:
            paragraph = cell.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(8 if index else 5)
        paragraph.paragraph_format.space_after = Pt(6)
        paragraph.add_run(SECTION_TITLES.get(section, section)).bold = True
        paragraph_format(paragraph, 9, True)
        photo_grid(cell, photos_by_section[section], settings, width_cm=17.2,
                   border=False, single_height_cm=8.5)


def value_text(measurement: Measurement) -> str:
    if measurement.value_min is not None or measurement.value_max is not None:
        low = measurement.value_min if measurement.value_min is not None else ""
        high = measurement.value_max if measurement.value_max is not None else ""
        return f"{low}–{high} {measurement.unit or ''}".strip()
    return f"{measurement.value if measurement.value is not None else '—'} {measurement.unit or ''}".strip()


def measurement_table(document, measurements: list[Measurement], session: Session) -> None:
    if not measurements:
        return
    heading(document, "Measurement and Test Results")
    table = document.add_table(rows=1, cols=4)
    table.style = "Table Grid"
    for cell, label in zip(table.rows[0].cells, ("CHECK", "ACTUAL", "STANDARD", "RESULT")):
        cell.text = label
    for measurement in measurements:
        cells = table.add_row().cells
        cells[0].text = f"{measurement.category} / {measurement.label}"
        cells[1].text = value_text(measurement)
        cells[2].text = str(measurement.standard_value) if measurement.standard_value is not None else "—"
        cells[3].text = measurement.result
        readings = session.exec(select(TestReading).where(TestReading.measurement_id == measurement.id)
            .order_by(TestReading.sort_order, TestReading.id)).all()
        if readings:
            paragraph = document.add_paragraph(f"{measurement.label} readings: " + ", ".join(str(reading.value) for reading in readings))
            paragraph_format(paragraph, 8)
        if measurement.notes:
            paragraph = document.add_paragraph(f"{measurement.label}: {measurement.notes}")
            paragraph_format(paragraph, 8)
    for row_index, row in enumerate(table.rows):
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph_format(paragraph, 8, row_index == 0)


def issue_block(document, issue: Issue, photos: list[InspectionPhoto], settings: Settings) -> None:
    # The reference uses one five-row table: issue, merged photo area, cause, repair, CAP.
    chunks = [photos[index:index + 6] for index in range(0, len(photos), 6)] or [[]]
    for index, chunk in enumerate(chunks):
        document.add_page_break()
        table = document.add_table(rows=5 if index == len(chunks) - 1 else 2, cols=2)
        table.style = "Table Grid"
        table.autofit = False
        table.columns[0].width = Cm(2.44)
        table.columns[1].width = Cm(15.50)
        for row in table.rows:
            row.cells[0].width = Cm(2.44)
            row.cells[1].width = Cm(15.50)
        table.cell(0, 0).text = "ISSUE"
        title = issue.defect_type
        if issue.quantity is not None:
            title += f" ( {issue.quantity} Pcs)"
        if index:
            title += " — continued"
        table.cell(0, 1).text = title
        for cell in table.rows[0].cells:
            for paragraph in cell.paragraphs:
                paragraph_format(paragraph, 8)
        photo_cell = table.cell(1, 0).merge(table.cell(1, 1))
        if not chunk:
            photo_cell.text = "No issue photo recorded"
        else:
            grid = photo_cell.add_table(rows=0, cols=2)
            grid.autofit = False
            grid.columns[0].width = Cm(8.7)
            grid.columns[1].width = Cm(8.7)
            rows_count = (len(chunk) + 1) // 2
            max_h = 5.4 if rows_count >= 3 else (7.0 if rows_count == 2 else 9.5)
            for pair_index in range(0, len(chunk), 2):
                pair = chunk[pair_index:pair_index + 2]
                row = grid.add_row()
                for cell in row.cells:
                    cell.width = Cm(8.7)
                    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
                if len(pair) == 1:
                    row.cells[0].merge(row.cells[1])
                for photo_index, photo in enumerate(pair):
                    cell = row.cells[photo_index]
                    paragraph = cell.paragraphs[0]
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    paragraph.paragraph_format.space_after = Pt(0)
                    path = photo_path(settings, photo)
                    width, height = fitted_size(path, max_width_cm=15.8 if len(chunk) == 1 else 7.81,
                                                max_height_cm=max_h)
                    paragraph.add_run().add_picture(str(path), width=Cm(width), height=Cm(height))
                captions = [photo.caption.strip() for photo in pair if photo.caption and photo.caption.strip()]
                if captions:
                    caption_row = grid.add_row()
                    caption_cell = caption_row.cells[0].merge(caption_row.cells[1])
                    caption_cell.text = "  |  ".join(captions)
                    caption = caption_cell.paragraphs[0]
                    caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    paragraph_format(caption, 8, True)
            for paragraph in photo_cell.paragraphs:
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.add_run().font.size = Pt(1)
            first_paragraph = photo_cell.paragraphs[0]._element
            first_paragraph.getparent().remove(first_paragraph)
        if index != len(chunks) - 1:
            continue
        for row, (label, value) in zip(table.rows[2:], (
            ("CAUSE", issue.cause or "Not recorded"),
            ("REPAIR", issue.repair or "Not recorded"),
            ("CAP", issue.cap or "Not recorded"),
        )):
            row.cells[0].text = label
            row.cells[1].text = value
            for cell_index, cell in enumerate(row.cells):
                for paragraph in cell.paragraphs:
                    paragraph.paragraph_format.keep_with_next = label != "CAP"
                    paragraph_format(paragraph, 8, cell_index == 0)


def canonicalize_zip(path: Path) -> None:
    temporary = path.with_suffix(".canonical.tmp")
    with ZipFile(path) as source, ZipFile(temporary, "w") as output:
        for member in source.infolist():
            info = ZipInfo(member.filename, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = member.compress_type
            info.external_attr = member.external_attr
            output.writestr(info, source.read(member.filename))
    os.replace(temporary, path)


def report_filename(inspection: Inspection) -> str:
    def slug(value: str) -> str:
        return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")[:70] or "UNKNOWN"
    return f"{slug(inspection.customer_name)}-{slug(inspection.product_name)}-{inspection.date:%y%m%d}-{inspection.inspection_type}-{inspection.inspection_number}-r{inspection.revision}.docx"


def generate_report(session: Session, inspection: Inspection, settings: Settings) -> Path:
    config, ready = template_for(inspection, settings)
    if not ready:
        raise ValueError("DOCX template is not ready")
    document = Document(TEMPLATE_DIR / config["output_template"])
    if document.paragraphs and not document.paragraphs[0].text.strip():
        p_el = document.paragraphs[0]._element
        p_el.getparent().remove(p_el)
    fill_header(document, inspection, config)
    photos = session.exec(select(InspectionPhoto).where(InspectionPhoto.inspection_id == inspection.id)
        .order_by(InspectionPhoto.sort_order, InspectionPhoto.id)).all()
    measurements = session.exec(select(Measurement).where(Measurement.inspection_id == inspection.id)
        .order_by(Measurement.sort_order, Measurement.id)).all()
    issues = session.exec(select(Issue).where(Issue.inspection_id == inspection.id)
        .order_by(Issue.sort_order, Issue.id)).all()
    sections_photos = {section: [photo for photo in photos if photo.section == section and photo.issue_id is None]
                       for section in config["sections"]}
    combined = {block["sections"][0]: block for block in config.get("combined_blocks", [])}
    consumed: set[str] = set()
    for section in config["sections"]:
        if section in {"ISSUE", "CONCLUSION"} or section in consumed:
            continue
        section_photos = sections_photos[section]
        if not section_photos:
            continue
        block = combined.get(section)
        if block and all(0 < len(sections_photos.get(name, [])) <= limit for name, limit
                         in zip(block["sections"], block["max_counts"], strict=True)):
            combined_section_block(document, block["sections"], sections_photos, settings)
            consumed.update(block["sections"])
            continue
        for start in range(0, len(section_photos), config["max_photos_per_page"]):
            heading(document, SECTION_TITLES.get(section, section.replace("_", " ").title()))
            photo_grid(document, section_photos[start:start + config["max_photos_per_page"]], settings)
    measurement_table(document, measurements, session)
    for issue in issues:
        issue_block(document, issue, [photo for photo in photos if photo.issue_id == issue.id], settings)
    heading(document, "Conclusion", page_break=False)
    conclusion = inspection.conclusion or f"Inspection recorded. {len(issues)} issue(s) documented."
    paragraph = document.add_paragraph(conclusion)
    paragraph_format(paragraph, 9)
    if inspection.communication_status:
        paragraph = document.add_paragraph(inspection.communication_status)
        paragraph_format(paragraph, 9)
    fixed_time = datetime(2000, 1, 1)
    document.core_properties.created = fixed_time
    document.core_properties.modified = fixed_time
    destination = inspection_dir(settings, inspection) / "output" / report_filename(inspection)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name("." + destination.name + ".tmp")
    try:
        document.save(temporary)
        canonicalize_zip(temporary)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination

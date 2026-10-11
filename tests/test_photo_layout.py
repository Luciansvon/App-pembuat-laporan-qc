"""Generated photo bounds must fit the containing cells for every supported count."""
from pathlib import Path

import pytest
from docx import Document
from docx.oxml.ns import qn
from docx.shared import Cm
from PIL import Image

from app.core.config import Settings
from app.models.tables import InspectionPhoto, Issue
from app.report.generator import PHOTO_PADDING_CM, issue_block, photo_grid


@pytest.mark.parametrize("count", range(1, 7))
@pytest.mark.parametrize("kind", ["issue", "section"])
def test_photo_bounds_and_odd_final_row(tmp_path: Path, count: int, kind: str) -> None:
    shapes = [(6000, 1000), (1000, 6000), (1600, 1600), (3000, 2000), (6000, 1000), (1200, 2400)]
    photos = []
    for index, size in enumerate(shapes[:count]):
        path = tmp_path / f"{index}.jpg"
        Image.new("RGB", size, (30 + index * 25, 120, 90)).save(path)
        photos.append(InspectionPhoto(inspection_id="QA", section="ISSUE", file_path=path.name,
                                      caption=f"Caption {index + 1}"))
    document = Document()
    settings = Settings(data_dir=tmp_path)
    if kind == "issue":
        issue_block(document, Issue(inspection_id="QA", defect_type="QA", cause="CAUSE",
                                    repair="REPAIR", cap="CAP"), photos, settings)
        grid = document.tables[0].rows[1].cells[0].tables[0]
        # The paragraph between the label row and nested grid must remain present.
        cell = document.tables[0].rows[1].cells[0]._tc
        assert cell[1].tag == qn("w:p")
    else:
        photo_grid(document, photos, settings)
        grid = document.tables[0]
    path = tmp_path / "report.docx"
    document.save(path)
    reloaded = Document(path)
    assert len(reloaded.inline_shapes) == count
    assert not reloaded.element.xpath(".//wp:anchor")
    for cell in reloaded.element.xpath(".//w:tc"):
        width = cell.tcPr.tcW.w
        for inline in cell.xpath("./w:p//wp:inline"):
            extent = inline.xpath("./wp:extent")[0]
            available = width * 635 - Cm(2 * PHOTO_PADDING_CM).emu
            assert int(extent.get("cx")) <= available + 635
    for shape, (width, height) in zip(reloaded.inline_shapes, shapes, strict=False):
        assert abs(shape.width / shape.height - width / height) < 0.001
    photo_rows = [row for row in grid.rows if row._tr.xpath(".//wp:inline")]
    assert len(photo_rows) == (count + 1) // 2
    if count % 2:
        assert photo_rows[-1].cells[0]._tc is photo_rows[-1].cells[1]._tc
        # A wide final photo must use the merged cell, not a half-width limit.
        if count == 5:
            assert reloaded.inline_shapes[-1].width > Cm(12)

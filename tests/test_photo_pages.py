"""User-selected photo pages keep slots, captions and print bounds deterministic."""
from __future__ import annotations

import io
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.shared import Cm
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from test_workflow import create_basic_inspection, image_bytes


def upload_product_photos(client: TestClient, inspection_id: str, count: int = 8) -> list[dict]:
    photos = []
    for index in range(count):
        response = client.post(f"/api/inspections/{inspection_id}/photos",
            data={"section": "PRODUCT_VIEW"},
            files=[("files", (f"view-{index + 1}.jpg", image_bytes(), "image/jpeg"))])
        assert response.status_code == 201, response.text
        photo = response.json()[0]
        caption = client.patch(f"/api/photos/{photo['id']}", json={"caption": f"View angle {index + 1}"})
        assert caption.status_code == 200, caption.text
        photos.append(caption.json())
    return photos


def test_layout_catalog_exposes_print_sized_two_column_choices(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        response = client.get("/api/photo-layouts")
    assert response.status_code == 200
    templates = response.json()["templates"]
    grid = {item["code"]: item for item in templates}
    assert [grid[code]["photo_count"] for code in ("2/2", "2/4", "2/6", "2/8")] == [2, 4, 6, 8]
    assert all(grid[code]["columns"] == 2 for code in ("2/2", "2/4", "2/6", "2/8"))
    assert [grid[code]["max_photo_height_cm"] for code in ("2/2", "2/4", "2/6", "2/8")] == [9.5, 7.0, 5.4, 4.6]


def test_grid_8_page_persists_slots_and_prints_each_caption_under_its_photo(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        inspection = create_basic_inspection(client)
        photos = upload_product_photos(client, inspection["id"])
        photo_ids = [photo["id"] for photo in photos]
        patched = client.patch(f"/api/inspections/{inspection['id']}", json={
            "revision": client.get(f"/api/inspections/{inspection['id']}").json()["revision"],
            "photo_pages": [{"id": "page-1", "section": "PRODUCT_VIEW",
                             "template_id": "grid-8", "photo_ids": photo_ids}],
        })
        assert patched.status_code == 200, patched.text
        assert patched.json()["photo_pages"][0]["photo_ids"] == photo_ids
        review = client.post(f"/api/inspections/{inspection['id']}/validate").json()
        assert review["errors"] == []

        response = client.post(f"/api/inspections/{inspection['id']}/report/docx")
        assert response.status_code == 200, response.text
        document = Document(io.BytesIO(response.content))
        assert len(document.inline_shapes) == 8
        photo_table = next(table for table in document.tables if table._tbl.xpath(".//wp:inline"))
        assert photo_table.alignment == WD_TABLE_ALIGNMENT.CENTER
        assert len(photo_table.columns) == 2
        image_rows = [row for row in photo_table.rows if row._tr.xpath(".//wp:inline")]
        caption_rows = [row for row in photo_table.rows if not row._tr.xpath(".//wp:inline")]
        assert len(image_rows) == len(caption_rows) == 4
        assert [cell.text for row in caption_rows for cell in row.cells] == [
            f"View angle {index}" for index in range(1, 9)
        ]
        for photo in document.inline_shapes:
            assert Cm(4.5) <= photo.height <= Cm(4.6)
            assert photo.width <= Cm(8.8)
        section = document.sections[0]
        assert abs(section.page_width - section.left_margin - section.right_margin - Cm(18).emu) <= 635


def test_empty_or_cross_section_slots_block_report(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        inspection = create_basic_inspection(client)
        photos = upload_product_photos(client, inspection["id"], count=2)
        revision = client.get(f"/api/inspections/{inspection['id']}").json()["revision"]
        page = {"id": "page-1", "section": "PRODUCT_VIEW", "template_id": "grid-4",
                "photo_ids": [photos[0]["id"], photos[1]["id"], None, None]}
        saved = client.patch(f"/api/inspections/{inspection['id']}", json={
            "revision": revision, "photo_pages": [page],
        })
        assert saved.status_code == 200, saved.text
        errors = client.post(f"/api/inspections/{inspection['id']}/validate").json()["errors"]
        assert any("slot 3 is empty" in error for error in errors)

        wrong_section = {**page, "photo_ids": [photos[0]["id"], photos[1]["id"],
                                                   photos[0]["id"], photos[1]["id"]]}
        duplicate = client.patch(f"/api/inspections/{inspection['id']}", json={
            "revision": saved.json()["revision"], "photo_pages": [wrong_section],
        })
        assert duplicate.status_code == 422

        cross_section = {**page, "section": "MC"}
        section_mismatch = client.patch(f"/api/inspections/{inspection['id']}", json={
            "revision": saved.json()["revision"], "photo_pages": [cross_section],
        })
        assert section_mismatch.status_code == 422


def test_deleting_a_photo_clears_its_page_slot(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        inspection = create_basic_inspection(client)
        photos = upload_product_photos(client, inspection["id"], count=2)
        revision = client.get(f"/api/inspections/{inspection['id']}").json()["revision"]
        page = {"id": "page-1", "section": "PRODUCT_VIEW", "template_id": "grid-2",
                "photo_ids": [photo["id"] for photo in photos]}
        saved = client.patch(f"/api/inspections/{inspection['id']}", json={
            "revision": revision, "photo_pages": [page],
        })
        assert saved.status_code == 200, saved.text
        deleted = client.delete(f"/api/photos/{photos[0]['id']}", headers={"X-Confirm-Delete": "true"})
        assert deleted.status_code == 200, deleted.text
        detail = client.get(f"/api/inspections/{inspection['id']}").json()
        assert detail["photo_pages"][0]["photo_ids"] == [None, photos[1]["id"]]
        errors = client.post(f"/api/inspections/{inspection['id']}/validate").json()["errors"]
        assert any("slot 1 is empty" in error for error in errors)

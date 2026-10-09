"""Report preflight must never approve a DOCX that silently loses photos."""
from __future__ import annotations

import io
from pathlib import Path

import pytest
from docx import Document
from fastapi.testclient import TestClient
from PIL import Image

from app.api import qc as qc_api
from app.core.config import Settings
from app.main import create_app


def photo_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (32, 24), "#416e7b").save(output, format="JPEG")
    return output.getvalue()


def inspection(client: TestClient, code: str) -> str:
    customer = client.post("/api/customers", json={"code": code, "name": code})
    assert customer.status_code == 201, customer.text
    product = client.post("/api/products", json={
        "customer_id": customer.json()["id"], "name": "QA chair",
    })
    assert product.status_code == 201, product.text
    created = client.post("/api/inspections", json={
        "product_id": product.json()["id"], "po": "PO-001,PO-002",
        "inspection_type": "INLINE", "date": "2026-10-09",
        "qc_name": "Sol QC", "quantity": 2, "aql": "II",
    })
    assert created.status_code == 201, created.text
    return created.json()["id"]


def upload(client: TestClient, inspection_id: str, section: str,
           issue_id: str | None = None) -> dict:
    form = {"section": section}
    if issue_id:
        form["issue_id"] = issue_id
    response = client.post(f"/api/inspections/{inspection_id}/photos", data=form,
                           files=[("files", ("synthetic.jpg", photo_bytes(), "image/jpeg"))])
    assert response.status_code == 201, response.text
    return response.json()[0]


@pytest.mark.parametrize("code,section", [
    ("POLIFORM", "OTHER"),
    ("RH", "DRAWING"),
])
def test_accepted_section_photo_is_rendered_or_explicitly_blocked(
    tmp_path: Path, code: str, section: str,
) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        item_id = inspection(client, code)
        upload(client, item_id, section)
        review = client.post(f"/api/inspections/{item_id}/validate")
        assert review.status_code == 200
        report = client.post(f"/api/inspections/{item_id}/report/docx")
        if review.json()["errors"]:
            assert report.status_code == 409, report.text
            assert section in str(review.json()["errors"])
        else:
            assert report.status_code == 200, report.text
            assert len(Document(io.BytesIO(report.content)).inline_shapes) == 1


@pytest.mark.parametrize("damage", ["missing", "corrupt"])
def test_damaged_photo_is_named_in_review_and_blocks_report(
    tmp_path: Path, damage: str,
) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        item_id = inspection(client, f"DAMAGE-{damage}")
        photo = upload(client, item_id, "PRODUCT_VIEW")
        file_path = tmp_path / photo["file_path"]
        assert file_path.is_file()
        if damage == "missing":
            file_path.unlink()
        else:
            file_path.write_bytes(b"not a decodable image")

        review = client.post(f"/api/inspections/{item_id}/validate")
        assert review.status_code == 200
        errors = review.json()["errors"]
        assert errors, review.text
        assert any(photo["id"] in error or "PRODUCT_VIEW" in error for error in errors)

        report = client.post(f"/api/inspections/{item_id}/report/docx")
        assert report.status_code == 409, report.text
        assert report.json()["detail"]["errors"]


def test_unlinked_issue_photo_cannot_silently_disappear(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        item_id = inspection(client, "ORPHAN")
        response = client.post(f"/api/inspections/{item_id}/photos",
                               data={"section": "ISSUE"},
                               files=[("files", ("orphan.jpg", photo_bytes(), "image/jpeg"))])
        if response.status_code == 422:
            assert "issue" in response.text.lower()
            return
        assert response.status_code == 201, response.text
        review = client.post(f"/api/inspections/{item_id}/validate")
        assert review.status_code == 200
        report = client.post(f"/api/inspections/{item_id}/report/docx")
        if review.json()["errors"]:
            assert "ISSUE" in str(review.json()["errors"])
            assert report.status_code == 409, report.text
        else:
            assert report.status_code == 200, report.text
            assert len(Document(io.BytesIO(report.content)).inline_shapes) == 1


def test_photo_disappearing_after_review_returns_controlled_conflict(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        item_id = inspection(client, "LATE")
        photo = upload(client, item_id, "PRODUCT_VIEW")
        stored = tmp_path / photo["file_path"]
        assert client.post(f"/api/inspections/{item_id}/validate").json()["errors"] == []

        original_generate = qc_api.generate_report

        def disappear_then_generate(*args, **kwargs):
            stored.unlink()
            return original_generate(*args, **kwargs)

        monkeypatch.setattr(qc_api, "generate_report", disappear_then_generate)
        response = client.post(f"/api/inspections/{item_id}/report/docx")
        assert response.status_code == 409, response.text
        assert "photo" in response.text.lower()

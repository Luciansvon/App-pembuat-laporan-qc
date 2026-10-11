"""Regressions for numbering, measurement facts and preview invalidation."""
from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from sqlmodel import Session

from app.core.config import Settings
from app.main import create_app
from app.models.tables import Inspection
from app.report.preview import preview_directory, preview_key
from test_workflow import create_basic_inspection


def test_daily_sequence_continues_after_999(tmp_path: Path) -> None:
    app = create_app(Settings(data_dir=tmp_path))
    with TestClient(app) as client:
        first = create_basic_inspection(client)
        with Session(app.state.engine) as session:
            item = session.get(Inspection, first["id"])
            assert item is not None
            item.inspection_number = "QC-20261007-999"
            session.add(item)
            session.commit()
        body = {key: first[key] for key in ("product_id", "po", "inspection_type", "date", "qc_name", "quantity")}
        for sequence in (1000, 1001):
            response = client.post("/api/inspections", json=body)
            assert response.status_code == 201, response.text
            assert response.json()["inspection_number"] == f"QC-20261007-{sequence}"


def test_measurement_patch_cannot_replace_individual_readings(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        inspection = create_basic_inspection(client)
        measurement = client.post(f"/api/inspections/{inspection['id']}/measurements", json={
            "category": "MC", "label": "MC", "standard_value": 10,
            "tolerance_plus": 1, "tolerance_minus": 1,
        }).json()
        for value in (9, 12):
            assert client.post(f"/api/measurements/{measurement['id']}/readings", json={"value": value}).status_code == 201
        response = client.patch(f"/api/measurements/{measurement['id']}", json={"value_min": 10, "value_max": 10})
        assert response.status_code == 200
        assert (response.json()["value_min"], response.json()["value_max"], response.json()["result"]) == (9, 12, "FAIL")


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_reading_is_rejected_without_writing(tmp_path: Path, value: str) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path)), raise_server_exceptions=False) as client:
        inspection = create_basic_inspection(client)
        measurement = client.post(f"/api/inspections/{inspection['id']}/measurements", json={"category": "MC", "label": "MC"}).json()
        response = client.post(f"/api/measurements/{measurement['id']}/readings", json={"value": value})
        assert response.status_code == 422, response.text
        assert client.get(f"/api/inspections/{inspection['id']}").json()["measurements"][0]["readings"] == []


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "1e309"])
def test_nonfinite_json_number_returns_a_controlled_error(tmp_path: Path, value: str) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path)), raise_server_exceptions=False) as client:
        inspection = create_basic_inspection(client)
        measurement = client.post(f"/api/inspections/{inspection['id']}/measurements", json={"category": "MC", "label": "MC"}).json()
        response = client.post(f"/api/measurements/{measurement['id']}/readings",
            content='{"value":' + value + '}', headers={"Content-Type": "application/json"})
        assert response.status_code == 422, response.text
        assert response.json()["detail"][0]["loc"] == ["body", "value"]
        assert client.get(f"/api/inspections/{inspection['id']}").json()["measurements"][0]["readings"] == []


def test_preview_page_is_invalidated_when_inspection_changes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_render(path: Path) -> tuple[str, int]:
        key = preview_key(path)
        directory = preview_directory(path, key)
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "pages.json").write_text(json.dumps({"page_count": 1}), encoding="utf-8")
        (directory / "page-1.jpg").write_bytes(b"test page")
        return key, 1

    monkeypatch.setattr("app.api.qc.render_preview", fake_render)
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        inspection = create_basic_inspection(client)
        preview = client.post(f"/api/inspections/{inspection['id']}/report/preview").json()
        assert client.get(preview["pages"][0]).status_code == 200
        assert client.patch(f"/api/inspections/{inspection['id']}", json={"revision": inspection["revision"], "conclusion": "NEW CONCLUSION"}).status_code == 200
        assert client.get(preview["pages"][0]).status_code == 404

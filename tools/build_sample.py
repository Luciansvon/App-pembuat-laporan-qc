"""Build non-production QC fixtures to inspect every generated Word page."""
from __future__ import annotations

import io
import sys
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.config import Settings  # noqa: E402
from app.main import create_app  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / ".artifacts" / "report-qa"


def sample_image(index: int) -> bytes:
    image = Image.new("RGB", (960, 640), (210 - index * 8, 192 - index * 5, 157 + index * 3))
    draw = ImageDraw.Draw(image)
    draw.rectangle((70, 120, 890, 540), outline="#60432c", width=12)
    draw.text((100, 150), f"QA SAMPLE PHOTO {index + 1}", fill="#3e3229")
    stream = io.BytesIO()
    image.save(stream, format="JPEG", quality=88)
    return stream.getvalue()


def make_one(code: str) -> None:
    data_dir = SAMPLES / f"run-{uuid4().hex}" / code.lower() / "data"
    with TestClient(create_app(Settings(data_dir=data_dir))) as client:
        customer = client.post("/api/customers", json={"code": code, "name": code}).json()
        product_name = f"QA FURNITURE {code}"
        axes = {"L": 1200, "W": 600, "H": 450} if code == "POLIFORM" else {"L": 1400, "D": 700, "H": 500}
        product = client.post("/api/products", json={"customer_id": customer["id"],
            "name": product_name, "standard_dimensions": axes}).json()
        response = client.post("/api/inspections", json={
            "product_id": product["id"], "po": "QA-PO-001" if code == "POLIFORM" else "QA-PO-002,QA-PO-003",
            "inspection_type": "INLINE", "date": "2026-10-07", "location": "QSF",
            "qc_name": "QA FIXTURE", "quantity": 2 if code == "POLIFORM" else 3,
            "aql": "QA", "inspected_quantity": 1,
        })
        assert response.status_code == 201, response.text
        inspection_id = response.json()["id"]
        for index in range(6):
            files = [("files", (f"sample-{index}.jpg", sample_image(index), "image/jpeg"))]
            response = client.post(f"/api/inspections/{inspection_id}/photos",
                data={"section": "PRODUCT_VIEW"}, files=files)
            assert response.status_code == 201, response.text
        for category, label, low, high, unit in (("MC", "Moisture Content", 9.4, 11.1, "%"),
                                                  ("GLOSS", "Gloss Meter", 1, 2, "GU")):
            measurement = client.post(f"/api/inspections/{inspection_id}/measurements",
                json={"category": category, "label": label, "unit": unit}).json()
            for value in (low, high):
                response = client.post(f"/api/measurements/{measurement['id']}/readings", json={"value": value})
                assert response.status_code == 201, response.text
        issue = client.post(f"/api/inspections/{inspection_id}/issues", json={
            "defect_type": "Gap", "quantity": 3,
            "cause": "During assembling press less strong",
            "repair": "Patch and small sanding after QC review",
            "cap": "Make sure before painting no gap on the joint; inspect the joint after repair and record the result."}).json()
        for index in range(6):
            response = client.post(f"/api/inspections/{inspection_id}/photos",
                data={"section": "ISSUE", "issue_id": issue["id"]},
                files=[("files", (f"issue-{index}.jpg", sample_image(index + 6), "image/jpeg"))])
            assert response.status_code == 201, response.text
        review = client.post(f"/api/inspections/{inspection_id}/validate").json()
        assert not review["errors"], review
        report = client.post(f"/api/inspections/{inspection_id}/report/docx")
        assert report.status_code == 200, report.text
        output = SAMPLES / f"{code.lower()}-sample.docx"
        output.write_bytes(report.content)
        print(f"{code}: {output}, {len(report.content)} bytes, review={review}")


if __name__ == "__main__":
    SAMPLES.mkdir(parents=True, exist_ok=True)
    for customer_code in ("POLIFORM", "RH"):
        make_one(customer_code)

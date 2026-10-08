"""QC API. Destructive requests require an explicit confirmation header."""
from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import Settings
from app.models.tables import (Customer, DefectLibrary, Inspection, InspectionPhoto,
                               Issue, Measurement, Product, TestReading, new_id)
from app.schemas.qc import (CustomerIn, CustomerPatch, DefectIn, InspectionIn,
                            InspectionPatch, IssueIn, IssuePatch, MeasurementIn,
                            MeasurementPatch, PhotoPatch, ProductIn, ProductPatch,
                            ReadingIn, Section)
from app.services.review import inspect_report
from app.services.storage import inspection_dir, photo_path, rotate_photo, save_photo
from app.report.generator import generate_report, template_for, report_filename
from app.report.preview import PreviewUnavailable, preview_directory, preview_key, render_preview

router = APIRouter()


def db(request: Request) -> Iterator[Session]:
    with Session(request.app.state.engine) as session:
        yield session


def require_confirmation(x_confirm_delete: str | None = Header(default=None)) -> None:
    if x_confirm_delete != "true":
        raise HTTPException(status_code=428, detail="Deletion needs explicit confirmation")


def require(session: Session, model: type, item_id: str):
    item = session.get(model, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return item


def commit(session: Session, item):
    session.add(item)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Duplicate or referenced record") from exc
    session.refresh(item)
    return item


def touch(session: Session, inspection_id: str) -> None:
    inspection = require(session, Inspection, inspection_id)
    inspection.revision += 1
    inspection.updated_at = datetime.now(timezone.utc)
    session.add(inspection)


def as_detail(session: Session, inspection: Inspection) -> dict:
    result = inspection.model_dump(mode="json")
    result["photos"] = [photo.model_dump(mode="json") for photo in session.exec(
        select(InspectionPhoto).where(InspectionPhoto.inspection_id == inspection.id)
        .order_by(InspectionPhoto.sort_order, InspectionPhoto.id)).all()]
    result["issues"] = [issue.model_dump(mode="json") for issue in session.exec(
        select(Issue).where(Issue.inspection_id == inspection.id)
        .order_by(Issue.sort_order, Issue.id)).all()]
    measurements = session.exec(select(Measurement).where(Measurement.inspection_id == inspection.id)
        .order_by(Measurement.sort_order, Measurement.id)).all()
    result["measurements"] = []
    for measurement in measurements:
        item = measurement.model_dump(mode="json")
        item["readings"] = [reading.model_dump(mode="json") for reading in session.exec(
            select(TestReading).where(TestReading.measurement_id == measurement.id)
            .order_by(TestReading.sort_order, TestReading.id)).all()]
        result["measurements"].append(item)
    return result


def measurement_result(measurement: Measurement) -> str:
    if measurement.standard_value is None or measurement.tolerance_plus is None or measurement.tolerance_minus is None:
        return "INFO"
    low = measurement.standard_value - measurement.tolerance_minus
    high = measurement.standard_value + measurement.tolerance_plus
    actual_min = measurement.value_min if measurement.value_min is not None else measurement.value
    actual_max = measurement.value_max if measurement.value_max is not None else measurement.value
    if actual_min is None or actual_max is None:
        return "INFO"
    return "PASS" if low <= actual_min <= actual_max <= high else "FAIL"


@router.get("/customers")
def customers(session: Session = Depends(db)) -> list[Customer]:
    return list(session.exec(select(Customer).order_by(Customer.name)).all())


@router.post("/customers", status_code=201)
def create_customer(data: CustomerIn, session: Session = Depends(db)) -> Customer:
    return commit(session, Customer(**data.model_dump()))


@router.get("/customers/{item_id}")
def get_customer(item_id: str, session: Session = Depends(db)) -> Customer:
    return require(session, Customer, item_id)


@router.patch("/customers/{item_id}")
def patch_customer(item_id: str, data: CustomerPatch, session: Session = Depends(db)) -> Customer:
    item = require(session, Customer, item_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None:
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
        setattr(item, key, value)
    return commit(session, item)


@router.delete("/customers/{item_id}", dependencies=[Depends(require_confirmation)])
def delete_customer(item_id: str, session: Session = Depends(db)) -> dict:
    item = require(session, Customer, item_id)
    if session.exec(select(Product.id).where(Product.customer_id == item_id)).first():
        raise HTTPException(status_code=409, detail="Customer has products")
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


@router.get("/products")
def products(customer_id: str | None = None, session: Session = Depends(db)) -> list[Product]:
    query = select(Product).order_by(Product.name)
    if customer_id:
        query = query.where(Product.customer_id == customer_id)
    return list(session.exec(query).all())


@router.post("/products", status_code=201)
def create_product(data: ProductIn, session: Session = Depends(db)) -> Product:
    require(session, Customer, data.customer_id)
    return commit(session, Product(**data.model_dump()))


@router.get("/products/{item_id}")
def get_product(item_id: str, session: Session = Depends(db)) -> Product:
    return require(session, Product, item_id)


@router.patch("/products/{item_id}")
def patch_product(item_id: str, data: ProductPatch, session: Session = Depends(db)) -> Product:
    item = require(session, Product, item_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None and key in {"name", "standard_dimensions"}:
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
        setattr(item, key, value)
    return commit(session, item)


@router.delete("/products/{item_id}", dependencies=[Depends(require_confirmation)])
def delete_product(item_id: str, session: Session = Depends(db)) -> dict:
    item = require(session, Product, item_id)
    if session.exec(select(Inspection.id).where(Inspection.product_id == item_id)).first():
        raise HTTPException(status_code=409, detail="Product has inspections")
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


@router.get("/inspections")
def inspections(session: Session = Depends(db)) -> list[Inspection]:
    return list(session.exec(select(Inspection).order_by(Inspection.created_at.desc())).all())


@router.post("/inspections", status_code=201)
def create_inspection(data: InspectionIn, session: Session = Depends(db)) -> Inspection:
    product = require(session, Product, data.product_id)
    customer = require(session, Customer, product.customer_id)
    # SQLite write lock makes the daily sequence atomic for this local server.
    session.exec(text("BEGIN IMMEDIATE"))
    prefix = data.date.strftime("QC-%Y%m%d-")
    latest = session.exec(select(Inspection.inspection_number)
        .where(Inspection.inspection_number.like(prefix + "%"))
        .order_by(Inspection.inspection_number.desc())).first()
    next_number = int(latest.rsplit("-", 1)[-1]) + 1 if latest else 1
    payload = data.model_dump()
    payload.pop("product_id")
    if payload["product_dimensions"] is None:
        payload["product_dimensions"] = dict(product.standard_dimensions)
    item = Inspection(**payload, product_id=product.id, customer_id=customer.id,
        customer_name=customer.name, customer_code=customer.code,
        product_name=product.name, inspection_number=f"{prefix}{next_number:03d}")
    return commit(session, item)


@router.get("/inspections/{item_id}")
def get_inspection(item_id: str, session: Session = Depends(db)) -> dict:
    return as_detail(session, require(session, Inspection, item_id))


@router.patch("/inspections/{item_id}")
def patch_inspection(item_id: str, data: InspectionPatch, session: Session = Depends(db)) -> dict:
    item = require(session, Inspection, item_id)
    if data.revision != item.revision:
        raise HTTPException(status_code=409, detail="Inspection changed; reload before saving")
    changes = data.model_dump(exclude_unset=True)
    changes.pop("revision")
    for key, value in changes.items():
        if value is None and key in {"po", "inspection_type", "date", "qc_name", "quantity", "product_dimensions", "box_dimensions", "status"}:
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
        setattr(item, key, value)
    item.revision += 1
    item.updated_at = datetime.now(timezone.utc)
    commit(session, item)
    return as_detail(session, item)


@router.delete("/inspections/{item_id}", dependencies=[Depends(require_confirmation)])
def delete_inspection(item_id: str, request: Request, session: Session = Depends(db)) -> dict:
    require(session, Inspection, item_id)
    photos = session.exec(select(InspectionPhoto).where(InspectionPhoto.inspection_id == item_id)).all()
    issues = session.exec(select(Issue).where(Issue.inspection_id == item_id)).all()
    measures = session.exec(select(Measurement).where(Measurement.inspection_id == item_id)).all()
    for measure in measures:
        for reading in session.exec(select(TestReading).where(TestReading.measurement_id == measure.id)).all():
            session.delete(reading)
    paths = [photo_path(request.app.state.settings, photo) for photo in photos]
    for collection in (photos, issues, measures):
        for item in collection:
            session.delete(item)
    session.delete(require(session, Inspection, item_id))
    session.commit()
    for path in paths:
        path.unlink(missing_ok=True)
    return {"deleted": item_id}


@router.post("/inspections/{item_id}/measurements", status_code=201)
def create_measurement(item_id: str, data: MeasurementIn, session: Session = Depends(db)) -> Measurement:
    require(session, Inspection, item_id)
    item = Measurement(**data.model_dump(), inspection_id=item_id)
    item.result = measurement_result(item)
    session.add(item)
    touch(session, item_id)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/measurements/{item_id}")
def patch_measurement(item_id: str, data: MeasurementPatch, session: Session = Depends(db)) -> Measurement:
    item = require(session, Measurement, item_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None and key in {"category", "label", "sort_order"}:
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
        setattr(item, key, value)
    if item.value_min is not None and item.value_max is not None and item.value_min > item.value_max:
        raise HTTPException(status_code=422, detail="value_min exceeds value_max")
    item.result = measurement_result(item)
    touch(session, item.inspection_id)
    return commit(session, item)


@router.delete("/measurements/{item_id}", dependencies=[Depends(require_confirmation)])
def delete_measurement(item_id: str, session: Session = Depends(db)) -> dict:
    item = require(session, Measurement, item_id)
    for reading in session.exec(select(TestReading).where(TestReading.measurement_id == item_id)).all():
        session.delete(reading)
    touch(session, item.inspection_id)
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


def update_reading_range(session: Session, measurement: Measurement) -> None:
    readings = session.exec(select(TestReading).where(TestReading.measurement_id == measurement.id)).all()
    if readings:
        values = [reading.value for reading in readings]
        measurement.value_min, measurement.value_max = min(values), max(values)
        measurement.provenance = "READINGS"
    elif measurement.provenance == "READINGS":
        measurement.value_min = measurement.value_max = None
        measurement.provenance = "USER"
    measurement.result = measurement_result(measurement)
    session.add(measurement)


@router.post("/measurements/{item_id}/readings", status_code=201)
def create_reading(item_id: str, data: ReadingIn, session: Session = Depends(db)) -> TestReading:
    measurement = require(session, Measurement, item_id)
    if data.photo_id:
        photo = require(session, InspectionPhoto, data.photo_id)
        if photo.inspection_id != measurement.inspection_id:
            raise HTTPException(status_code=422, detail="Reading photo belongs to another inspection")
    item = TestReading(**data.model_dump(), measurement_id=item_id)
    session.add(item)
    session.flush()
    update_reading_range(session, measurement)
    touch(session, measurement.inspection_id)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/readings/{item_id}", dependencies=[Depends(require_confirmation)])
def delete_reading(item_id: str, session: Session = Depends(db)) -> dict:
    item = require(session, TestReading, item_id)
    measurement = require(session, Measurement, item.measurement_id)
    session.delete(item)
    session.flush()
    update_reading_range(session, measurement)
    touch(session, measurement.inspection_id)
    session.commit()
    return {"deleted": item_id}


@router.post("/inspections/{item_id}/issues", status_code=201)
def create_issue(item_id: str, data: IssueIn, session: Session = Depends(db)) -> Issue:
    require(session, Inspection, item_id)
    item = Issue(**data.model_dump(), inspection_id=item_id)
    session.add(item)
    touch(session, item_id)
    session.commit()
    session.refresh(item)
    return item


@router.patch("/issues/{item_id}")
def patch_issue(item_id: str, data: IssuePatch, session: Session = Depends(db)) -> Issue:
    item = require(session, Issue, item_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None and key in {"defect_type", "status", "sort_order"}:
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
        setattr(item, key, value)
    touch(session, item.inspection_id)
    return commit(session, item)


@router.delete("/issues/{item_id}", dependencies=[Depends(require_confirmation)])
def delete_issue(item_id: str, session: Session = Depends(db)) -> dict:
    item = require(session, Issue, item_id)
    for photo in session.exec(select(InspectionPhoto).where(InspectionPhoto.issue_id == item_id)).all():
        photo.issue_id = None
        # Kembalikan ke Product View agar foto tidak hilang diam-diam dari laporan.
        photo.section = "PRODUCT_VIEW"
        session.add(photo)
    touch(session, item.inspection_id)
    session.delete(item)
    session.commit()
    return {"deleted": item_id}


@router.post("/inspections/{item_id}/photos", status_code=201)
def create_photo(item_id: str, request: Request, section: Section = Form(),
                 files: list[UploadFile] = File(), issue_id: str | None = Form(default=None),
                 session: Session = Depends(db)) -> list[InspectionPhoto]:
    inspection = require(session, Inspection, item_id)
    if issue_id and require(session, Issue, issue_id).inspection_id != item_id:
        raise HTTPException(status_code=422, detail="Issue belongs to another inspection")
    existing = session.exec(select(InspectionPhoto.sort_order).where(InspectionPhoto.inspection_id == item_id)
        .order_by(InspectionPhoto.sort_order.desc())).first()
    start_order = (existing or 0) + 1
    staged: list[InspectionPhoto] = []
    try:
        for index, file in enumerate(files):
            photo = InspectionPhoto(inspection_id=item_id, section=section, issue_id=issue_id,
                                    file_path="", sort_order=start_order + index)
            photo.file_path = save_photo(request.app.state.settings, inspection, file, photo.id)
            staged.append(photo)
            session.add(photo)
        touch(session, item_id)
        session.commit()
        for photo in staged:
            session.refresh(photo)
        return staged
    except Exception:
        session.rollback()
        for photo in staged:
            photo_path(request.app.state.settings, photo).unlink(missing_ok=True)
        raise


@router.get("/photos/{item_id}/file")
def get_photo_file(item_id: str, request: Request, session: Session = Depends(db)) -> FileResponse:
    photo = require(session, InspectionPhoto, item_id)
    path = photo_path(request.app.state.settings, photo)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Photo file missing")
    return FileResponse(path, media_type="image/jpeg")


@router.patch("/photos/{item_id}")
def patch_photo(item_id: str, data: PhotoPatch, request: Request,
                session: Session = Depends(db)) -> InspectionPhoto:
    photo = require(session, InspectionPhoto, item_id)
    changes = data.model_dump(exclude_unset=True)
    degrees = changes.pop("rotate_degrees", None)
    if changes.get("issue_id") and require(session, Issue, changes["issue_id"]).inspection_id != photo.inspection_id:
        raise HTTPException(status_code=422, detail="Issue belongs to another inspection")
    for key, value in changes.items():
        if value is None and key in {"section", "sort_order"}:
            raise HTTPException(status_code=422, detail=f"{key} cannot be empty")
        setattr(photo, key, value)
    if degrees:
        rotate_photo(photo_path(request.app.state.settings, photo), degrees)
    touch(session, photo.inspection_id)
    return commit(session, photo)


@router.delete("/photos/{item_id}", dependencies=[Depends(require_confirmation)])
def delete_photo(item_id: str, request: Request, session: Session = Depends(db)) -> dict:
    photo = require(session, InspectionPhoto, item_id)
    if session.exec(select(TestReading.id).where(TestReading.photo_id == item_id)).first():
        raise HTTPException(status_code=409, detail="Photo is linked to a test reading")
    path = photo_path(request.app.state.settings, photo)
    touch(session, photo.inspection_id)
    session.delete(photo)
    session.commit()
    path.unlink(missing_ok=True)
    return {"deleted": item_id}


@router.get("/defects")
def defects(session: Session = Depends(db)) -> list[DefectLibrary]:
    return list(session.exec(select(DefectLibrary).order_by(DefectLibrary.name)).all())


@router.post("/defects", status_code=201)
def create_defect(data: DefectIn, session: Session = Depends(db)) -> DefectLibrary:
    return commit(session, DefectLibrary(**data.model_dump()))


@router.post("/inspections/{item_id}/validate")
def validate_inspection(item_id: str, request: Request, session: Session = Depends(db)) -> dict:
    inspection = require(session, Inspection, item_id)
    ready = template_for(inspection, request.app.state.settings)[1]
    return inspect_report(session, inspection, ready)


@router.post("/inspections/{item_id}/report/docx")
def report_docx(item_id: str, request: Request, session: Session = Depends(db)) -> FileResponse:
    inspection = require(session, Inspection, item_id)
    ready = template_for(inspection, request.app.state.settings)[1]
    review = inspect_report(session, inspection, ready)
    if review["errors"]:
        raise HTTPException(status_code=409, detail=review)
    path = generate_report(session, inspection, request.app.state.settings)
    return FileResponse(path, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        filename=report_filename(inspection))


@router.post("/inspections/{item_id}/report/preview")
def report_preview(item_id: str, request: Request, session: Session = Depends(db)) -> dict:
    inspection = require(session, Inspection, item_id)
    ready = template_for(inspection, request.app.state.settings)[1]
    review = inspect_report(session, inspection, ready)
    if review["errors"]:
        raise HTTPException(status_code=409, detail=review)
    path = generate_report(session, inspection, request.app.state.settings)
    try:
        key, count = render_preview(path)
    except PreviewUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    base = f"/api/inspections/{item_id}/report/preview/{key}"
    return {"page_count": count, "revision": inspection.revision,
            "pages": [f"{base}/{index}" for index in range(1, count + 1)]}


@router.get("/inspections/{item_id}/report/preview/{key}/{page}")
def report_preview_page(item_id: str, key: str, page: int, request: Request,
                        session: Session = Depends(db)) -> FileResponse:
    inspection = require(session, Inspection, item_id)
    path = inspection_dir(request.app.state.settings, inspection) / "output" / report_filename(inspection)
    if not path.is_file() or len(key) != 64 or key != preview_key(path) or page < 1:
        raise HTTPException(status_code=404, detail="Preview page not found")
    marker = preview_directory(path, key) / "pages.json"
    if not marker.is_file():
        raise HTTPException(status_code=404, detail="Preview page not found")
    count = json.loads(marker.read_text(encoding="utf-8"))["page_count"]
    image = preview_directory(path, key) / f"page-{page}.jpg"
    if page > count or not image.is_file():
        raise HTTPException(status_code=404, detail="Preview page not found")
    return FileResponse(image, media_type="image/jpeg", headers={"Cache-Control": "private, no-store"})

"""Deterministic preflight from persisted QC facts."""
from __future__ import annotations

from fastapi import HTTPException
from PIL import Image
from sqlmodel import Session, select

from app.core.config import Settings
from app.models.tables import Inspection, InspectionPhoto, Issue, Measurement
from app.report.photo_layouts import photo_layout_by_id
from app.services.storage import photo_path


def inspect_report(session: Session, inspection: Inspection, template_config: dict,
                   template_ready: bool, settings: Settings) -> dict:
    photos = session.exec(select(InspectionPhoto).where(InspectionPhoto.inspection_id == inspection.id)).all()
    issues = session.exec(select(Issue).where(Issue.inspection_id == inspection.id)).all()
    measurements = session.exec(select(Measurement).where(Measurement.inspection_id == inspection.id)).all()
    errors: list[str] = []
    warnings: list[str] = []
    if not template_ready:
        errors.append("DOCX template is not ready")
    if not all((inspection.customer_name, inspection.product_name, inspection.po, inspection.qc_name, inspection.quantity)):
        errors.append("Required report header is incomplete")
    issue_ids = {issue.id for issue in issues}
    dimension_ids = {item.id for item in measurements if item.category in ("DIMENSION", "BOX_DIMENSION")}
    photos_by_id = {photo.id: photo for photo in photos}
    assigned_page_photo_ids = {photo_id for page in inspection.photo_pages or []
                               if isinstance(page, dict)
                               for photo_id in page.get("photo_ids", []) if photo_id}
    renderable_sections = set(template_config.get("sections", ()))
    for photo in photos:
        photo_label = f"Photo {photo.id[:8]} ({photo.section})"
        if photo.section in ("DIMENSION", "BOX_DIMENSION") and (photo.measurement_id not in dimension_ids or photo.dimension_slot not in (1, 2)):
            errors.append(f"{photo_label} must be linked to a dimension before report generation")
        elif photo.measurement_id is not None and (photo.section not in ("DIMENSION", "BOX_DIMENSION") or photo.issue_id is not None):
            errors.append(f"{photo_label} has an invalid dimension link")
        if photo.issue_id is not None and photo.issue_id not in issue_ids:
            errors.append(f"{photo_label} is linked to an unavailable issue")
        elif photo.section == "ISSUE" and photo.issue_id is None:
            errors.append(f"{photo_label} must be linked to an issue before report generation")
        elif photo.issue_id is None and photo.section not in renderable_sections and photo.id not in assigned_page_photo_ids:
            errors.append(f"{photo_label} is not supported by the selected report template")
        try:
            path = photo_path(settings, photo)
            with Image.open(path) as image:
                image.load()
        except (HTTPException, OSError, ValueError, ArithmeticError, Image.DecompressionBombError):
            errors.append(f"{photo_label} is missing or unreadable")
    for page_number, page in enumerate(inspection.photo_pages or [], start=1):
        if not isinstance(page, dict):
            errors.append(f"Photo page {page_number} has invalid configuration")
            continue
        layout = photo_layout_by_id(str(page.get("template_id", "")))
        if layout is None:
            errors.append(f"Photo page {page_number} uses an unavailable layout")
            continue
        photo_ids = page.get("photo_ids", [])
        if page.get("section") not in layout["sections"] or len(photo_ids) != layout["photo_count"]:
            errors.append(f"Photo page {page_number} does not match its layout")
            continue
        for slot_number, photo_id in enumerate(photo_ids, start=1):
            if not photo_id:
                errors.append(f"Photo page {page_number}, slot {slot_number} is empty")
                continue
            photo = photos_by_id.get(photo_id)
            if photo is None or photo.section != page["section"]:
                errors.append(f"Photo page {page_number}, slot {slot_number} has an unavailable photo")
    if "PRODUCT_VIEW" in renderable_sections and not any(photo.section == "PRODUCT_VIEW" for photo in photos):
        warnings.append("Product View photos are empty")
    if "PACKING_ATTRIBUTE" in renderable_sections and not any(photo.section == "PACKING_ATTRIBUTE" for photo in photos):
        warnings.append("Packing View / Attribute photos are empty")
    if not inspection.box_dimensions:
        warnings.append("Box dimension is empty")
    mandatory_checks = set(template_config.get("mandatory_checks", []))
    if "MC" in mandatory_checks and not any(item.category == "MC" for item in measurements):
        warnings.append("MC not inspected")
    if "GLOSS" in mandatory_checks and not any(item.category == "GLOSS" for item in measurements):
        warnings.append("Gloss not inspected")
    for issue in issues:
        if not any(photo.issue_id == issue.id for photo in photos):
            errors.append(f"Issue {issue.defect_type} has no photo")
        if not all((issue.cause, issue.repair, issue.cap)):
            warnings.append(f"Issue {issue.defect_type} has incomplete Cause/Repair/CAP")
    for measurement in measurements:
        if measurement.category in ("DIMENSION", "BOX_DIMENSION"):
            target_sec = "BOX_DIMENSION" if measurement.category == "BOX_DIMENSION" else "DIMENSION"
            if target_sec not in renderable_sections:
                continue
            count = sum(photo.measurement_id == measurement.id and photo.section == target_sec for photo in photos)
            if count != 2:
                label_prefix = "Box Dimension" if measurement.category == "BOX_DIMENSION" else "Dimension"
                errors.append(f"{label_prefix} {measurement.label} requires exactly 2 photos (currently {count})")
    return {"errors": errors, "warnings": warnings,
            "photo_counts": {section: sum(photo.section == section for photo in photos) for section in sorted({photo.section for photo in photos})},
            "measurement_count": len(measurements), "issue_count": len(issues)}

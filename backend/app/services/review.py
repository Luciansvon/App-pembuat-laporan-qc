"""Deterministic preflight from persisted QC facts."""
from __future__ import annotations

from fastapi import HTTPException
from PIL import Image
from sqlmodel import Session, select

from app.core.config import Settings
from app.models.tables import Inspection, InspectionPhoto, Issue, Measurement
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
    dimension_ids = {item.id for item in measurements if item.category == "DIMENSION"}
    renderable_sections = set(template_config.get("sections", ()))
    for photo in photos:
        photo_label = f"Photo {photo.id[:8]} ({photo.section})"
        if photo.section == "DIMENSION" and (photo.measurement_id not in dimension_ids or photo.dimension_slot not in (1, 2)):
            errors.append(f"{photo_label} must be linked to a dimension before report generation")
        elif photo.measurement_id is not None and (photo.section != "DIMENSION" or photo.issue_id is not None):
            errors.append(f"{photo_label} has an invalid dimension link")
        if photo.issue_id is not None and photo.issue_id not in issue_ids:
            errors.append(f"{photo_label} is linked to an unavailable issue")
        elif photo.section == "ISSUE" and photo.issue_id is None:
            errors.append(f"{photo_label} must be linked to an issue before report generation")
        elif photo.issue_id is None and photo.section not in renderable_sections:
            errors.append(f"{photo_label} is not supported by the selected report template")
        try:
            path = photo_path(settings, photo)
            with Image.open(path) as image:
                image.load()
        except (HTTPException, OSError, ValueError, ArithmeticError, Image.DecompressionBombError):
            errors.append(f"{photo_label} is missing or unreadable")
    if not any(photo.section == "PRODUCT_VIEW" for photo in photos):
        warnings.append("Product View photos are empty")
    if not inspection.box_dimensions:
        warnings.append("Box dimension is empty")
    if not any(item.category == "MC" for item in measurements):
        warnings.append("MC not inspected")
    if not any(item.category == "GLOSS" for item in measurements):
        warnings.append("Gloss not inspected")
    for issue in issues:
        if not any(photo.issue_id == issue.id for photo in photos):
            errors.append(f"Issue {issue.defect_type} has no photo")
        if not all((issue.cause, issue.repair, issue.cap)):
            warnings.append(f"Issue {issue.defect_type} has incomplete Cause/Repair/CAP")
    for measurement in measurements:
        if measurement.category == "DIMENSION":
            count = sum(photo.measurement_id == measurement.id and photo.section == "DIMENSION" for photo in photos)
            if count != 2:
                errors.append(f"Dimension {measurement.label} requires exactly 2 photos (currently {count})")
    return {"errors": errors, "warnings": warnings,
            "photo_counts": {section: sum(photo.section == section for photo in photos) for section in sorted({photo.section for photo in photos})},
            "measurement_count": len(measurements), "issue_count": len(issues)}

"""Deterministic preflight from persisted QC facts."""
from __future__ import annotations

from sqlmodel import Session, select

from app.models.tables import Inspection, InspectionPhoto, Issue, Measurement


def inspect_report(session: Session, inspection: Inspection, template_ready: bool) -> dict:
    photos = session.exec(select(InspectionPhoto).where(InspectionPhoto.inspection_id == inspection.id)).all()
    issues = session.exec(select(Issue).where(Issue.inspection_id == inspection.id)).all()
    measurements = session.exec(select(Measurement).where(Measurement.inspection_id == inspection.id)).all()
    errors: list[str] = []
    warnings: list[str] = []
    if not template_ready:
        errors.append("DOCX template is not ready")
    if not all((inspection.customer_name, inspection.product_name, inspection.po, inspection.qc_name, inspection.quantity)):
        errors.append("Required report header is incomplete")
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
    return {"errors": errors, "warnings": warnings,
            "photo_counts": {section: sum(photo.section == section for photo in photos) for section in sorted({photo.section for photo in photos})},
            "measurement_count": len(measurements), "issue_count": len(issues)}

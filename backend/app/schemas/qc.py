"""Validated write contracts; all numeric facts come from QC input."""
from __future__ import annotations

from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

InspectionType = Literal["INLINE", "FINAL", "PRE_SHIPMENT", "OTHER"]
Section = Literal["PRODUCT_VIEW", "PRODUCT_DETAIL", "DRAWING", "DIMENSION", "MC", "GLOSS", "SWATCH", "ISSUE", "OTHER"]
Category = Literal["DIMENSION", "MC", "GLOSS", "GAP", "RADIUS", "OTHER"]
IssueStatus = Literal["OPEN", "REPAIRED", "ACCEPTED"]
Status = Literal["DRAFT", "IN_PROGRESS", "REVIEW", "COMPLETED"]


def nonblank(value: str) -> str:
    result = value.strip()
    if not result:
        raise ValueError("required text is empty")
    return result


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CustomerIn(StrictModel):
    code: str = Field(max_length=40)
    name: str = Field(max_length=200)
    _code = field_validator("code")(nonblank)
    _name = field_validator("name")(nonblank)


class CustomerPatch(StrictModel):
    code: str | None = Field(default=None, max_length=40)
    name: str | None = Field(default=None, max_length=200)
    _code = field_validator("code")(lambda v: nonblank(v) if v is not None else v)
    _name = field_validator("name")(lambda v: nonblank(v) if v is not None else v)


class ProductIn(StrictModel):
    customer_id: str
    name: str = Field(max_length=200)
    code: str | None = Field(default=None, max_length=80)
    standard_dimensions: dict[str, float] = Field(default_factory=dict)
    _name = field_validator("name")(nonblank)


class ProductPatch(StrictModel):
    name: str | None = Field(default=None, max_length=200)
    code: str | None = Field(default=None, max_length=80)
    standard_dimensions: dict[str, float] | None = None
    _name = field_validator("name")(lambda v: nonblank(v) if v is not None else v)


class InspectionIn(StrictModel):
    product_id: str
    po: str = Field(max_length=200)
    inspection_type: InspectionType
    date: Date
    location: str | None = Field(default=None, max_length=120)
    qc_name: str = Field(max_length=160)
    quantity: int = Field(gt=0)
    aql: str | None = Field(default=None, max_length=80)
    inspected_quantity: int | None = Field(default=None, ge=0)
    product_dimensions: dict[str, float] | None = None
    box_dimensions: dict[str, float] = Field(default_factory=dict)
    _po = field_validator("po")(nonblank)
    _qc = field_validator("qc_name")(nonblank)


class InspectionPatch(StrictModel):
    po: str | None = Field(default=None, max_length=200)
    inspection_type: InspectionType | None = None
    date: Date | None = None
    location: str | None = Field(default=None, max_length=120)
    qc_name: str | None = Field(default=None, max_length=160)
    quantity: int | None = Field(default=None, gt=0)
    aql: str | None = Field(default=None, max_length=80)
    inspected_quantity: int | None = Field(default=None, ge=0)
    product_dimensions: dict[str, float] | None = None
    box_dimensions: dict[str, float] | None = None
    status: Status | None = None
    conclusion: str | None = None
    communication_status: str | None = None
    revision: int = Field(ge=1)
    _po = field_validator("po")(lambda v: nonblank(v) if v is not None else v)
    _qc = field_validator("qc_name")(lambda v: nonblank(v) if v is not None else v)


class MeasurementIn(StrictModel):
    category: Category
    label: str = Field(max_length=200)
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    unit: str | None = Field(default=None, max_length=24)
    standard_value: float | None = None
    tolerance_plus: float | None = Field(default=None, ge=0)
    tolerance_minus: float | None = Field(default=None, ge=0)
    notes: str | None = None
    sort_order: int = Field(default=0, ge=0)
    _label = field_validator("label")(nonblank)

    @model_validator(mode="after")
    def valid_range(self) -> "MeasurementIn":
        if self.value_min is not None and self.value_max is not None and self.value_min > self.value_max:
            raise ValueError("value_min must not exceed value_max")
        return self


class MeasurementPatch(StrictModel):
    category: Category | None = None
    label: str | None = Field(default=None, max_length=200)
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    unit: str | None = None
    standard_value: float | None = None
    tolerance_plus: float | None = Field(default=None, ge=0)
    tolerance_minus: float | None = Field(default=None, ge=0)
    notes: str | None = None
    sort_order: int | None = Field(default=None, ge=0)
    _label = field_validator("label")(lambda v: nonblank(v) if v is not None else v)


class ReadingIn(StrictModel):
    value: float
    photo_id: str | None = None
    sort_order: int = Field(default=0, ge=0)


class IssueIn(StrictModel):
    defect_type: str = Field(max_length=160)
    quantity: int | None = Field(default=None, gt=0)
    description: str | None = None
    cause: str | None = None
    repair: str | None = None
    cap: str | None = None
    severity: Literal["MINOR", "MAJOR", "CRITICAL"] | None = None
    status: IssueStatus = "OPEN"
    sort_order: int = Field(default=0, ge=0)
    _defect = field_validator("defect_type")(nonblank)


class IssuePatch(StrictModel):
    defect_type: str | None = Field(default=None, max_length=160)
    quantity: int | None = Field(default=None, gt=0)
    description: str | None = None
    cause: str | None = None
    repair: str | None = None
    cap: str | None = None
    severity: Literal["MINOR", "MAJOR", "CRITICAL"] | None = None
    status: IssueStatus | None = None
    sort_order: int | None = Field(default=None, ge=0)
    _defect = field_validator("defect_type")(lambda v: nonblank(v) if v is not None else v)


class PhotoPatch(StrictModel):
    section: Section | None = None
    caption: str | None = None
    sort_order: int | None = Field(default=None, ge=0)
    issue_id: str | None = None
    rotate_degrees: Literal[90, 180, 270] | None = None


class DefectIn(StrictModel):
    name: str = Field(max_length=160)
    aliases: list[str] = Field(default_factory=list)
    default_causes: list[str] = Field(default_factory=list)
    default_repairs: list[str] = Field(default_factory=list)
    default_cap: list[str] = Field(default_factory=list)
    _name = field_validator("name")(nonblank)

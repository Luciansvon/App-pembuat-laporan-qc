"""Persisted QC facts. All public writes go through validated API schemas."""
from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel


def new_id() -> str:
    return str(uuid4())


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Customer(SQLModel, table=True):
    __tablename__ = "customers"
    id: str = Field(default_factory=new_id, primary_key=True)
    code: str = Field(index=True, unique=True)
    name: str
    created_at: datetime = Field(default_factory=utc_now)


class Product(SQLModel, table=True):
    __tablename__ = "products"
    id: str = Field(default_factory=new_id, primary_key=True)
    customer_id: str = Field(foreign_key="customers.id", index=True)
    name: str
    code: str | None = None
    standard_dimensions: dict[str, float] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now)


class Inspection(SQLModel, table=True):
    __tablename__ = "inspections"
    id: str = Field(default_factory=new_id, primary_key=True)
    inspection_number: str = Field(index=True, unique=True)
    customer_id: str = Field(foreign_key="customers.id", index=True)
    product_id: str = Field(foreign_key="products.id", index=True)
    customer_name: str
    customer_code: str
    product_name: str
    po: str
    inspection_type: str
    date: date
    location: str | None = None
    qc_name: str
    quantity: int
    aql: str | None = None
    inspected_quantity: int | None = None
    product_dimensions: dict[str, float] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    box_dimensions: dict[str, float] = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    status: str = "DRAFT"
    conclusion: str | None = None
    communication_status: str | None = None
    revision: int = 1
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class Measurement(SQLModel, table=True):
    __tablename__ = "measurements"
    id: str = Field(default_factory=new_id, primary_key=True)
    inspection_id: str = Field(foreign_key="inspections.id", index=True)
    category: str
    label: str
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    unit: str | None = None
    standard_value: float | None = None
    tolerance_plus: float | None = None
    tolerance_minus: float | None = None
    result: str = "INFO"
    notes: str | None = None
    provenance: str = "USER"
    sort_order: int = 0


class TestReading(SQLModel, table=True):
    __tablename__ = "test_readings"
    id: str = Field(default_factory=new_id, primary_key=True)
    measurement_id: str = Field(foreign_key="measurements.id", index=True)
    value: float
    photo_id: str | None = Field(default=None, foreign_key="photos.id")
    sort_order: int = 0


class Issue(SQLModel, table=True):
    __tablename__ = "issues"
    id: str = Field(default_factory=new_id, primary_key=True)
    inspection_id: str = Field(foreign_key="inspections.id", index=True)
    defect_type: str
    quantity: int | None = None
    description: str | None = None
    cause: str | None = None
    repair: str | None = None
    cap: str | None = None
    severity: str | None = None
    status: str = "OPEN"
    ai_generated: bool = False
    sort_order: int = 0
    created_at: datetime = Field(default_factory=utc_now)


class InspectionPhoto(SQLModel, table=True):
    __tablename__ = "photos"
    id: str = Field(default_factory=new_id, primary_key=True)
    inspection_id: str = Field(foreign_key="inspections.id", index=True)
    section: str
    file_path: str
    caption: str | None = None
    sort_order: int = 0
    issue_id: str | None = Field(default=None, foreign_key="issues.id")
    created_at: datetime = Field(default_factory=utc_now)


class DefectLibrary(SQLModel, table=True):
    __tablename__ = "defect_library"
    __table_args__ = (UniqueConstraint("name", name="uq_defect_name"),)
    id: str = Field(default_factory=new_id, primary_key=True)
    name: str
    aliases: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    default_causes: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    default_repairs: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    default_cap: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    source: str = "USER"

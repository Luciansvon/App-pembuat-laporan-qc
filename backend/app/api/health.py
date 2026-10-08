from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter()


class Capabilities(BaseModel):
    inspections: bool = True
    docx: bool = True
    offline_pwa: bool = False


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    version: str = "0.1.0"
    stage: Literal["foundation"] = "foundation"
    database: Literal["connected"] = "connected"
    capabilities: Capabilities


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    try:
        with request.app.state.engine.connect() as connection:
            if connection.execute(text("SELECT 1")).scalar_one() != 1:
                raise HTTPException(status_code=503, detail="Local database unavailable")
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Local database unavailable") from exc
    return HealthResponse(capabilities=Capabilities())


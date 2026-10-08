from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlmodel import Session

from app.api.health import router
from app.api.qc import router as qc_router
from app.core.config import RESOURCE_ROOT, Settings, load_settings
from app.database.engine import create_database_engine
from app.services.defects import seed_defects


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or load_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        migration_config = Config(str(RESOURCE_ROOT / "backend" / "alembic.ini"))
        migration_config.set_main_option("sqlalchemy.url", "sqlite://")
        if ScriptDirectory.from_config(migration_config).get_current_head() is None:
            raise RuntimeError("No database migration revisions found")
        # The migration environment reads this task's configured local data path.
        import os
        previous_data_dir = os.environ.get("QC_DATA_DIR")
        os.environ["QC_DATA_DIR"] = str(config.data_dir)
        try:
            command.upgrade(migration_config, "head")
        finally:
            if previous_data_dir is None:
                os.environ.pop("QC_DATA_DIR", None)
            else:
                os.environ["QC_DATA_DIR"] = previous_data_dir
        engine = create_database_engine(config)
        application.state.engine = engine
        application.state.settings = config
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1")).scalar_one()
            with Session(engine) as session:
                seed_defects(session)
            yield
        finally:
            engine.dispose()

    application = FastAPI(title="Inspectra", version="0.1.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(config.allowed_origins),
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-Confirm-Delete"],
    )
    application.include_router(router, prefix="/api", tags=["foundation"])
    application.include_router(qc_router, prefix="/api", tags=["qc"])
    built_frontend = RESOURCE_ROOT / "frontend" / "dist"
    if built_frontend.is_dir():
        application.mount("/", StaticFiles(directory=built_frontend, html=True), name="frontend")
    return application


app = create_app()


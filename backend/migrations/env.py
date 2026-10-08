"""Migration environment. Import domain models here when STEP 6 is implemented."""
from alembic import context
from sqlmodel import SQLModel

from app.core.config import load_settings
from app.database.engine import create_database_engine
from app.models import tables  # noqa: F401 - register SQLModel metadata

target_metadata = SQLModel.metadata
settings = load_settings()

if context.is_offline_mode():
    # URL quoting is delegated to SQLAlchemy for Windows paths.
    from sqlalchemy import URL

    url = URL.create("sqlite", database=str(settings.database_path))
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_database_engine(settings)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


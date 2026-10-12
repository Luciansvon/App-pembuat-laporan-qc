"""Persist user-selected photo layout pages."""
from alembic import op

revision = "d5e6f7a8b9c0"
down_revision = "c4f1a2b8d3e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inspections ADD COLUMN photo_pages JSON NOT NULL DEFAULT '[]'")


def downgrade() -> None:
    op.execute("ALTER TABLE inspections DROP COLUMN photo_pages")

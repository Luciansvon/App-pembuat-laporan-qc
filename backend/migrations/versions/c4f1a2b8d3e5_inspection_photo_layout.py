"""Per-section report photo layout picked by QC, defaulting to 2 columns."""
from alembic import op

revision = "c4f1a2b8d3e5"
down_revision = "8c91d2e4a760"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inspections ADD COLUMN photo_layout JSON NOT NULL DEFAULT '{}'")


def downgrade() -> None:
    op.execute("ALTER TABLE inspections DROP COLUMN photo_layout")

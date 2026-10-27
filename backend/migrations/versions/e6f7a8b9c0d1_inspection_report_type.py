"""Persist user-selected report format type (STANDARD vs COMBINED)."""
from alembic import op

revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE inspections ADD COLUMN report_type VARCHAR(40) NOT NULL DEFAULT 'STANDARD'")


def downgrade() -> None:
    op.execute("ALTER TABLE inspections DROP COLUMN report_type")

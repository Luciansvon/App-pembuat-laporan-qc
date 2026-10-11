"""Link dimension photos to two explicit slots per measurement, preserving old photos."""
from alembic import op

revision = "8c91d2e4a760"
down_revision = "446c624e36d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite supports nullable REFERENCES on ADD COLUMN. Avoid rebuilding photos,
    # which existing test_readings may reference while foreign_keys is enabled.
    op.execute("ALTER TABLE photos ADD COLUMN measurement_id VARCHAR REFERENCES measurements(id)")
    op.execute("ALTER TABLE photos ADD COLUMN dimension_slot INTEGER "
               "CONSTRAINT ck_photos_dimension_slot CHECK ("
               "(measurement_id IS NULL AND dimension_slot IS NULL) OR "
               "(measurement_id IS NOT NULL AND dimension_slot IS NOT NULL AND dimension_slot IN (1, 2)))")
    op.create_index("ix_photos_measurement_id", "photos", ["measurement_id"])
    op.create_index("uq_photos_dimension_slot", "photos", ["measurement_id", "dimension_slot"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_photos_dimension_slot", table_name="photos")
    op.drop_index("ix_photos_measurement_id", table_name="photos")
    op.execute("ALTER TABLE photos DROP COLUMN dimension_slot")
    op.execute("ALTER TABLE photos DROP COLUMN measurement_id")

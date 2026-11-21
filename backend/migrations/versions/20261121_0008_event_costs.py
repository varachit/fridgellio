"""Record the proportional cost of inventory events."""

import sqlalchemy as sa
from alembic import op

revision = "20261121_0008"
down_revision = "20261121_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("inventory_events", sa.Column("cost", sa.Numeric(12, 2)))
    op.create_check_constraint(
        "ck_event_cost",
        "inventory_events",
        "cost IS NULL OR (cost >= 0 AND cost <> 'NaN'::numeric)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_event_cost", "inventory_events", type_="check")
    op.drop_column("inventory_events", "cost")

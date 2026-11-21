"""Record stock additions in inventory history."""

from alembic import op

revision = "20261121_0004"
down_revision = "20261121_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_event_kind", "inventory_events", type_="check")
    op.create_check_constraint(
        "ck_event_kind", "inventory_events", "kind IN ('added', 'used', 'discarded')"
    )


def downgrade() -> None:
    # PostgreSQL rejects this downgrade if addition events exist.
    op.drop_constraint("ck_event_kind", "inventory_events", type_="check")
    op.create_check_constraint("ck_event_kind", "inventory_events", "kind IN ('used', 'discarded')")

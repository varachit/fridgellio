"""Distinguish groceries discarded after expiry."""

from alembic import op

revision = "20261121_0007"
down_revision = "20261121_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_event_kind", "inventory_events", type_="check")
    op.create_check_constraint(
        "ck_event_kind",
        "inventory_events",
        "kind IN ('added', 'used', 'discarded', 'expired')",
    )


def downgrade() -> None:
    op.execute("UPDATE inventory_events SET kind = 'discarded' WHERE kind = 'expired'")
    op.drop_constraint("ck_event_kind", "inventory_events", type_="check")
    op.create_check_constraint(
        "ck_event_kind",
        "inventory_events",
        "kind IN ('added', 'used', 'discarded')",
    )

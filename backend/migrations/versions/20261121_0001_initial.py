"""Create the account, pantry, equipment, and menu schema."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20261121_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("issuer", sa.String(512), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("language", sa.String(2), nullable=False, server_default="en"),
        sa.UniqueConstraint("issuer", "subject", name="uq_accounts_identity"),
        sa.CheckConstraint("language IN ('en', 'th')", name="ck_accounts_language"),
    )
    op.create_table(
        "households",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False),
    )
    op.create_table(
        "household_memberships",
        sa.Column("account_id", sa.Uuid(), sa.ForeignKey("accounts.id"), primary_key=True),
        sa.Column("household_id", sa.Uuid(), sa.ForeignKey("households.id"), nullable=False),
    )
    op.create_index(
        "ix_household_memberships_household_id", "household_memberships", ["household_id"]
    )
    op.create_table(
        "household_invitations",
        sa.Column("token_digest", sa.String(64), primary_key=True),
        sa.Column("household_id", sa.Uuid(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_household_invitations_household_id", "household_invitations", ["household_id"]
    )
    op.create_table(
        "avoided_foods",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("account_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("name_key", sa.String(), nullable=False),
        sa.UniqueConstraint("account_id", "name_key", name="uq_avoided_food_name"),
    )
    op.create_table(
        "stock_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("household_id", sa.Uuid(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("name_en", sa.String(200)),
        sa.Column("name_th", sa.String(200)),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=False),
        sa.Column("unit", sa.String(4), nullable=False),
        sa.Column("location", sa.String(7), nullable=False),
        sa.Column("expiry_date", sa.Date()),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "quantity >= 0 AND quantity <> 'NaN'::numeric",
            name="ck_stock_quantity",
        ),
        sa.CheckConstraint("unit IN ('each', 'g', 'kg', 'ml', 'l')", name="ck_stock_unit"),
        sa.CheckConstraint("unit <> 'each' OR quantity = trunc(quantity)", name="ck_stock_count"),
        sa.CheckConstraint(
            "location IN ('pantry', 'fridge', 'freezer', 'other')",
            name="ck_stock_location",
        ),
    )
    op.create_index("ix_stock_household_expiry", "stock_entries", ["household_id", "expiry_date"])
    op.create_table(
        "inventory_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("stock_id", sa.Uuid(), sa.ForeignKey("stock_entries.id"), nullable=False),
        sa.Column("actor_account_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("item_name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(9), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=False),
        sa.Column("unit", sa.String(4), nullable=False),
        sa.Column("idempotency_key", sa.String(128)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("quantity > 0 AND quantity <> 'NaN'::numeric", name="ck_event_quantity"),
        sa.CheckConstraint("kind IN ('used', 'discarded')", name="ck_event_kind"),
        sa.CheckConstraint("unit IN ('each', 'g', 'kg', 'ml', 'l')", name="ck_event_unit"),
        sa.CheckConstraint("unit <> 'each' OR quantity = trunc(quantity)", name="ck_event_count"),
        sa.UniqueConstraint(
            "stock_id", "actor_account_id", "idempotency_key", name="uq_events_stock_request"
        ),
    )
    op.create_index("ix_events_stock_created", "inventory_events", ["stock_id", "created_at"])
    op.create_table(
        "equipment",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("household_id", sa.Uuid(), sa.ForeignKey("households.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
    )
    op.create_index("ix_equipment_household_id", "equipment", ["household_id"])
    op.create_table(
        "menus",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("account_id", sa.Uuid(), sa.ForeignKey("accounts.id"), nullable=False),
        sa.Column("dishes", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_menus_account_id", "menus", ["account_id"])


def downgrade() -> None:
    op.drop_table("menus")
    op.drop_table("equipment")
    op.drop_table("inventory_events")
    op.drop_table("stock_entries")
    op.drop_table("avoided_foods")
    op.drop_table("household_invitations")
    op.drop_table("household_memberships")
    op.drop_table("households")
    op.drop_table("accounts")

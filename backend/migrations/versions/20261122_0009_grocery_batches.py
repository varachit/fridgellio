"""Record confirmed shopping trips and aggregate review feedback."""

import sqlalchemy as sa
from alembic import op

revision = "20261122_0009"
down_revision = "20261121_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "grocery_batches",
        sa.Column("household_id", sa.Uuid(), sa.ForeignKey("households.id"), primary_key=True),
        sa.Column("account_id", sa.Uuid(), sa.ForeignKey("accounts.id"), primary_key=True),
        sa.Column("request_id", sa.Uuid(), primary_key=True),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("source", sa.String(8), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("offered", sa.Integer(), nullable=False),
        sa.Column("removed", sa.Integer(), nullable=False),
        sa.Column("corrected", sa.Integer(), nullable=False),
        sa.Column("saved", sa.Integer(), nullable=False),
        sa.Column("elapsed_seconds", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("grocery_batches")

"""Add optional profile fields to household member accounts."""

import sqlalchemy as sa
from alembic import op

revision = "20261121_0003"
down_revision = "20261121_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("first_name", sa.String(200), nullable=True))
    op.add_column("accounts", sa.Column("last_name", sa.String(200), nullable=True))
    op.add_column("accounts", sa.Column("profile_picture_url", sa.String(2048), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "profile_picture_url")
    op.drop_column("accounts", "last_name")
    op.drop_column("accounts", "first_name")

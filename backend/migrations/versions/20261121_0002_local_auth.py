"""Add local credentials and sessions while retaining existing account IDs."""

import sqlalchemy as sa
from alembic import op

revision = "20261121_0002"
down_revision = "20261121_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("accounts", "issuer", existing_type=sa.String(512), nullable=True)
    op.alter_column("accounts", "subject", existing_type=sa.String(255), nullable=True)
    op.create_table(
        "account_credentials",
        sa.Column(
            "account_id",
            sa.Uuid(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("username", sa.String(32), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.UniqueConstraint("username", name="uq_account_credentials_username"),
    )
    op.create_table(
        "account_sessions",
        sa.Column("token_digest", sa.String(64), primary_key=True),
        sa.Column(
            "account_id",
            sa.Uuid(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_account_sessions_account_id", "account_sessions", ["account_id"])
    op.create_index("ix_account_sessions_expires_at", "account_sessions", ["expires_at"])
    op.create_table(
        "auth_rate_limits",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_rate_limits_expires_at", "auth_rate_limits", ["expires_at"])


def downgrade() -> None:
    # PostgreSQL rejects this downgrade if a locally registered account exists.
    op.alter_column("accounts", "issuer", existing_type=sa.String(512), nullable=False)
    op.alter_column("accounts", "subject", existing_type=sa.String(255), nullable=False)
    op.drop_table("auth_rate_limits")
    op.drop_table("account_sessions")
    op.drop_table("account_credentials")

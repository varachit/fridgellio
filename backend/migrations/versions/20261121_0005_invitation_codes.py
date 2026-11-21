"""Use independent invitation IDs and retain revoked codes."""

import sqlalchemy as sa
from alembic import op

revision = "20261121_0005"
down_revision = "20261121_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("household_invitations", sa.Column("id", sa.String(64)))
    op.execute("UPDATE household_invitations SET id = token_digest")
    op.alter_column("household_invitations", "id", nullable=False)
    op.create_unique_constraint("uq_household_invitations_id", "household_invitations", ["id"])
    op.add_column("household_invitations", sa.Column("revoked_at", sa.DateTime(timezone=True)))


def downgrade() -> None:
    # The previous API cannot redeem short codes or represent revoked invitations.
    op.execute(
        "DELETE FROM household_invitations WHERE id <> token_digest OR revoked_at IS NOT NULL"
    )
    op.drop_column("household_invitations", "revoked_at")
    op.drop_constraint("uq_household_invitations_id", "household_invitations", type_="unique")
    op.drop_column("household_invitations", "id")

"""Track the estimated price of remaining stock."""

import sqlalchemy as sa
from alembic import op

revision = "20261121_0006"
down_revision = "20261121_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stock_entries", sa.Column("price", sa.Numeric(12, 2)))
    op.create_check_constraint(
        "ck_stock_price",
        "stock_entries",
        "price IS NULL OR (price >= 0 AND price <> 'NaN'::numeric)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_stock_price", "stock_entries", type_="check")
    op.drop_column("stock_entries", "price")

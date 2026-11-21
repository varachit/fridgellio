from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("issuer", "subject", name="uq_accounts_identity"),
        CheckConstraint("language IN ('en', 'th')", name="ck_accounts_language"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    first_name: Mapped[str | None] = mapped_column(String(200))
    last_name: Mapped[str | None] = mapped_column(String(200))
    profile_picture_url: Mapped[str | None] = mapped_column(String(2048))
    issuer: Mapped[str | None] = mapped_column(String(512))
    subject: Mapped[str | None] = mapped_column(String(255))
    language: Mapped[str] = mapped_column(String(2), server_default="en")


class AccountCredential(Base):
    __tablename__ = "account_credentials"
    __table_args__ = (UniqueConstraint("username", name="uq_account_credentials_username"),)

    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True
    )
    username: Mapped[str] = mapped_column(String(32))
    password_hash: Mapped[str] = mapped_column(String(255))


class AccountSession(Base):
    __tablename__ = "account_sessions"

    token_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class AuthRateLimit(Base):
    __tablename__ = "auth_rate_limits"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    attempts: Mapped[int]
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Household(Base):
    __tablename__ = "households"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    created_by: Mapped[UUID] = mapped_column(ForeignKey("accounts.id"))


class HouseholdMembership(Base):
    __tablename__ = "household_memberships"

    account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id"), primary_key=True)
    household_id: Mapped[UUID] = mapped_column(ForeignKey("households.id"), index=True)


class HouseholdInvitation(Base):
    __tablename__ = "household_invitations"
    __table_args__ = (UniqueConstraint("id", name="uq_household_invitations_id"),)

    token_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    id: Mapped[str] = mapped_column(String(64))
    household_id: Mapped[UUID] = mapped_column(ForeignKey("households.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AvoidedFood(Base):
    __tablename__ = "avoided_foods"
    __table_args__ = (UniqueConstraint("account_id", "name_key", name="uq_avoided_food_name"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id"))
    name: Mapped[str] = mapped_column(String(200))
    name_key: Mapped[str]


class StockEntry(Base):
    __tablename__ = "stock_entries"
    __table_args__ = (
        CheckConstraint("quantity >= 0 AND quantity <> 'NaN'::numeric", name="ck_stock_quantity"),
        CheckConstraint("unit IN ('each', 'g', 'kg', 'ml', 'l')", name="ck_stock_unit"),
        CheckConstraint("unit <> 'each' OR quantity = trunc(quantity)", name="ck_stock_count"),
        CheckConstraint(
            "price IS NULL OR (price >= 0 AND price <> 'NaN'::numeric)",
            name="ck_stock_price",
        ),
        CheckConstraint(
            "location IN ('pantry', 'fridge', 'freezer', 'other')",
            name="ck_stock_location",
        ),
        Index("ix_stock_household_expiry", "household_id", "expiry_date"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(ForeignKey("households.id"))
    name: Mapped[str] = mapped_column(String(200))
    name_en: Mapped[str | None] = mapped_column(String(200))
    name_th: Mapped[str | None] = mapped_column(String(200))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    unit: Mapped[str] = mapped_column(String(4))
    location: Mapped[str] = mapped_column(String(7))
    expiry_date: Mapped[date | None]
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class InventoryEvent(Base):
    __tablename__ = "inventory_events"
    __table_args__ = (
        CheckConstraint("quantity > 0 AND quantity <> 'NaN'::numeric", name="ck_event_quantity"),
        CheckConstraint("kind IN ('added', 'used', 'discarded')", name="ck_event_kind"),
        CheckConstraint("unit IN ('each', 'g', 'kg', 'ml', 'l')", name="ck_event_unit"),
        CheckConstraint("unit <> 'each' OR quantity = trunc(quantity)", name="ck_event_count"),
        UniqueConstraint(
            "stock_id", "actor_account_id", "idempotency_key", name="uq_events_stock_request"
        ),
        Index("ix_events_stock_created", "stock_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    stock_id: Mapped[UUID] = mapped_column(ForeignKey("stock_entries.id"))
    actor_account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id"))
    item_name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(9))
    quantity: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    unit: Mapped[str] = mapped_column(String(4))
    idempotency_key: Mapped[str | None] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    household_id: Mapped[UUID] = mapped_column(ForeignKey("households.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))


class Menu(Base):
    __tablename__ = "menus"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id"), index=True)
    dishes: Mapped[list[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

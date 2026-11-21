from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal, cast

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, field_serializer
from sqlalchemy import select

from .data import Member, Session
from .models import InventoryEvent, StockEntry
from .schemas import CalendarDate

router = APIRouter(prefix="/statistics", tags=["Statistics"])
Today = Annotated[CalendarDate | None, Query(description="Client's local calendar date")]


class Amounts(BaseModel):
    each: Decimal = Decimal(0)
    g: Decimal = Decimal(0)
    ml: Decimal = Decimal(0)

    @field_serializer("each", "g", "ml", when_used="json")
    def serialize_amount(self, value: Decimal) -> str:
        return format(value.normalize(), "f")


class MonthlyStatistic(BaseModel):
    month: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}$")
    used: Amounts
    expired: Amounts
    used_cost: Decimal = Decimal(0)
    expired_cost: Decimal = Decimal(0)

    @field_serializer("used_cost", "expired_cost", when_used="json")
    def serialize_cost(self, value: Decimal) -> str:
        return format(value, ".2f")


class StatisticsView(BaseModel):
    months: list[MonthlyStatistic]


def shift_month(month: date, offset: int) -> date:
    index = month.year * 12 + month.month - 1 + offset
    return date(index // 12, index % 12 + 1, 1)


def add_amount(amounts: Amounts, quantity: Decimal, unit: str) -> None:
    normalized = cast(Literal["each", "g", "ml"], {"kg": "g", "l": "ml"}.get(unit, unit))
    multiplier = Decimal(1000) if unit in {"kg", "l"} else Decimal(1)
    setattr(amounts, normalized, getattr(amounts, normalized) + quantity * multiplier)


@router.get("", summary="Compare used groceries with expiry loss")
async def grocery_statistics(
    member: Member,
    session: Session,
    today: Today = None,
    months: Annotated[int, Query(ge=1, le=12)] = 6,
    utc_offset_minutes: Annotated[int, Query(ge=-840, le=840)] = 0,
) -> StatisticsView:
    local_today = today or datetime.now(UTC).date()
    current = local_today.replace(day=1)
    offset = timedelta(minutes=utc_offset_minutes)
    start = shift_month(current, 1 - months)
    end = shift_month(current, 1)
    result = await session.execute(
        select(InventoryEvent, StockEntry.expiry_date)
        .join(StockEntry, StockEntry.id == InventoryEvent.stock_id)
        .where(
            StockEntry.household_id == member.household_id,
            InventoryEvent.created_at >= datetime.combine(start, datetime.min.time(), UTC) - offset,
            InventoryEvent.created_at < datetime.combine(end, datetime.min.time(), UTC) - offset,
            InventoryEvent.kind.in_(("used", "discarded", "expired")),
        )
        .order_by(InventoryEvent.created_at, InventoryEvent.id)
    )
    buckets = {
        shift_month(current, offset).strftime("%Y-%m"): MonthlyStatistic(
            month=shift_month(current, offset).strftime("%Y-%m"),
            used=Amounts(),
            expired=Amounts(),
            used_cost=Decimal(0),
            expired_cost=Decimal(0),
        )
        for offset in range(1 - months, 1)
    }
    for event, expiry_date in result:
        local_created = event.created_at + offset
        bucket = buckets.get(local_created.strftime("%Y-%m"))
        if bucket is None:
            continue
        expired = event.kind == "expired" or (
            event.kind == "discarded"
            and expiry_date is not None
            and expiry_date < local_created.date()
        )
        if event.kind == "used":
            add_amount(bucket.used, event.quantity, event.unit)
            bucket.used_cost += event.cost or Decimal(0)
        elif expired:
            add_amount(bucket.expired, event.quantity, event.unit)
            bucket.expired_cost += event.cost or Decimal(0)
    return StatisticsView(months=list(buckets.values()))

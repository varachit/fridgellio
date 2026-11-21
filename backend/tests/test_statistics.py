import asyncio
from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fridgellio.statistics import grocery_statistics


def event(kind, quantity, unit, created_at, cost=None):
    return SimpleNamespace(
        id=kind + str(quantity),
        kind=kind,
        quantity=Decimal(quantity),
        unit=unit,
        created_at=created_at,
        cost=Decimal(cost) if cost is not None else None,
    )


def test_monthly_statistics_normalize_units_and_only_count_expiry_loss():
    rows = [
        (event("used", "0.5", "kg", datetime(2026, 11, 2, tzinfo=UTC), "40.00"), None),
        (event("used", "2", "each", datetime(2026, 11, 3, tzinfo=UTC), "12.50"), None),
        (
            event("expired", "250", "ml", datetime(2026, 11, 4, tzinfo=UTC), "18.00"),
            date(2026, 11, 1),
        ),
        (
            event("discarded", "0.25", "l", datetime(2026, 10, 5, tzinfo=UTC), "22.00"),
            date(2026, 10, 1),
        ),
        (
            event("discarded", "100", "g", datetime(2026, 10, 6, tzinfo=UTC)),
            date(2026, 10, 10),
        ),
    ]
    session = SimpleNamespace(execute=AsyncMock(return_value=rows))

    result = asyncio.run(
        grocery_statistics(
            SimpleNamespace(household_id="household"),
            session,
            today=date(2026, 11, 21),
            months=2,
        )
    )

    assert [month.month for month in result.months] == ["2026-10", "2026-11"]
    october, november = result.months
    assert october.expired.ml == 250
    assert october.expired_cost == Decimal("22.00")
    assert october.expired.g == 0
    assert november.used.g == 500
    assert november.used.each == 2
    assert november.expired.ml == 250
    assert november.used_cost == Decimal("52.50")
    assert november.expired_cost == Decimal("18.00")
    assert session.execute.await_count == 1

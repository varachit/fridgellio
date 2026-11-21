from collections import defaultdict
from datetime import UTC, date, datetime
from decimal import Decimal
from hashlib import sha256
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Response
from pydantic import Field
from sqlalchemy import select

from .data import Member, Session
from .errors import ApiError, responses
from .models import InventoryEvent, StockEntry
from .preferences import name_key
from .recommendations import base_unit, eligible_stock, money, stock_groups, unit_factor
from .schemas import CalendarDate, IngredientAmount, InputModel, LocalizedText

router = APIRouter(prefix="/menus", tags=["Menus"])


class CookMealRequest(InputModel):
    name: LocalizedText
    ingredients: list[IngredientAmount] = Field(min_length=1)
    today: CalendarDate | None = None


def ingredient_deductions(
    ingredients: list[IngredientAmount], entries: list[StockEntry]
) -> dict[StockEntry, Decimal]:
    groups = stock_groups(entries, [])
    aliases: dict[tuple[str, str], set[str]] = defaultdict(set)
    for (key, unit), lots in groups.items():
        for lot in lots:
            for alias in (lot.name, lot.name_en, lot.name_th):
                if alias:
                    aliases[name_key(alias), unit].add(key)
    deductions: dict[StockEntry, Decimal] = defaultdict(Decimal)
    for ingredient in ingredients:
        unit = base_unit(ingredient.unit)
        names = {name_key(ingredient.name.en), name_key(ingredient.name.th)}
        keys = {key for key in names if (key, unit) in groups}
        if not keys and len(names) == 1:
            # A single-language purchase may have gained a translation since recommendation.
            matches = aliases.get((name_key(ingredient.name.en), unit), set())
            if len(matches) == 1:
                keys = matches
        lots = sorted(
            (lot for key in keys for lot in groups[key, unit]),
            key=lambda lot: (
                lot.expiry_date is None,
                lot.expiry_date or date.max,
                lot.id,
            ),
        )
        needed = ingredient.quantity * unit_factor(ingredient.unit)
        for lot in lots:
            available = lot.quantity * unit_factor(lot.unit) - deductions.get(lot, 0)
            used = min(needed, available)
            if used:
                deductions[lot] += used
                needed -= used
            if not needed:
                break
        if needed:
            raise ApiError(
                409,
                "meal_stock_shortage",
                "There is not enough eligible stock for this recipe.",
            )
    return deductions


def deduct_ingredient(lot: StockEntry, used: Decimal, account_id: UUID) -> InventoryEvent:
    factor = unit_factor(lot.unit)
    original = lot.quantity * factor
    remaining = original - used
    quantity = used / factor
    if quantity != quantity.quantize(Decimal("0.000001")):
        # Keep sub-milligram or sub-microlitre deductions exact in a six-decimal stock column.
        if max(remaining, used) >= 10**12:
            raise ApiError(
                409,
                "meal_quantity_precision",
                "The exact deduction exceeds the stock column precision.",
            )
        lot.quantity = remaining
        lot.unit = base_unit(lot.unit)
        quantity = used
    else:
        lot.quantity -= quantity
    cost = None
    if lot.price is not None:
        remaining_price = money(lot.price * remaining / original)
        cost = lot.price - remaining_price
        lot.price = remaining_price
    return InventoryEvent(
        stock_id=lot.id,
        actor_account_id=account_id,
        item_name=lot.name,
        kind="used",
        quantity=quantity,
        cost=cost,
        unit=lot.unit,
    )


@router.post(
    "/cooked",
    summary="Deduct a cooked recipe's ingredients once",
    status_code=204,
    responses=responses(409),
)
async def record_cooked_meal(
    body: CookMealRequest,
    member: Member,
    session: Session,
    idempotency_key: Annotated[
        UUID, Header(description="Reuse the recipe ID when retrying this meal.")
    ],
) -> Response:
    # Manual entry keys cannot contain slashes. Every usage event from this meal shares this key.
    prefix = f"meal/{idempotency_key.hex}/"
    recipe = body.model_dump_json(exclude={"today"})
    event_key = prefix + sha256(recipe.encode()).hexdigest()
    # Serialize this member's retries before looking for events, even when the stock is now gone.
    await session.refresh(member, with_for_update=True)
    previous = await session.scalar(
        select(InventoryEvent.idempotency_key)
        .join(StockEntry, StockEntry.id == InventoryEvent.stock_id)
        .where(
            StockEntry.household_id == member.household_id,
            InventoryEvent.actor_account_id == member.account_id,
            InventoryEvent.idempotency_key.startswith(prefix),
        )
        .limit(1)
    )
    if previous is not None:
        if previous != event_key:
            raise ApiError(409, "idempotency_conflict", "This request key has already been used.")
        return Response(status_code=204)

    today = body.today or datetime.now(UTC).date()
    entries = await session.scalars(
        eligible_stock(member.household_id, today).order_by(StockEntry.id).with_for_update()
    )
    for lot, used in ingredient_deductions(body.ingredients, list(entries)).items():
        event = deduct_ingredient(lot, used, member.account_id)
        event.idempotency_key = event_key
        session.add(event)
    await session.commit()
    return Response(status_code=204)

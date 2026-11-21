from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_serializer
from sqlalchemy import or_, select

from .data import Member, Session
from .models import AvoidedFood, Equipment, StockEntry
from .preferences import name_key
from .schemas import CalendarDate, InputModel, Name, Unit

router = APIRouter(prefix="/menus", tags=["Menus"])


class MealPreferences(InputModel):
    servings: int = Field(default=2, ge=1, strict=True)
    dietary_styles: list[Name] = Field(default_factory=list, examples=[["Vegan", "Halal"]])
    nutrition_goal: Name | None = Field(default=None, examples=["High protein"])
    cuisines: list[Name] = Field(default_factory=list, examples=[["Thai", "Japanese"]])
    max_total_minutes: Literal[15, 30, 60, 120] | None = None
    difficulty: Literal["any", "easy", "medium", "hard"] = "any"


class RecommendationRequest(MealPreferences):
    today: CalendarDate | None = None
    foods_to_avoid: list[Name] | None = Field(
        default=None, description="Omit to use personal settings. An empty list allows all foods."
    )
    equipment: list[Name] | None = Field(
        default=None,
        description="Omit to use household settings. An empty list means no equipment.",
    )


class RequestPreferences(MealPreferences):
    foods_to_avoid: list[str]
    equipment: list[str]


class AvailableIngredient(BaseModel):
    name: str
    name_en: str | None
    name_th: str | None
    quantity: Decimal
    unit: Unit

    @field_serializer("quantity", when_used="json")
    def serialize_quantity(self, value: Decimal) -> str:
        return format(value.normalize(), "f")


class RecommendationPreview(BaseModel):
    status: Literal["preview"] = "preview"
    recipe_limit: Literal[5] = 5
    preferences: RequestPreferences
    ingredients: list[AvailableIngredient]


def available_ingredients(
    entries: list[StockEntry], avoided: list[str]
) -> list[AvailableIngredient]:
    excluded = {name_key(name) for name in avoided}
    # Match single-language purchases to an entry with a saved translation.
    canonical_names = {
        name_key(alias): name_key(entry.name_en or entry.name)
        for entry in entries
        if entry.name_en or entry.name_th
        for alias in (entry.name, entry.name_en, entry.name_th)
        if alias
    }
    grouped: dict[tuple[str, str], AvailableIngredient] = {}
    for entry in entries:
        names = [name for name in (entry.name, entry.name_en, entry.name_th) if name]
        if any(name_key(name) in excluded for name in names):
            continue
        unit = {"kg": "g", "l": "ml"}.get(entry.unit, entry.unit)
        quantity = entry.quantity * (1000 if entry.unit != unit else 1)
        primary = name_key(entry.name)
        key = (canonical_names.get(primary, primary), unit)
        if key in grouped:
            ingredient = grouped[key]
            ingredient.quantity += quantity
            ingredient.name_en = ingredient.name_en or entry.name_en
            ingredient.name_th = ingredient.name_th or entry.name_th
        else:
            grouped[key] = AvailableIngredient(
                name=entry.name,
                name_en=entry.name_en,
                name_th=entry.name_th,
                quantity=quantity,
                unit=unit,
            )
    return list(grouped.values())


@router.post("/recommendations", summary="Preview a pantry-only recipe request")
async def recommend_recipes(
    body: RecommendationRequest, member: Member, session: Session
) -> RecommendationPreview:
    """Resolve this request's settings and eligible quantities. V1 previews the inputs
    for up to five recipes. It does not call a model or save a menu or settings.
    """
    avoided = body.foods_to_avoid
    if avoided is None:
        avoided = list(
            await session.scalars(
                select(AvoidedFood.name)
                .where(AvoidedFood.account_id == member.account_id)
                .order_by(AvoidedFood.name_key, AvoidedFood.id)
            )
        )
    equipment = body.equipment
    if equipment is None:
        equipment = list(
            await session.scalars(
                select(Equipment.name)
                .where(Equipment.household_id == member.household_id)
                .order_by(Equipment.name, Equipment.id)
            )
        )
    today = body.today or datetime.now(UTC).date()
    entries = await session.scalars(
        select(StockEntry)
        .where(
            StockEntry.household_id == member.household_id,
            StockEntry.removed_at.is_(None),
            StockEntry.quantity > 0,
            or_(StockEntry.expiry_date.is_(None), StockEntry.expiry_date >= today),
        )
        .order_by(StockEntry.name, StockEntry.id)
    )
    return RecommendationPreview(
        preferences=RequestPreferences(
            **body.model_dump(exclude={"today", "foods_to_avoid", "equipment"}),
            foods_to_avoid=avoided,
            equipment=equipment,
        ),
        ingredients=available_ingredients(list(entries), avoided),
    )

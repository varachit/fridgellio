import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
    model_validator,
)

Language = Literal["en", "th"]
Unit = Literal["each", "g", "kg", "ml", "l"]
Location = Literal["pantry", "fridge", "freezer", "other"]
Expiry = Literal["past_date", "due_today", "use_soon", "later", "no_date"]
Name = Annotated[
    str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=200)
]


def decimal_input(value: object) -> object:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{1,12}(\.[0-9]{1,6})?", value):
        raise ValueError("Enter a decimal string with up to 12 whole and 6 fractional digits")
    return value


def calendar_date(value: object) -> object:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("Enter a calendar date in YYYY-MM-DD format")
    return value


Quantity = Annotated[
    Decimal,
    Field(gt=0, max_digits=18, decimal_places=6),
    BeforeValidator(decimal_input, json_schema_input_type=str),
]
Price = Annotated[
    Decimal,
    Field(ge=0, max_digits=12, decimal_places=2),
    BeforeValidator(decimal_input, json_schema_input_type=str),
]
CalendarDate = Annotated[date, BeforeValidator(calendar_date, json_schema_input_type=str)]


def count_is_valid(unit: str, quantity: Decimal) -> bool:
    return unit != "each" or quantity == quantity.to_integral_value()


def expiry_status(expiry: date | None, today: date) -> Expiry:
    if expiry is None:
        return "no_date"
    days = (expiry - today).days
    if days < 0:
        return "past_date"
    if days == 0:
        return "due_today"
    return "use_soon" if days <= 3 else "later"


def expiry_bounds(today: date) -> date:
    return today + timedelta(days=min(3, (date.max - today).days))


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OutputModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class StockCreate(InputModel):
    name: Name
    name_en: Name | None = None
    name_th: Name | None = None
    quantity: Quantity
    price: Price | None = None
    unit: Unit
    location: Location
    expiry_date: CalendarDate | None = None

    @model_validator(mode="after")
    def validate_count(self):
        if not count_is_valid(self.unit, self.quantity):
            raise ValueError("Quantity must be a whole number for each")
        return self


class StockPatch(InputModel):
    name: Name | None = None
    name_en: Name | None = None
    name_th: Name | None = None
    quantity: Quantity | None = None
    price: Price | None = None
    unit: Unit | None = None
    location: Location | None = None
    expiry_date: CalendarDate | None = None

    @field_validator("name", "quantity", "unit", "location")
    @classmethod
    def required_when_present(cls, value):
        if value is None:
            raise ValueError("This field cannot be null")
        return value


class StockView(OutputModel):
    id: UUID
    name: str
    name_en: str | None
    name_th: str | None
    quantity: Decimal
    price: Decimal | None
    unit: Unit
    location: Location
    expiry_date: date | None
    expiry_status: Expiry

    @field_serializer("quantity", when_used="json")
    def serialize_quantity(self, quantity: Decimal) -> str:
        return format(quantity.normalize(), "f")

    @field_serializer("price", when_used="json")
    def serialize_price(self, price: Decimal | None) -> str | None:
        return format(price, ".2f") if price is not None else None


class EventCreate(InputModel):
    kind: Literal["used", "discarded"]
    quantity: Quantity


class EventView(OutputModel):
    id: UUID
    stock_id: UUID
    actor_account_id: UUID
    item_name: str
    kind: Literal["added", "used", "discarded"]
    quantity: Decimal
    unit: Unit
    created_at: datetime

    @field_serializer("quantity", when_used="json")
    def serialize_quantity(self, quantity: Decimal) -> str:
        return format(quantity.normalize(), "f")


class DeductionView(BaseModel):
    entry: StockView
    event: EventView


class EquipmentInput(InputModel):
    name: Name


class EquipmentView(OutputModel):
    id: UUID
    name: str


class Preferences(InputModel):
    language: Language


class AvoidedFoodInput(InputModel):
    name: Name


class AvoidedFoodView(OutputModel):
    id: UUID
    name: str


class HouseholdView(BaseModel):
    id: UUID
    can_invite: bool


class HouseholdMemberView(OutputModel):
    id: UUID
    username: str | None
    first_name: str | None
    last_name: str | None
    profile_picture_url: str | None
    is_owner: bool


class InvitationInput(InputModel):
    token: Annotated[
        str,
        StringConstraints(
            strict=True,
            strip_whitespace=True,
            pattern=r"^(?:[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}|[A-Za-z0-9_-]{43})$",
        ),
    ]

    @field_validator("token")
    @classmethod
    def canonical_code(cls, token: str) -> str:
        if len(token) == 43:
            return token
        code = token.replace("-", "").upper()
        return f"{code[:4]}-{code[4:]}"


class PendingInvitationView(BaseModel):
    id: str
    expires_at: datetime


class InvitationView(PendingInvitationView):
    token: str


class BarcodeView(BaseModel):
    code: str
    name: str
    name_en: str | None = None
    name_th: str | None = None
    brands: str
    quantity: float | None = Field(default=None, gt=0, allow_inf_nan=False, alias="Quantity")
    unit: str | None = Field(default=None, alias="Unit")


class ErrorField(BaseModel):
    path: list[str | int]
    message: str


class ErrorView(BaseModel):
    code: str
    message: str
    request_id: str
    fields: list[ErrorField] = Field(default_factory=list)


class HealthView(BaseModel):
    status: Literal["ok"] = "ok"


class LocalizedText(BaseModel):
    en: Name
    th: Name


class PhotoSuggestion(BaseModel):
    name: LocalizedText
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=6)
    unit: Unit | None
    expiry_date: date | None

    @model_validator(mode="after")
    def validate_measurement(self):
        if (self.quantity is None) != (self.unit is None):
            raise ValueError("Quantity and unit must be provided together")
        if (
            self.quantity is not None
            and self.unit is not None
            and not count_is_valid(self.unit, self.quantity)
        ):
            raise ValueError("Quantity must be a whole number for each")
        return self


class PhotoAnalysis(BaseModel):
    suggestions: list[PhotoSuggestion]


class MenuRequest(InputModel):
    today: CalendarDate | None = None


class MenuIngredient(BaseModel):
    reference: str
    name: LocalizedText
    quantity: Decimal
    unit: Unit


class MenuEquipment(BaseModel):
    reference: UUID
    name: LocalizedText


class MenuDish(BaseModel):
    name: LocalizedText
    ingredients: list[MenuIngredient] = Field(min_length=1)
    equipment: list[MenuEquipment]
    steps: list[LocalizedText] = Field(min_length=1)


class GeneratedMenu(BaseModel):
    id: UUID
    created_at: datetime
    dishes: list[MenuDish] = Field(min_length=1)

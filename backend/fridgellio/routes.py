from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Path, Query, Request, Response
from sqlalchemy import or_, select, update

from .auth import router as auth_router
from .barcodes import lookup_barcode
from .data import CurrentAccount, Member, Session, owned_stock, stock_view
from .errors import ApiError, responses
from .households import router as households_router
from .models import Equipment, InventoryEvent, Menu, StockEntry
from .preferences import router as preferences_router
from .schemas import (
    BarcodeView,
    CalendarDate,
    DeductionView,
    EquipmentInput,
    EquipmentView,
    EventCreate,
    EventView,
    Expiry,
    GeneratedMenu,
    Language,
    Location,
    MenuRequest,
    PhotoAnalysis,
    StockCreate,
    StockPatch,
    StockView,
    count_is_valid,
    expiry_bounds,
)

api = APIRouter(prefix="/api", responses=responses(401, 403, 422, 503))
api.include_router(auth_router)
api.include_router(households_router)
api.include_router(preferences_router)
Today = Annotated[CalendarDate | None, Query(description="Client's local calendar date")]
PageSize = Annotated[int, Query(ge=1, le=200)]
PageOffset = Annotated[int, Query(ge=0)]


def local_day(today: date | None) -> date:
    return today if today is not None else datetime.now(UTC).date()


@api.get("/inventory", tags=["Inventory"])
async def list_inventory(
    member: Member,
    session: Session,
    today: Today = None,
    search: Annotated[str | None, Query(max_length=200)] = None,
    location: Location | None = None,
    expiry: Expiry | None = None,
    limit: PageSize = 100,
    offset: PageOffset = 0,
) -> list[StockView]:
    day = local_day(today)
    statement = select(StockEntry).where(
        StockEntry.household_id == member.household_id,
        StockEntry.quantity > 0,
        StockEntry.removed_at.is_(None),
    )
    if search and search.strip():
        pattern = search.strip()
        statement = statement.where(
            or_(
                StockEntry.name.icontains(pattern, autoescape=True),
                StockEntry.name_en.icontains(pattern, autoescape=True),
                StockEntry.name_th.icontains(pattern, autoescape=True),
            )
        )
    if location is not None:
        statement = statement.where(StockEntry.location == location)
    if expiry is not None:
        expiry_date = StockEntry.expiry_date
        filters = {
            "past_date": expiry_date < day,
            "due_today": expiry_date == day,
            "use_soon": expiry_date.between(day, expiry_bounds(day)),
            "later": expiry_date > expiry_bounds(day),
            "no_date": expiry_date.is_(None),
        }
        statement = statement.where(filters[expiry])
    entries = await session.scalars(
        statement.order_by(StockEntry.expiry_date.nulls_last(), StockEntry.id)
        .limit(limit)
        .offset(offset)
    )
    return [stock_view(entry, day) for entry in entries]


@api.post("/inventory", tags=["Inventory"], status_code=201)
async def create_stock(
    body: StockCreate,
    member: Member,
    session: Session,
    today: Today = None,
) -> StockView:
    entry = StockEntry(household_id=member.household_id, **body.model_dump())
    session.add(entry)
    await session.commit()
    return stock_view(entry, local_day(today))


@api.patch("/inventory/{entry_id}", tags=["Inventory"], responses=responses(404))
async def edit_stock(
    entry_id: UUID,
    body: StockPatch,
    member: Member,
    session: Session,
    today: Today = None,
) -> StockView:
    entry = await owned_stock(session, member.household_id, entry_id, lock=True)
    changes = body.model_dump(exclude_unset=True)
    if not count_is_valid(changes.get("unit", entry.unit), changes.get("quantity", entry.quantity)):
        raise ApiError(422, "invalid_count", "Quantity must be a whole number for each.")
    for field, value in changes.items():
        setattr(entry, field, value)
    await session.commit()
    return stock_view(entry, local_day(today))


@api.delete("/inventory/{entry_id}", tags=["Inventory"], status_code=204, responses=responses(404))
async def remove_stock(entry_id: UUID, member: Member, session: Session) -> Response:
    entry = await owned_stock(
        session, member.household_id, entry_id, lock=True, include_removed=True
    )
    if entry.removed_at is None:
        entry.removed_at = datetime.now(UTC)
    await session.commit()
    return Response(status_code=204)


@api.get("/inventory-history", tags=["Inventory"])
async def household_history(
    member: Member,
    session: Session,
    limit: PageSize = 100,
    offset: PageOffset = 0,
) -> list[EventView]:
    events = await session.scalars(
        select(InventoryEvent)
        .join(StockEntry, StockEntry.id == InventoryEvent.stock_id)
        .where(StockEntry.household_id == member.household_id)
        .order_by(InventoryEvent.created_at.desc(), InventoryEvent.id)
        .limit(limit)
        .offset(offset)
    )
    return [EventView.model_validate(event) for event in events]


@api.get("/inventory/{entry_id}/events", tags=["Inventory"], responses=responses(404))
async def inventory_events(
    entry_id: UUID,
    member: Member,
    session: Session,
    limit: PageSize = 100,
    offset: PageOffset = 0,
) -> list[EventView]:
    await owned_stock(session, member.household_id, entry_id, include_removed=True)
    result = await session.scalars(
        select(InventoryEvent)
        .where(InventoryEvent.stock_id == entry_id)
        .order_by(InventoryEvent.created_at.desc(), InventoryEvent.id)
        .limit(limit)
        .offset(offset)
    )
    return [EventView.model_validate(event) for event in result]


@api.post(
    "/inventory/{entry_id}/events",
    tags=["Inventory"],
    status_code=201,
    responses={200: {"model": DeductionView}, **responses(404, 409)},
)
async def record_event(
    entry_id: UUID,
    body: EventCreate,
    member: Member,
    session: Session,
    response: Response,
    today: Today = None,
    idempotency_key: Annotated[
        str | None, Header(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$")
    ] = None,
) -> DeductionView:
    entry = await owned_stock(
        session, member.household_id, entry_id, lock=True, include_removed=True
    )
    if idempotency_key is not None:
        previous = await session.scalar(
            select(InventoryEvent).where(
                InventoryEvent.stock_id == entry_id,
                InventoryEvent.actor_account_id == member.account_id,
                InventoryEvent.idempotency_key == idempotency_key,
            )
        )
        if previous is not None:
            if (previous.kind, previous.quantity) != (body.kind, body.quantity):
                raise ApiError(
                    409, "idempotency_conflict", "This request key has already been used."
                )
            response.status_code = 200
            return DeductionView(
                entry=stock_view(entry, local_day(today)),
                event=EventView.model_validate(previous),
            )

    if entry.removed_at is not None:
        raise ApiError(404, "stock_not_found", "The stock entry was not found.")
    if not count_is_valid(entry.unit, body.quantity):
        raise ApiError(422, "invalid_count", "Quantity must be a whole number for each.")
    remaining = await session.scalar(
        update(StockEntry)
        .where(
            StockEntry.id == entry.id,
            StockEntry.household_id == member.household_id,
            StockEntry.quantity >= body.quantity,
        )
        .values(quantity=StockEntry.quantity - body.quantity)
        .returning(StockEntry.quantity)
    )
    if remaining is None:
        raise ApiError(409, "insufficient_stock", "The deduction exceeds available stock.")
    entry.quantity = remaining
    event = InventoryEvent(
        stock_id=entry.id,
        actor_account_id=member.account_id,
        item_name=entry.name,
        unit=entry.unit,
        **body.model_dump(),
        idempotency_key=idempotency_key,
    )
    session.add(event)
    await session.commit()
    return DeductionView(
        entry=stock_view(entry, local_day(today)), event=EventView.model_validate(event)
    )


@api.get("/equipment", tags=["Equipment"])
async def list_equipment(
    member: Member,
    session: Session,
    limit: PageSize = 100,
    offset: PageOffset = 0,
) -> list[EquipmentView]:
    result = await session.scalars(
        select(Equipment)
        .where(Equipment.household_id == member.household_id)
        .order_by(Equipment.name, Equipment.id)
        .limit(limit)
        .offset(offset)
    )
    return [EquipmentView.model_validate(item) for item in result]


@api.post("/equipment", tags=["Equipment"], status_code=201)
async def add_equipment(body: EquipmentInput, member: Member, session: Session) -> EquipmentView:
    equipment = Equipment(household_id=member.household_id, name=body.name)
    session.add(equipment)
    await session.commit()
    return EquipmentView.model_validate(equipment)


async def owned_equipment(equipment_id: UUID, member: Member, session: Session) -> Equipment:
    equipment = await session.scalar(
        select(Equipment)
        .where(Equipment.id == equipment_id, Equipment.household_id == member.household_id)
        .with_for_update()
    )
    if equipment is None:
        raise ApiError(404, "equipment_not_found", "The equipment was not found.")
    return equipment


@api.patch("/equipment/{equipment_id}", tags=["Equipment"], responses=responses(404))
async def edit_equipment(
    equipment_id: UUID,
    body: EquipmentInput,
    member: Member,
    session: Session,
) -> EquipmentView:
    equipment = await owned_equipment(equipment_id, member, session)
    equipment.name = body.name
    await session.commit()
    return EquipmentView.model_validate(equipment)


@api.delete(
    "/equipment/{equipment_id}", tags=["Equipment"], status_code=204, responses=responses(404)
)
async def delete_equipment(equipment_id: UUID, member: Member, session: Session) -> Response:
    equipment = await owned_equipment(equipment_id, member, session)
    await session.delete(equipment)
    await session.commit()
    return Response(status_code=204)


@api.get("/barcodes/{code}", tags=["Grocery intake"], responses=responses(404, 502, 504))
async def barcode(
    code: Annotated[str, Path(pattern=r"^[0-9]{4,24}$", examples=["0881234567890"])],
    request: Request,
    account: CurrentAccount,
    session: Session,
    language: Language | None = None,
) -> BarcodeView:
    locale = language or account.language
    await session.rollback()
    return await lookup_barcode(request.app.state.barcode_client, code, locale)


@api.post(
    "/photos/analyze",
    tags=["Grocery intake"],
    responses=responses(501),
    summary="Analyze a grocery photo (placeholder)",
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["photo"],
                        "properties": {
                            "photo": {"type": "string", "format": "binary"},
                        },
                    }
                },
            },
        }
    },
)
async def analyze_photo(account: CurrentAccount) -> PhotoAnalysis:
    raise ApiError(501, "ai_not_implemented", "Photo analysis is not available yet.")


@api.get("/menus", tags=["Menus"])
async def saved_menus(
    account: CurrentAccount,
    session: Session,
    limit: PageSize = 100,
    offset: PageOffset = 0,
) -> list[GeneratedMenu]:
    menus = await session.scalars(
        select(Menu)
        .where(Menu.account_id == account.id)
        .order_by(Menu.created_at.desc(), Menu.id)
        .limit(limit)
        .offset(offset)
    )
    return [GeneratedMenu.model_validate(menu, from_attributes=True) for menu in menus]


@api.post(
    "/menus",
    tags=["Menus"],
    responses=responses(501),
    summary="Generate a bilingual menu (placeholder)",
)
async def generate_menu(account: CurrentAccount, body: MenuRequest | None = None) -> GeneratedMenu:
    raise ApiError(501, "ai_not_implemented", "Menu generation is not available yet.")

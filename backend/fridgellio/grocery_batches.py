import hashlib
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Header, Response
from pydantic import Field, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert

from .data import Member, Session, record_additions
from .errors import ApiError, responses
from .models import GroceryBatch, InventoryEvent, StockEntry
from .schemas import InputModel, Location, Name, StockCreate

router = APIRouter(prefix="/inventory", tags=["Grocery intake"])
Count = Annotated[int, Field(ge=0, le=40)]


BatchKey = Annotated[UUID, Header(alias="Idempotency-Key")]
VERSION = "batch-v2"


class BatchStart(InputModel):
    source: Literal["photo", "list", "receipt"]


class BatchCreate(BatchStart):
    items: list[StockCreate] = Field(min_length=1, max_length=40)
    offered: Count
    removed: Count
    corrected: Count
    elapsed_seconds: int = Field(ge=0, le=604800)

    @model_validator(mode="after")
    def check_counts(self):
        retained = self.offered - self.removed
        if not 0 <= self.corrected <= retained <= len(self.items):
            raise ValueError("Review counts must match the batch")
        return self


class BatchResult(InputModel):
    saved: int


class HintRequest(InputModel):
    names: list[Name] = Field(min_length=1, max_length=40)


@router.post("/location-hints", summary="Suggest previously confirmed household storage locations")
async def location_hints(
    body: HintRequest, member: Member, session: Session
) -> dict[str, Location]:
    names = {name.lower() for name in body.names}
    fields = (StockEntry.name, StockEntry.name_en, StockEntry.name_th)
    rows = await session.execute(
        select(*fields, StockEntry.location, InventoryEvent.created_at)
        .join(InventoryEvent, InventoryEvent.stock_id == StockEntry.id)
        .where(
            StockEntry.household_id == member.household_id,
            StockEntry.removed_at.is_(None),
            InventoryEvent.kind == "added",
            or_(*(func.lower(f).in_(names) for f in fields)),
        )
        .order_by(InventoryEvent.created_at.desc())
    )
    latest = {}
    for name, en, th, location, added in rows:
        for key in {n.lower() for n in (name, en, th) if n} & names:
            if key not in latest:
                latest[key] = (added, location)
            elif latest[key][0] == added and latest[key][1] != location:
                latest[key] = (added, None)
    return {
        name: latest[name.lower()][1]
        for name in body.names
        if name.lower() in latest and latest[name.lower()][1] is not None
    }


@router.post("/batch-starts", status_code=204, summary="Record an opened grocery intake method")
async def start_batch(
    body: BatchStart, member: Member, session: Session, request_id: BatchKey
) -> Response:
    await session.execute(
        insert(GroceryBatch)
        .values(
            household_id=member.household_id,
            account_id=member.account_id,
            request_id=request_id,
            source=body.source,
            version=VERSION,
            digest="",
            saved=0,
            offered=0,
            removed=0,
            corrected=0,
            elapsed_seconds=0,
        )
        .on_conflict_do_nothing()
    )
    await session.commit()
    return Response(status_code=204)


@router.post(
    "/batches",
    status_code=201,
    responses=responses(409),
    summary="Save one reviewed grocery batch atomically",
)
async def create_batch(
    body: BatchCreate,
    member: Member,
    session: Session,
    request_id: BatchKey,
) -> BatchResult:
    key = (member.household_id, member.account_id, request_id)
    digest = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
    values = {
        "digest": digest,
        "offered": body.offered,
        "removed": body.removed,
        "corrected": body.corrected,
        "saved": len(body.items),
        "elapsed_seconds": body.elapsed_seconds,
    }
    # A zero-item row represents an open attempt. Only the first confirmation can claim it.
    statement = insert(GroceryBatch).values(
        household_id=key[0],
        account_id=key[1],
        request_id=key[2],
        version=VERSION,
        source=body.source,
        **values,
    )
    claimed = await session.scalar(
        statement.on_conflict_do_update(
            index_elements=[
                GroceryBatch.household_id,
                GroceryBatch.account_id,
                GroceryBatch.request_id,
            ],
            set_=values,
            where=(GroceryBatch.saved == 0) & (GroceryBatch.source == body.source),
        ).returning(GroceryBatch.request_id)
    )
    if claimed is None:
        previous = await session.get(GroceryBatch, key)
        if previous.digest != digest:
            raise ApiError(
                409, "idempotency_conflict", "This batch was already saved with different contents."
            )
        return BatchResult(saved=previous.saved)
    await record_additions(session, member, body.items)
    await session.commit()
    return BatchResult(saved=len(body.items))

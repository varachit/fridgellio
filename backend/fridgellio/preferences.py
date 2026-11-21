from unicodedata import normalize
from uuid import UUID

from fastapi import APIRouter, Response
from pydantic import field_validator
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from .data import CurrentAccount, Session
from .errors import ApiError, responses
from .models import AvoidedFood
from .schemas import AvoidedFoodInput, AvoidedFoodView, InputModel, Name, OutputModel, Preferences

router = APIRouter(prefix="/preferences", tags=["Preferences"])


def name_key(name: str) -> str:
    return normalize("NFC", " ".join(name.split()).casefold())


class ProfilePatch(InputModel):
    first_name: Name | None = None
    last_name: Name | None = None

    @field_validator("first_name", "last_name")
    @classmethod
    def required_when_present(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("This field cannot be null")
        return value


class ProfileView(OutputModel):
    first_name: str | None
    last_name: str | None


@router.get("")
async def get_preferences(account: CurrentAccount) -> Preferences:
    return Preferences(language=account.language)


@router.patch("")
async def update_preferences(
    body: Preferences, account: CurrentAccount, session: Session
) -> Preferences:
    account.language = body.language
    await session.commit()
    return body


@router.get("/profile")
async def get_profile(account: CurrentAccount) -> ProfileView:
    return ProfileView.model_validate(account)


@router.patch("/profile", responses=responses(422))
async def update_profile(
    body: ProfilePatch, account: CurrentAccount, session: Session
) -> ProfileView:
    changes = body.model_dump(exclude_unset=True)
    first_name = changes.get("first_name", account.first_name)
    last_name = changes.get("last_name", account.last_name)
    if not (first_name or "").strip() or not (last_name or "").strip():
        raise ApiError(422, "profile_names_required", "Enter both a first name and a last name.")
    for field, value in changes.items():
        setattr(account, field, value)
    await session.commit()
    await session.refresh(account)
    return ProfileView.model_validate(account)


@router.get("/foods-to-avoid")
async def list_avoided_foods(account: CurrentAccount, session: Session) -> list[AvoidedFoodView]:
    foods = await session.scalars(
        select(AvoidedFood)
        .where(AvoidedFood.account_id == account.id)
        .order_by(AvoidedFood.name_key, AvoidedFood.id)
    )
    return [AvoidedFoodView.model_validate(food) for food in foods]


@router.post(
    "/foods-to-avoid",
    status_code=201,
    responses={200: {"model": AvoidedFoodView}, **responses(409)},
)
async def add_avoided_food(
    body: AvoidedFoodInput, account: CurrentAccount, session: Session, response: Response
) -> AvoidedFoodView:
    key = name_key(body.name)
    food = await session.scalar(
        insert(AvoidedFood)
        .values(account_id=account.id, name=body.name, name_key=key)
        .on_conflict_do_nothing(constraint="uq_avoided_food_name")
        .returning(AvoidedFood)
    )
    if food is None:
        response.status_code = 200
        food = (
            await session.scalars(
                select(AvoidedFood).where(
                    AvoidedFood.account_id == account.id, AvoidedFood.name_key == key
                )
            )
        ).one_or_none()
        if food is None:
            raise ApiError(409, "preference_changed", "The food preference changed. Try again.")
    await session.commit()
    return AvoidedFoodView.model_validate(food)


@router.delete("/foods-to-avoid/{food_id}", status_code=204, responses=responses(404))
async def remove_avoided_food(food_id: UUID, account: CurrentAccount, session: Session) -> Response:
    removed = await session.scalar(
        delete(AvoidedFood)
        .where(AvoidedFood.id == food_id, AvoidedFood.account_id == account.id)
        .returning(AvoidedFood.id)
    )
    if removed is None:
        raise ApiError(404, "food_preference_not_found", "The food preference was not found.")
    await session.commit()
    return Response(status_code=204)

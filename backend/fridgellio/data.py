import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import date
from hashlib import sha256
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .errors import ApiError
from .models import (
    Account,
    AccountCredential,
    AccountSession,
    HouseholdMembership,
    InventoryEvent,
    StockEntry,
)
from .schemas import StockCreate, StockView, expiry_status

bearer = HTTPBearer(auto_error=False, scheme_name="AccountSession")


def token_digest(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


async def db_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory = request.app.state.sessions
    if factory is None:
        raise ApiError(503, "database_unavailable", "The database is not configured.")
    async with factory() as session:
        yield session


Session = Annotated[AsyncSession, Depends(db_session)]


def request_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(bearer)],
) -> str:
    if credentials is None:
        raise ApiError(401, "authentication_required", "A session token is required.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", credentials.credentials):
        raise ApiError(401, "invalid_session", "The session is invalid or expired.")
    return token_digest(credentials.credentials)


@dataclass(frozen=True)
class SignedIn:
    account: Account
    username: str
    token_digest: str


async def current_login(
    digest: Annotated[str, Depends(request_token)], session: Session
) -> SignedIn:
    row = (
        await session.execute(
            select(Account, AccountCredential.username)
            .join(AccountSession, AccountSession.account_id == Account.id)
            .join(AccountCredential, AccountCredential.account_id == Account.id)
            .where(
                AccountSession.token_digest == digest,
                AccountSession.expires_at > func.clock_timestamp(),
            )
        )
    ).one_or_none()
    if row is None:
        raise ApiError(401, "invalid_session", "The session is invalid or expired.")
    account, username = row
    return SignedIn(account, username, digest)


CurrentLogin = Annotated[SignedIn, Depends(current_login)]


async def current_account(login: CurrentLogin) -> Account:
    return login.account


CurrentAccount = Annotated[Account, Depends(current_account)]


async def require_membership(account: CurrentAccount, session: Session) -> HouseholdMembership:
    membership = await session.get(HouseholdMembership, account.id)
    if membership is None:
        raise ApiError(403, "household_required", "Create or join a household first.")
    return membership


Member = Annotated[HouseholdMembership, Depends(require_membership)]


async def owned_stock(
    session: AsyncSession,
    household_id: UUID,
    entry_id: UUID,
    *,
    lock: bool = False,
    include_removed: bool = False,
) -> StockEntry:
    statement = select(StockEntry).where(
        StockEntry.id == entry_id,
        StockEntry.household_id == household_id,
    )
    if not include_removed:
        statement = statement.where(StockEntry.removed_at.is_(None))
    if lock:
        statement = statement.with_for_update()
    entry = await session.scalar(statement)
    if entry is None:
        raise ApiError(404, "stock_not_found", "The stock entry was not found.")
    return entry


def stock_view(entry: StockEntry, today: date) -> StockView:
    return StockView(
        id=entry.id,
        name=entry.name,
        name_en=entry.name_en,
        name_th=entry.name_th,
        quantity=entry.quantity.normalize(),
        price=entry.price,
        unit=entry.unit,
        location=entry.location,
        expiry_date=entry.expiry_date,
        expiry_status=expiry_status(entry.expiry_date, today),
    )


async def record_additions(
    session: AsyncSession, member: HouseholdMembership, items: list[StockCreate]
) -> list[StockEntry]:
    entries = [StockEntry(household_id=member.household_id, **item.model_dump()) for item in items]
    session.add_all(entries)
    await session.flush()
    session.add_all(
        [
            InventoryEvent(
                stock_id=entry.id,
                actor_account_id=member.account_id,
                item_name=entry.name,
                kind="added",
                quantity=entry.quantity,
                unit=entry.unit,
            )
            for entry in entries
        ]
    )
    return entries

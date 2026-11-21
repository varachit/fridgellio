from datetime import datetime, timedelta
from secrets import token_urlsafe
from typing import Annotated, Literal
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import APIRouter, Request, Response
from pydantic import Field, SecretStr, StringConstraints, field_validator
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from starlette.concurrency import run_in_threadpool

from .data import CurrentLogin, Session, token_digest
from .errors import ApiError, responses
from .models import Account, AccountCredential, AccountSession, AuthRateLimit
from .schemas import InputModel, Language, Name, OutputModel

router = APIRouter(prefix="/auth", tags=["Authentication"])
password_hasher = PasswordHasher(time_cost=2, memory_cost=19_456, parallelism=1)
# Verify against a valid hash even when the username is unknown.
DUMMY_HASH = (
    "$argon2id$v=19$m=19456,t=2,p=1$BK7EF18ZkO9MD00mDoud4w"
    "$FlgB8d1+xKODZgzQYcD619Zlj7CeGl/ZsR0szg0k8NI"
)
SESSION_LIFETIME = timedelta(days=7)
ATTEMPT_WINDOW = timedelta(minutes=15)


class LoginInput(InputModel):
    username: Annotated[
        str, StringConstraints(strict=True, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$")
    ]
    password: Annotated[SecretStr, Field(min_length=1, max_length=128)]

    @field_validator("username")
    @classmethod
    def canonical_username(cls, value: str) -> str:
        return value.lower()


class NewPasswordInput(LoginInput):
    password: Annotated[SecretStr, Field(min_length=8, max_length=128)]


class RegisterInput(NewPasswordInput):
    first_name: Name
    last_name: Name
    language: Language = "en"


class AccountView(OutputModel):
    id: UUID
    username: str
    first_name: str | None
    last_name: str | None
    profile_picture_url: str | None

    @classmethod
    def from_account(cls, account: Account, username: str) -> "AccountView":
        return cls(
            id=account.id,
            username=username,
            first_name=account.first_name,
            last_name=account.last_name,
            profile_picture_url=account.profile_picture_url,
        )


class SessionView(OutputModel):
    account: AccountView
    token: str
    token_type: Literal["bearer"] = "bearer"
    expires_at: datetime


async def take_attempt(session: Session, key: str, limit: int) -> bool:
    now = func.clock_timestamp()
    expired = AuthRateLimit.expires_at <= now
    statement = insert(AuthRateLimit).values(
        key=token_digest(key), attempts=1, expires_at=now + ATTEMPT_WINDOW
    )
    admitted = await session.scalar(
        statement.on_conflict_do_update(
            index_elements=[AuthRateLimit.key],
            set_={
                "attempts": case((expired, 1), else_=AuthRateLimit.attempts + 1),
                "expires_at": case(
                    (expired, statement.excluded.expires_at), else_=AuthRateLimit.expires_at
                ),
            },
            where=or_(expired, AuthRateLimit.attempts < limit),
        ).returning(AuthRateLimit.attempts)
    )
    return admitted is not None


async def rate_limit(
    session: Session, request: Request, *, login_username: str | None = None
) -> None:
    source = request.client.host if request.client else "unknown"
    if login_username is None:
        allowed = await take_attempt(session, f"register:source:{source}", 10)
    else:
        allowed = await take_attempt(session, f"login:source:{source}", 30)
        if allowed:
            allowed = await take_attempt(session, f"login:username:{login_username}", 10)
    await session.commit()
    if not allowed:
        raise ApiError(429, "auth_rate_limited", "Too many attempts. Try again in 15 minutes.")


async def issue_session(session: Session, account: Account, username: str) -> SessionView:
    token = token_urlsafe(32)
    now = await session.scalar(select(func.clock_timestamp()))
    expires_at = now + SESSION_LIFETIME
    await session.execute(
        delete(AccountSession).where(
            AccountSession.account_id == account.id,
            AccountSession.expires_at <= now,
        )
    )
    session.add(
        AccountSession(
            token_digest=token_digest(token),
            account_id=account.id,
            expires_at=expires_at,
        )
    )
    await session.commit()
    return SessionView(
        account=AccountView.from_account(account, username), token=token, expires_at=expires_at
    )


@router.post("/register", status_code=201, responses=responses(409, 429))
async def register(body: RegisterInput, request: Request, session: Session) -> SessionView:
    """Create a local account and issue a session."""
    await rate_limit(session, request)
    async with request.app.state.password_workers:
        password_hash = await run_in_threadpool(
            password_hasher.hash, body.password.get_secret_value()
        )
    account = Account(language=body.language, first_name=body.first_name, last_name=body.last_name)
    session.add(account)
    await session.flush()
    statement = (
        insert(AccountCredential)
        .values(account_id=account.id, username=body.username, password_hash=password_hash)
        .on_conflict_do_nothing(constraint="uq_account_credentials_username")
        .returning(AccountCredential.account_id)
    )
    if await session.scalar(statement) is None:
        raise ApiError(409, "username_unavailable", "Choose a different username.")
    return await issue_session(session, account, body.username)


@router.post("/login", responses=responses(429))
async def login(body: LoginInput, request: Request, session: Session) -> SessionView:
    """Sign in with a case-insensitive username and issue a new session."""
    await rate_limit(session, request, login_username=body.username)
    row = (
        await session.execute(
            select(AccountCredential.account_id, AccountCredential.password_hash).where(
                AccountCredential.username == body.username
            )
        )
    ).one_or_none()
    await session.rollback()

    password_hash = row.password_hash if row else DUMMY_HASH
    invalid = ApiError(401, "invalid_credentials", "The username or password is incorrect.")
    try:
        async with request.app.state.password_workers:
            await run_in_threadpool(
                password_hasher.verify, password_hash, body.password.get_secret_value()
            )
    except VerifyMismatchError:
        raise invalid from None
    if row is None:
        raise invalid

    # Serialize session issuance with password resets. A reset may have run while we verified.
    account = await session.scalar(
        select(Account)
        .join(AccountCredential, AccountCredential.account_id == Account.id)
        .where(Account.id == row.account_id, AccountCredential.password_hash == password_hash)
        .with_for_update(of=AccountCredential)
    )
    if account is None:
        raise invalid
    return await issue_session(session, account, body.username)


@router.get("/me")
async def get_me(login: CurrentLogin) -> AccountView:
    """Identify the signed-in account."""
    return AccountView.from_account(login.account, login.username)


@router.post("/logout", status_code=204)
async def logout(login: CurrentLogin, session: Session) -> Response:
    """Revoke the session used by this request."""
    await session.execute(
        delete(AccountSession).where(AccountSession.token_digest == login.token_digest)
    )
    await session.commit()
    return Response(status_code=204)

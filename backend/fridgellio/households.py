from datetime import timedelta
from secrets import choice, token_hex
from typing import Annotated

from fastapi import APIRouter, Path, Response
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from .auth import take_attempt
from .data import CurrentAccount, Member, Session, token_digest
from .errors import ApiError, responses
from .models import Account, AccountCredential, Household, HouseholdInvitation, HouseholdMembership
from .schemas import (
    HouseholdMemberView,
    HouseholdView,
    InvitationInput,
    InvitationView,
    PendingInvitationView,
)

router = APIRouter(prefix="/household", tags=["Household"])
INVITATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


async def prevent_second_membership(account: CurrentAccount, session: Session) -> None:
    await session.execute(select(Account.id).where(Account.id == account.id).with_for_update())
    if await session.get(HouseholdMembership, account.id) is not None:
        raise ApiError(409, "already_in_household", "This account already belongs to a household.")


@router.get("")
async def get_household(account: CurrentAccount, session: Session) -> HouseholdView | None:
    household = await session.scalar(
        select(Household)
        .join(HouseholdMembership, HouseholdMembership.household_id == Household.id)
        .where(HouseholdMembership.account_id == account.id)
    )
    if household is None:
        return None
    return HouseholdView(id=household.id, can_invite=household.created_by == account.id)


@router.post("", status_code=201, responses=responses(409))
async def create_household(account: CurrentAccount, session: Session) -> HouseholdView:
    await prevent_second_membership(account, session)
    household = Household(created_by=account.id)
    session.add(household)
    await session.flush()
    session.add(HouseholdMembership(account_id=account.id, household_id=household.id))
    await session.commit()
    return HouseholdView(id=household.id, can_invite=True)


@router.get("/members")
async def list_members(member: Member, session: Session) -> list[HouseholdMemberView]:
    is_owner = (Account.id == Household.created_by).label("is_owner")
    rows = await session.execute(
        select(
            Account.id,
            AccountCredential.username,
            Account.first_name,
            Account.last_name,
            Account.profile_picture_url,
            is_owner,
        )
        .select_from(HouseholdMembership)
        .join(Household, Household.id == HouseholdMembership.household_id)
        .join(Account, Account.id == HouseholdMembership.account_id)
        .outerjoin(AccountCredential, AccountCredential.account_id == Account.id)
        .where(HouseholdMembership.household_id == member.household_id)
        .order_by(is_owner.desc(), AccountCredential.username, Account.id)
    )
    return [HouseholdMemberView.model_validate(row) for row in rows]


async def require_invitation_owner(member: Member, session: Session) -> None:
    household = await session.get(Household, member.household_id)
    if household.created_by != member.account_id:
        raise ApiError(403, "invite_forbidden", "Only the household owner can manage invitations.")


@router.get("/invitations", responses=responses(403))
async def list_invitations(member: Member, session: Session) -> list[PendingInvitationView]:
    """List unexpired, unused invitations for the household owner."""
    await require_invitation_owner(member, session)
    rows = await session.execute(
        select(HouseholdInvitation.id, HouseholdInvitation.expires_at)
        .where(
            HouseholdInvitation.household_id == member.household_id,
            HouseholdInvitation.used_at.is_(None),
            HouseholdInvitation.revoked_at.is_(None),
            HouseholdInvitation.expires_at > func.clock_timestamp(),
        )
        .order_by(HouseholdInvitation.expires_at.desc(), HouseholdInvitation.id)
    )
    return [
        PendingInvitationView(id=invite_id, expires_at=expires_at) for invite_id, expires_at in rows
    ]


@router.post("/invitations", status_code=201, responses=responses(403, 503))
async def invite(member: Member, session: Session) -> InvitationView:
    """Create an invitation and return its shareable code once."""
    await require_invitation_owner(member, session)

    expires_at = await session.scalar(select(func.clock_timestamp())) + timedelta(hours=24)
    for _ in range(5):
        code = "".join(choice(INVITATION_ALPHABET) for _ in range(8))
        token = f"{code[:4]}-{code[4:]}"
        invite_id = await session.scalar(
            insert(HouseholdInvitation)
            .values(
                id=token_hex(32),
                token_digest=token_digest(token),
                household_id=member.household_id,
                expires_at=expires_at,
            )
            .on_conflict_do_nothing()
            .returning(HouseholdInvitation.id)
        )
        if invite_id is not None:
            await session.commit()
            return InvitationView(id=invite_id, token=token, expires_at=expires_at)
    raise ApiError(503, "invitation_creation_unavailable", "Try creating an invitation again.")


@router.delete("/invitations/{invitation_id}", status_code=204, responses=responses(403))
async def remove_invitation(
    invitation_id: Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")], member: Member, session: Session
) -> Response:
    """Revoke a pending invitation. Return 204 if it is already unavailable."""
    await require_invitation_owner(member, session)
    await session.execute(
        update(HouseholdInvitation)
        .where(
            HouseholdInvitation.id == invitation_id,
            HouseholdInvitation.household_id == member.household_id,
            HouseholdInvitation.used_at.is_(None),
            HouseholdInvitation.revoked_at.is_(None),
            HouseholdInvitation.expires_at > func.clock_timestamp(),
        )
        .values(revoked_at=func.clock_timestamp())
    )
    await session.commit()
    return Response(status_code=204)


@router.post("/join", status_code=201, responses=responses(404, 409, 429))
async def join_household(
    body: InvitationInput, account: CurrentAccount, session: Session
) -> HouseholdView:
    allowed = await take_attempt(session, f"household:join:{account.id}", 10)
    await session.commit()
    if not allowed:
        raise ApiError(429, "auth_rate_limited", "Too many attempts. Try again in 15 minutes.")

    await prevent_second_membership(account, session)
    digest = token_digest(body.token)
    household_id = await session.scalar(
        update(HouseholdInvitation)
        .where(
            HouseholdInvitation.token_digest == digest,
            HouseholdInvitation.used_at.is_(None),
            HouseholdInvitation.revoked_at.is_(None),
            HouseholdInvitation.expires_at > func.clock_timestamp(),
        )
        .values(used_at=func.clock_timestamp())
        .returning(HouseholdInvitation.household_id)
    )
    if household_id is None:
        raise ApiError(404, "invitation_unavailable", "The invitation is no longer available.")
    session.add(HouseholdMembership(account_id=account.id, household_id=household_id))
    await session.commit()
    return HouseholdView(id=household_id, can_invite=False)

from datetime import timedelta
from hashlib import sha256
from secrets import token_urlsafe

from fastapi import APIRouter
from sqlalchemy import func, select, update

from .data import CurrentAccount, Member, Session
from .errors import ApiError, responses
from .models import Account, Household, HouseholdInvitation, HouseholdMembership
from .schemas import HouseholdView, InvitationInput, InvitationView

router = APIRouter(prefix="/household", tags=["Household"])


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


@router.post("/invitations", status_code=201, responses=responses(403))
async def invite(member: Member, session: Session) -> InvitationView:
    household = await session.get(Household, member.household_id)
    if household.created_by != member.account_id:
        raise ApiError(403, "invite_forbidden", "Only the household creator can invite members.")

    token = token_urlsafe(32)
    expires_at = await session.scalar(select(func.clock_timestamp())) + timedelta(hours=24)
    session.add(
        HouseholdInvitation(
            token_digest=sha256(token.encode("ascii")).hexdigest(),
            household_id=household.id,
            expires_at=expires_at,
        )
    )
    await session.commit()
    return InvitationView(token=token, expires_at=expires_at)


@router.post("/join", status_code=201, responses=responses(404, 409))
async def join_household(
    body: InvitationInput, account: CurrentAccount, session: Session
) -> HouseholdView:
    await prevent_second_membership(account, session)
    digest = sha256(body.token.encode("ascii")).hexdigest()
    household_id = await session.scalar(
        update(HouseholdInvitation)
        .where(
            HouseholdInvitation.token_digest == digest,
            HouseholdInvitation.used_at.is_(None),
            HouseholdInvitation.expires_at > func.clock_timestamp(),
        )
        .values(used_at=func.clock_timestamp())
        .returning(HouseholdInvitation.household_id)
    )
    if household_id is None:
        raise ApiError(
            404, "invitation_unavailable", "The invitation is invalid, used, or expired."
        )
    session.add(HouseholdMembership(account_id=account.id, household_id=household_id))
    await session.commit()
    return HouseholdView(id=household_id, can_invite=False)

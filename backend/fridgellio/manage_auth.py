"""Manage Fridgellio credentials using direct, trusted database access."""

from argparse import ArgumentParser
from getpass import getpass
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import NewPasswordInput, password_hasher
from .config import Settings
from .models import Account, AccountCredential, AccountSession, AuthRateLimit


def set_password(
    session: Session, credentials: NewPasswordInput, legacy_account_id: UUID | None
) -> None:
    password_hash = password_hasher.hash(credentials.password.get_secret_value())
    if legacy_account_id is None:
        account = session.scalar(
            select(AccountCredential)
            .where(AccountCredential.username == credentials.username)
            .with_for_update()
        )
        if account is None:
            raise ValueError("The username was not found.")
        account.password_hash = password_hash
        session.execute(
            delete(AccountSession).where(AccountSession.account_id == account.account_id)
        )
        return

    legacy_id = session.scalar(
        select(Account.id)
        .where(Account.id == legacy_account_id, Account.issuer.is_not(None))
        .with_for_update()
    )
    if legacy_id is None:
        raise ValueError("The legacy account ID was not found.")
    if session.get(AccountCredential, legacy_id) is not None:
        raise ValueError("This account already has a local username.")
    session.add(
        AccountCredential(
            account_id=legacy_id, username=credentials.username, password_hash=password_hash
        )
    )


def main() -> None:
    parser = ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    set_credentials = commands.add_parser("set-password", help="Reset or provision credentials")
    set_credentials.add_argument("username")
    set_credentials.add_argument("--legacy-account-id", type=UUID)
    commands.add_parser("prune", help="Delete expired sessions and rate-limit records")
    args = parser.parse_args()

    url = Settings().postgres_url()
    if url is None:
        parser.error("Set DATABASE_URL before running this command.")
    engine = create_engine(url, hide_parameters=True)
    try:
        if args.command == "prune":
            with engine.begin() as connection:
                for model in (AccountSession, AuthRateLimit):
                    connection.execute(
                        delete(model).where(model.expires_at <= func.clock_timestamp())
                    )
            print("Expired authentication records removed.")
            return

        password = getpass("New password: ")
        if password != getpass("Confirm password: "):
            parser.error("The passwords do not match.")
        try:
            credentials = NewPasswordInput(username=args.username, password=password)
        except ValidationError:
            parser.error("Enter a valid username and a password with 8 to 128 characters.")
        try:
            with Session(engine) as session, session.begin():
                set_password(session, credentials, args.legacy_account_id)
        except IntegrityError:
            parser.error("Choose a different username.")
        except ValueError as error:
            parser.error(str(error))
        print("Password saved.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()

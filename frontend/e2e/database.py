"""Database scope and session checks for the isolated browser suite."""

import os
import sys
from uuid import UUID

from fridgellio.config import Settings
from fridgellio.models import AccountCredential, AccountSession, AuthRateLimit
from sqlalchemy import create_engine, delete, func, select, update

schema = "fridgellio_browser_" + UUID(os.environ["FRIDGELLIO_E2E_RUN_ID"]).hex
url = Settings(
    _env_file=None, database_url=os.environ["FRIDGELLIO_E2E_DATABASE_URL"]
).postgres_url()
scoped = url.update_query_dict({"options": f"-csearch_path={schema}"})

if __name__ == "__main__":
    operation, *args = sys.argv[1:]
    engine = create_engine(scoped, hide_parameters=True)
    with engine.begin() as connection:
        if operation == "start-test":
            # Browser cases share one loopback source and an isolated suite schema.
            connection.execute(delete(AuthRateLimit))
            connection.commit()
            sys.exit(0)
        (username,) = args
        account_id = connection.execute(
            select(AccountCredential.account_id).where(
                AccountCredential.username == username
            )
        ).scalar_one()
        owned = AccountSession.account_id == account_id
        if operation == "count":
            print(
                connection.scalar(
                    select(func.count()).select_from(AccountSession).where(owned)
                )
            )
        elif operation == "expire":
            connection.execute(
                update(AccountSession).where(owned).values(expires_at=func.now())
            )
        else:
            raise ValueError("Unknown session check")
    engine.dispose()

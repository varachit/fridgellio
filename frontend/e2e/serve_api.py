"""Run FastAPI against a fresh schema for each browser suite."""

import os

import uvicorn
from alembic import command
from alembic.config import Config
from database import schema, scoped, url
from sqlalchemy import create_engine
from sqlalchemy.schema import CreateSchema, DropSchema

admin = create_engine(url, hide_parameters=True)
with admin.begin() as connection:
    connection.execute(CreateSchema(schema))
try:
    os.environ["DATABASE_URL"] = scoped.render_as_string(hide_password=False)
    command.upgrade(Config("alembic.ini"), "head")
    uvicorn.run(
        "fridgellio.main:create_app",
        factory=True,
        host="127.0.0.1",
        port=8310,
        access_log=False,
    )
finally:
    with admin.begin() as connection:
        connection.execute(DropSchema(schema, cascade=True))
    admin.dispose()

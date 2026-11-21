import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text, update
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateSchema, DropSchema

from fridgellio.auth import RegisterInput
from fridgellio.config import Settings
from fridgellio.main import create_app
from fridgellio.manage_auth import set_password
from fridgellio.models import Account, AccountCredential, AccountSession, AuthRateLimit, Menu

API_DIR = Path(__file__).resolve().parents[1]
PASSWORD = "example passphrase 123"


@pytest.fixture
def database(monkeypatch):
    database_url = os.getenv("FRIDGELLIO_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set FRIDGELLIO_TEST_DATABASE_URL for PostgreSQL integration tests.")
    url = Settings(_env_file=None, database_url=database_url).postgres_url()
    schema = f"fridgellio_test_{uuid4().hex}"
    admin = create_engine(url, hide_parameters=True)
    try:
        with admin.begin() as connection:
            connection.execute(CreateSchema(schema))
        original_options = url.query.get("options", "")
        scoped = url.update_query_dict(
            {"options": f"{original_options} -csearch_path={schema}".strip()}
        )
        scoped_url = scoped.render_as_string(hide_password=False)
        monkeypatch.setenv("DATABASE_URL", scoped_url)
        migrations = Config(str(API_DIR / "alembic.ini"))
        command.upgrade(migrations, "20261121_0001")
        legacy_id = uuid4()
        engine = create_engine(scoped, hide_parameters=True)
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO accounts (id, issuer, subject, language) "
                        "VALUES (:id, 'https://legacy.example/', 'legacy-user', 'th')"
                    ),
                    {"id": legacy_id},
                )
        finally:
            engine.dispose()
        command.upgrade(migrations, "head")
        command.check(migrations)
        yield scoped_url, legacy_id
    finally:
        with admin.begin() as connection:
            connection.execute(DropSchema(schema, cascade=True, if_exists=True))
        admin.dispose()


@pytest.fixture
def client(database):
    database_url, _ = database
    app = create_app(Settings(_env_file=None, database_url=database_url))
    with TestClient(app) as test_client:
        yield test_client


def register(client, username):
    response = client.post("/api/auth/register", json={"username": username, "password": PASSWORD})
    assert response.status_code == 201, response.json()
    return response.json()


def bearer(result):
    return {"Authorization": f"Bearer {result['token']}"}


@pytest.fixture
def household_accounts(client):
    return [bearer(register(client, name)) for name in ("owner", "member", "other")]


def add_stock(client, owner, name="Spinach", quantity="100", expiry_date=None):
    result = client.post(
        "/api/inventory",
        headers=owner,
        json={
            "name": name,
            "quantity": quantity,
            "unit": "g",
            "location": "fridge",
            "expiry_date": expiry_date,
        },
    )
    assert result.status_code == 201, result.json()
    return result.json()["id"]


def test_inventory_expiry_household_isolation_and_preferences(client, household_accounts):
    owner, member, other = household_accounts
    assert client.get("/health/ready").status_code == 200
    assert client.get("/api/inventory", headers=owner).status_code == 403
    assert client.get("/api/household", headers=owner).json() is None
    household = client.post("/api/household", headers=owner).json()
    assert household["can_invite"] is True
    invite = client.post("/api/household/invitations", headers=owner).json()["token"]
    assert client.post("/api/household/join", headers=member, json={"token": invite}).json() == {
        "id": household["id"],
        "can_invite": False,
    }
    assert (
        client.post("/api/household/join", headers=other, json={"token": invite}).status_code == 404
    )
    assert client.post("/api/household", headers=other).status_code == 201
    assert client.post("/api/household/invitations", headers=member).status_code == 403
    stock = add_stock(client, owner, expiry_date="2026-06-10")
    add_stock(client, owner, "Green beans", expiry_date="2026-06-13")
    add_stock(client, owner, "Carrots", expiry_date="2026-06-14")
    add_stock(client, owner, "Celery", expiry_date="2026-06-09")
    add_stock(client, owner, "Lettuce")
    response = client.get("/api/inventory?today=2026-06-10&expiry=use_soon", headers=member)
    assert [(row["name"], row["expiry_status"]) for row in response.json()] == [
        ("Spinach", "due_today"),
        ("Green beans", "use_soon"),
    ]
    assert client.get("/api/inventory", headers=other).json() == []
    assert (
        client.patch(f"/api/inventory/{stock}", headers=other, json={"name": "Other"}).status_code
        == 404
    )
    assert client.get(f"/api/inventory/{stock}/events", headers=other).status_code == 404
    assert client.patch("/api/preferences", headers=owner, json={"language": "th"}).json() == {
        "language": "th"
    }
    assert client.get("/api/preferences", headers=other).json() == {"language": "en"}
    assert client.get("/api/preferences", headers=owner).json() == {"language": "th"}

    preferences = "/api/preferences/foods-to-avoid"
    food = client.post(preferences, headers=owner, json={"name": "ถั่วลิสง"}).json()
    assert client.post(preferences, headers=owner, json={"name": " ถั่วลิสง "}).status_code == 200
    assert client.get(preferences, headers=owner).json() == [food]
    assert client.get(preferences, headers=member).json() == []
    assert client.delete(f"{preferences}/{food['id']}", headers=member).status_code == 404
    assert client.delete(f"{preferences}/{food['id']}", headers=owner).status_code == 204

    equipment = client.post("/api/equipment", headers=owner, json={"name": "Skillet"}).json()["id"]
    assert client.get("/api/equipment", headers=other).json() == []
    assert client.get("/api/equipment", headers=member).json()[0]["id"] == equipment
    assert (
        client.patch(f"/api/equipment/{equipment}", headers=owner, json={"name": "Wok"}).json()[
            "name"
        ]
        == "Wok"
    )
    assert client.delete(f"/api/equipment/{equipment}", headers=owner).status_code == 204


def test_concurrent_deduction_and_retry(client, household_accounts):
    owner, member, other = household_accounts
    assert client.post("/api/household", headers=owner).status_code == 201
    invite = client.post("/api/household/invitations", headers=owner).json()["token"]
    assert (
        client.post("/api/household/join", headers=member, json={"token": invite}).status_code
        == 201
    )
    entry = add_stock(client, owner)
    path = f"/api/inventory/{entry}/events"
    payload = {"kind": "used", "quantity": "75"}

    def deduct(headers):
        return client.post(path, headers={**headers, "Idempotency-Key": "event-1"}, json=payload)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(deduct, [owner, member]))

    assert sorted(response.status_code for response in results) == [201, 409]
    winning_member = [owner, member][[response.status_code for response in results].index(201)]
    replay = deduct(winning_member)
    assert replay.status_code == 200
    assert replay.json()["entry"]["quantity"] == "25"
    assert client.get(path, headers=owner).json() == client.get(path, headers=member).json()
    assert len(client.get(path, headers=member).json()) == 1
    assert client.delete(f"/api/inventory/{entry}", headers=owner).status_code == 204
    assert client.get("/api/inventory", headers=owner).json() == []
    assert client.get(path, headers=owner).json()[0]["quantity"] == "75"

    assert (
        client.get("/api/inventory-history", headers=member).json()
        == client.get(path, headers=owner).json()
    )
    assert client.post("/api/household", headers=other).status_code == 201
    assert client.get("/api/inventory-history", headers=other).json() == []


def test_session_lifecycle_and_expiration(client, database):
    credentials = {"username": "ALICE", "password": PASSWORD}
    invalid = client.post("/api/auth/register", json=credentials | {"password": "too short"})
    assert invalid.status_code == 422
    assert invalid.json()["fields"][0]["path"] == ["body", "password"]
    assert "too short" not in invalid.text
    profile = {"first_name": "  มาลี ", "last_name": "O’Neill"}
    for invalid_field in (
        {"first_name": " "},
        {"last_name": "x" * 201},
        {"profile_picture_url": "https://example.org/photo.jpg"},
    ):
        assert (
            client.post("/api/auth/register", json=credentials | invalid_field).status_code == 422
        )
    response = client.post("/api/auth/register", json=credentials | profile)
    assert response.status_code == 201
    registration = response.json()
    first = bearer(registration)
    account = registration["account"]
    assert account["username"] == "alice"
    assert account["first_name"] == "มาลี"
    assert account["last_name"] == "O’Neill"
    assert account["profile_picture_url"] is None
    assert client.post("/api/auth/register", json=credentials).status_code == 409
    assert client.get("/api/auth/me", headers=first).json() == account
    assert (
        client.get("/api/auth/me", headers={"Authorization": "Bearer " + "x" * 43}).status_code
        == 401
    )

    for payload in (
        credentials | {"password": "incorrect"},
        credentials | {"username": "unknown"},
    ):
        failure = client.post("/api/auth/login", json=payload)
        assert failure.status_code == 401
        assert failure.json()["code"] == "invalid_credentials"

    sign_in = client.post("/api/auth/login", json=credentials)
    assert sign_in.status_code == 200
    assert sign_in.json()["account"] == account
    second = bearer(sign_in.json())
    assert first != second
    assert client.post("/api/auth/logout", headers=first).status_code == 204
    assert client.get("/api/auth/me", headers=first).status_code == 401
    assert client.get("/api/auth/me", headers=second).json() == account
    for path in ("/api/menus", "/api/photos/analyze"):
        response = client.post(path, headers=second)
        assert response.status_code == 501
        assert response.json()["code"] == "ai_not_implemented"
        assert response.json()["request_id"] == response.headers["X-Request-ID"]

    engine = create_engine(database[0], hide_parameters=True)
    try:
        with engine.begin() as connection:
            password_hash = connection.scalar(select(AccountCredential.password_hash))
            assert password_hash.startswith("$argon2id$")
            assert (
                connection.scalar(select(func.count()).select_from(Account)) == 2
            )  # Includes legacy.
            digest = connection.scalar(select(AccountSession.token_digest))
            assert len(digest) == 64 and digest != sign_in.json()["token"]
            expires_at = connection.scalar(select(AccountSession.expires_at))
            assert expires_at == datetime.fromisoformat(sign_in.json()["expires_at"])
            assert timedelta(days=6) < expires_at - connection.scalar(select(func.now()))
            connection.execute(update(AccountSession).values(expires_at=func.clock_timestamp()))
    finally:
        engine.dispose()
    assert client.get("/api/auth/me", headers=second).status_code == 401


def test_login_throttling(client, database):
    register(client, "alice")
    for _ in range(10):
        response = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
        assert response.status_code == 401
    response = client.post("/api/auth/login", json={"username": "ALICE", "password": PASSWORD})
    assert response.status_code == 429
    assert response.json()["code"] == "auth_rate_limited"

    engine = create_engine(database[0], hide_parameters=True)
    try:
        with engine.begin() as connection:
            connection.execute(update(AuthRateLimit).values(expires_at=func.clock_timestamp()))
    finally:
        engine.dispose()
    assert (
        client.post("/api/auth/login", json={"username": "alice", "password": PASSWORD}).status_code
        == 200
    )


def test_legacy_credentials_and_operator_reset(client, database):
    database_url, legacy_id = database
    credentials = RegisterInput(username="legacy", password=PASSWORD)
    engine = create_engine(database_url, hide_parameters=True)
    try:
        with Session(engine) as session, session.begin():
            set_password(session, credentials, legacy_id)
        login = client.post("/api/auth/login", json={"username": "legacy", "password": PASSWORD})
        assert login.status_code == 200
        legacy = login.json()["account"]
        assert legacy == {
            "id": str(legacy_id),
            "username": "legacy",
            "first_name": None,
            "last_name": None,
            "profile_picture_url": None,
        }
        with Session(engine) as session, session.begin():
            session.get(Account, legacy_id).profile_picture_url = "https://example.org/member.png"
        assert client.get("/api/auth/me", headers=bearer(login.json())).json() == {
            **legacy,
            "profile_picture_url": "https://example.org/member.png",
        }
        assert client.get("/api/preferences", headers=bearer(login.json())).json() == {
            "language": "th"
        }

        replacement = "replacement example passphrase 456"
        with Session(engine) as session, session.begin():
            set_password(session, RegisterInput(username="legacy", password=replacement), None)
        assert client.get("/api/auth/me", headers=bearer(login.json())).status_code == 401
        assert (
            client.post(
                "/api/auth/login", json={"username": "legacy", "password": PASSWORD}
            ).status_code
            == 401
        )
        assert (
            client.post(
                "/api/auth/login", json={"username": "legacy", "password": replacement}
            ).status_code
            == 200
        )
    finally:
        engine.dispose()


def test_saved_menus_are_private_and_bilingual(client, database):
    account = register(client, "saved-menu-owner")
    other = bearer(register(client, "saved-menu-other"))
    dish = {
        "name": {"en": "Spinach salad", "th": "สลัดผักโขม"},
        "ingredients": [
            {
                "reference": "spinach",
                "name": {"en": "Spinach", "th": "ผักโขม"},
                "quantity": "75",
                "unit": "g",
            }
        ],
        "equipment": [],
        "steps": [{"en": "Toss the spinach.", "th": "คลุกผักโขม"}],
    }
    engine = create_engine(database[0], hide_parameters=True)
    try:
        with Session(engine) as session, session.begin():
            session.add(Menu(account_id=account["account"]["id"], dishes=[dish]))
    finally:
        engine.dispose()
    menus = client.get("/api/menus", headers=bearer(account)).json()
    assert menus[0]["dishes"] == [dish]
    assert client.get("/api/menus", headers=other).json() == []
    assert client.get("/api/menus").status_code == 401

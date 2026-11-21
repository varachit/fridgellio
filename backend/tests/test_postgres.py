import os
import re
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

from fridgellio import households
from fridgellio.auth import NewPasswordInput
from fridgellio.config import Settings
from fridgellio.data import token_digest
from fridgellio.main import create_app
from fridgellio.manage_auth import set_password
from fridgellio.models import Account, AccountCredential, AccountSession, AuthRateLimit, Menu

API_DIR = Path(__file__).resolve().parents[1]
PASSWORD = "example passphrase 123"
LEGACY_INVITATION_CODE = "Ab9_-" * 8 + "xYz"


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
                connection.execute(
                    text("INSERT INTO households (id, created_by) VALUES (:id, :id)"),
                    {"id": legacy_id},
                )
                connection.execute(
                    text(
                        "INSERT INTO household_memberships (account_id, household_id) "
                        "VALUES (:id, :id)"
                    ),
                    {"id": legacy_id},
                )
                connection.execute(
                    text(
                        "INSERT INTO household_invitations (token_digest, household_id, expires_at) "
                        "VALUES (:digest, :id, clock_timestamp() + interval '24 hours')"
                    ),
                    {"digest": token_digest(LEGACY_INVITATION_CODE), "id": legacy_id},
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
    response = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": PASSWORD,
            "first_name": username.capitalize(),
            "last_name": "Tester",
        },
    )
    assert response.status_code == 201, response.json()
    return response.json()


def bearer(result):
    return {"Authorization": f"Bearer {result['token']}"}


@pytest.fixture
def household_accounts(client):
    return [bearer(register(client, name)) for name in ("owner", "member", "other")]


def add_stock(
    client, member, name="Spinach", quantity="100", expiry_date=None, *, location="fridge"
):
    result = client.post(
        "/api/inventory",
        headers=member,
        json={
            "name": name,
            "quantity": quantity,
            "unit": "g",
            "location": location,
            "expiry_date": expiry_date,
        },
    )
    assert result.status_code == 201, result.json()
    return result.json()["id"]


def test_owner_can_revoke_only_pending_invites_from_their_household(
    client, household_accounts, monkeypatch
):
    owner, member, other = household_accounts
    path = "/api/household/invitations"
    join = "/api/household/join"
    for household_owner in (owner, other):
        assert client.post("/api/household", headers=household_owner).status_code == 201
    characters = iter("K7RM3X9DT4WP8N2CK7RM3X9DJ5MR2HZ8")
    monkeypatch.setattr(households, "choice", lambda _: next(characters))
    revoked = client.post(path, headers=owner).json()
    used = client.post(path, headers=owner).json()
    assert revoked["token"] == "K7RM-3X9D"
    assert revoked["id"] != token_digest(revoked["token"])
    assert client.post(join, headers=member, json={"token": used["token"]}).status_code == 201

    revoke_path = f"{path}/{revoked['id']}"
    assert client.get(path, headers=member).status_code == 403
    assert client.delete(revoke_path, headers=member).status_code == 403
    assert client.get(path, headers=other).json() == []
    assert client.delete(revoke_path, headers=other).status_code == 204
    assert client.get(path, headers=owner).json() == [
        {"id": revoked["id"], "expires_at": revoked["expires_at"]}
    ]

    assert client.delete(revoke_path, headers=owner).status_code == 204
    assert client.delete(revoke_path, headers=owner).status_code == 204
    spare = client.post(path, headers=owner).json()
    assert spare["token"] == "J5MR-2HZ8"
    assert [row["id"] for row in client.get(path, headers=owner).json()] == [spare["id"]]
    guest = bearer(register(client, "guest"))
    result = client.post(join, headers=guest, json={"token": revoked["token"]})
    assert result.status_code == 404
    assert result.json()["code"] == "invitation_unavailable"
    typed_code = spare["token"].lower().replace("-", "")
    assert client.post(join, headers=guest, json={"token": typed_code}).status_code == 201
    assert client.get(path, headers=owner).json() == []


def test_join_attempt_limit_is_per_account(client, household_accounts):
    owner, member, other = household_accounts
    join = "/api/household/join"
    assert client.post("/api/household", headers=owner).status_code == 201
    for _ in range(10):
        assert client.post(join, headers=member, json={"token": "0000-0000"}).status_code == 404
    invite = client.post("/api/household/invitations", headers=owner).json()["token"]
    payload = {"token": invite}
    result = client.post(join, headers=member, json=payload)
    assert result.status_code == 429
    assert result.json()["code"] == "auth_rate_limited"
    assert client.post(join, headers=other, json=payload).status_code == 201


def test_invitation_issued_before_migration_remains_valid(client, database, household_accounts):
    _, legacy_id = database
    _, member, _ = household_accounts
    join = "/api/household/join"
    assert client.post(join, headers=member, json={"token": LEGACY_INVITATION_CODE}).json() == {
        "id": str(legacy_id),
        "can_invite": False,
    }


def test_inventory_expiry_household_isolation_and_preferences(client, household_accounts):
    owner, member, other = household_accounts
    assert client.get("/health/ready").status_code == 200
    assert client.get("/api/inventory", headers=owner).status_code == 403
    members_path = "/api/household/members"
    assert client.get(members_path).status_code == 401
    assert client.get(members_path, headers=owner).status_code == 403
    assert client.get("/api/household", headers=owner).json() is None
    household = client.post("/api/household", headers=owner).json()
    assert household["can_invite"] is True
    invite = client.post("/api/household/invitations", headers=owner).json()["token"]
    assert re.fullmatch(r"[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}", invite)
    assert client.post("/api/household/join", headers=member, json={"token": invite}).json() == {
        "id": household["id"],
        "can_invite": False,
    }
    assert (
        client.post("/api/household/join", headers=other, json={"token": invite}).status_code == 404
    )
    assert client.post("/api/household", headers=other).status_code == 201
    roster = client.get(members_path, headers=member).json()
    assert [(row["username"], row["is_owner"]) for row in roster] == [
        ("owner", True),
        ("member", False),
    ]
    assert set(roster[0]) == {
        "id",
        "username",
        "first_name",
        "last_name",
        "profile_picture_url",
        "is_owner",
    }
    assert [row["username"] for row in client.get(members_path, headers=other).json()] == ["other"]
    assert client.post("/api/household/invitations", headers=member).status_code == 403
    stock = add_stock(client, owner, expiry_date="2026-06-10")
    add_stock(client, member, "Green beans", expiry_date="2026-06-13", location="pantry")
    add_stock(client, owner, "Carrots", expiry_date="2026-06-14", location="other")
    add_stock(client, member, "Celery", expiry_date="2026-06-09", location="freezer")
    add_stock(client, owner, "Lettuce")
    owner_stock = client.get("/api/inventory?today=2026-06-10", headers=owner).json()
    assert client.get("/api/inventory?today=2026-06-10", headers=member).json() == owner_stock
    assert {(row["name"], row["location"]) for row in owner_stock} == {
        ("Spinach", "fridge"),
        ("Green beans", "pantry"),
        ("Carrots", "other"),
        ("Celery", "freezer"),
        ("Lettuce", "fridge"),
    }
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
    events = client.get(path, headers=member).json()
    assert client.get(path, headers=owner).json() == events
    assert len(events) == 2
    by_kind = {event["kind"]: event for event in events}
    assert by_kind["added"]["quantity"] == "100"
    assert (
        by_kind["added"]["actor_account_id"]
        == client.get("/api/auth/me", headers=owner).json()["id"]
    )
    assert by_kind["used"] == replay.json()["event"]
    assert (
        by_kind["used"]["actor_account_id"]
        == client.get("/api/auth/me", headers=winning_member).json()["id"]
    )
    assert client.delete(f"/api/inventory/{entry}", headers=owner).status_code == 204
    assert client.get("/api/inventory", headers=owner).json() == []
    assert client.get(path, headers=owner).json() == events

    assert (
        client.get("/api/inventory-history", headers=member).json()
        == client.get(path, headers=owner).json()
    )
    assert client.post("/api/household", headers=other).status_code == 201
    assert client.get("/api/inventory-history", headers=other).json() == []


def test_profile_updates_only_the_signed_in_account(client, household_accounts):
    owner, member, _ = household_accounts
    path = "/api/preferences/profile"
    assert client.get(path).status_code == 401
    assert client.patch(path, json={"first_name": "มาลี"}).status_code == 401
    assert client.get(path, headers=owner).json() == {"first_name": "Owner", "last_name": "Tester"}
    account = client.get("/api/auth/me", headers=owner).json()

    saved = client.patch(path, headers=owner, json={"first_name": " มาลี ", "last_name": "Santos"})
    assert saved.status_code == 200
    assert saved.json() == {"first_name": "มาลี", "last_name": "Santos"}
    for invalid in (
        {"last_name": "x" * 201},
        {"username": "member"},
        {"first_name": " "},
        {"last_name": None},
    ):
        assert client.patch(path, headers=owner, json=invalid).status_code == 422
    assert client.get(path, headers=owner).json() == saved.json()

    updated = {"first_name": "มาลี", "last_name": "Reyes"}
    assert client.patch(path, headers=owner, json={"last_name": " Reyes "}).json() == updated
    assert client.get(path, headers=owner).json() == updated
    assert client.get(path, headers=member).json() == {
        "first_name": "Member",
        "last_name": "Tester",
    }
    assert client.get("/api/auth/me", headers=owner).json() == account | updated


def test_session_lifecycle_and_expiration(client, database):
    credentials = {"username": "ALICE", "password": "eight888"}
    profile = {"first_name": "  มาลี ", "last_name": "O’Neill"}
    for missing_name in profile:
        payload = credentials | {
            field: value for field, value in profile.items() if field != missing_name
        }
        invalid = client.post("/api/auth/register", json=payload)
        assert invalid.status_code == 422
        assert invalid.json()["fields"][0]["path"] == ["body", missing_name]
    invalid = client.post(
        "/api/auth/register", json=credentials | profile | {"password": "seven77"}
    )
    assert invalid.status_code == 422
    assert invalid.json()["fields"][0]["path"] == ["body", "password"]
    assert "seven77" not in invalid.text
    for invalid_field in (
        {"first_name": " "},
        {"last_name": None},
        {"last_name": "x" * 201},
        {"profile_picture_url": "https://example.org/photo.jpg"},
    ):
        assert (
            client.post(
                "/api/auth/register", json=credentials | profile | invalid_field
            ).status_code
            == 422
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
    assert client.post("/api/auth/register", json=credentials | profile).status_code == 409
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
    credentials = NewPasswordInput(username="legacy", password=PASSWORD)
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
        headers = bearer(login.json())
        path = "/api/preferences/profile"
        incomplete = client.patch(path, headers=headers, json={"first_name": "Mali"})
        assert incomplete.status_code == 422
        assert incomplete.json()["code"] == "profile_names_required"
        assert client.get(path, headers=headers).json() == {"first_name": None, "last_name": None}
        names = {"first_name": "Mali", "last_name": "Santos"}
        assert client.patch(path, headers=headers, json=names).json() == names

        replacement = "reset888"
        with Session(engine) as session, session.begin():
            set_password(session, NewPasswordInput(username="legacy", password=replacement), None)
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


def test_recommendation_preview_resolves_settings_and_filters_stock(client, household_accounts):
    owner, member, outsider = household_accounts
    route = "/api/menus/recommendations"
    today = {"today": "2026-06-10"}
    assert client.post(route, json=today).status_code == 401
    assert client.post(route, headers=owner, json=today).status_code == 403
    for headers in (owner, outsider):
        assert client.post("/api/household", headers=headers).status_code == 201
    invite = client.post("/api/household/invitations", headers=owner).json()["token"]
    assert (
        client.post("/api/household/join", headers=member, json={"token": invite}).status_code
        == 201
    )
    client.post("/api/equipment", headers=owner, json={"name": "Stove"})
    client.post("/api/equipment", headers=outsider, json={"name": "Oven"})
    client.post("/api/preferences/foods-to-avoid", headers=owner, json={"name": "ถั่วลิสง"})
    add_stock(client, owner, "Spinach", "100", "2026-06-10")
    add_stock(client, member, "Spinach", "50", "2026-06-09")
    add_stock(client, outsider, "Onion")
    for name, english, thai, quantity, unit in [
        ("ผักโขม", "Spinach", "ผักโขม", "0.15", "kg"),
        ("Spinach", None, None, "3", "each"),
        ("Peanuts", None, "ถั่วลิสง", "10", "g"),
    ]:
        assert (
            client.post(
                "/api/inventory",
                headers=owner,
                json={
                    "name": name,
                    "name_en": english,
                    "name_th": thai,
                    "quantity": quantity,
                    "unit": unit,
                    "location": "pantry",
                },
            ).status_code
            == 201
        )
    removed = add_stock(client, owner, "Lime")
    assert client.delete(f"/api/inventory/{removed}", headers=owner).status_code == 204
    depleted = add_stock(client, owner, "Lemon")
    assert client.post(
        f"/api/inventory/{depleted}/events", headers=owner, json={"kind": "used", "quantity": "100"}
    ).is_success
    default = client.post(route, json=today, headers=owner).json()
    assert default["status"] == "preview"
    assert default["recipe_limit"] == 5
    assert default["preferences"] == {
        "servings": 2,
        "dietary_styles": [],
        "cuisines": [],
        "nutrition_goal": None,
        "max_total_minutes": None,
        "difficulty": "any",
        "foods_to_avoid": ["ถั่วลิสง"],
        "equipment": ["Stove"],
    }
    assert {
        (r["name_en"] or r["name"], r["quantity"], r["unit"]) for r in default["ingredients"]
    } == {
        ("Spinach", "250", "g"),
        ("Spinach", "3", "each"),
    }
    override = {
        "servings": 3,
        "dietary_styles": ["Halal", "Gluten-free"],
        "cuisines": ["Thai", "Indian"],
        "nutrition_goal": "More fiber",
        "max_total_minutes": 15,
        "difficulty": "easy",
        "foods_to_avoid": [],
        "equipment": [],
    }
    result = client.post(route, headers=owner, json={**today, **override}).json()
    assert result["preferences"] == override
    assert len(result["ingredients"]) == 3
    assert client.post(route, json=today, headers=owner).json() == default
    assert (
        client.post(route, json=today, headers=member).json()["preferences"]["foods_to_avoid"] == []
    )
    assert client.get("/api/menus", headers=owner).json() == []
    empty = client.post(
        route, headers=owner, json={**today, "foods_to_avoid": [" Spinach ", "peanuts"]}
    )
    assert empty.json()["ingredients"] == []
    for invalid in (
        {"servings": 0},
        {"servings": 1.5},
        {"max_total_minutes": 20},
        {"difficulty": "expert"},
        {"dietary_styles": ["  "]},
    ):
        assert client.post(route, headers=owner, json=invalid).status_code == 422

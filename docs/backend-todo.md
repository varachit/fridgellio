# Fridgellio backend checklist

## Implementation

- [x] Set up the separate `backend/` and `frontend/` directories and the FastAPI `uv` project.
- [x] Add environment configuration, Swagger UI, JSON errors, request logging, and health checks.
- [x] Add PostgreSQL models and an Alembic migration for accounts, household membership, invitations, stock, inventory events, equipment, personal settings, and bilingual menus.
- [x] Implement local accounts, password hashing, session authentication, and operator password resets. Scope shared data to household membership.
- [x] Create and join a household using single-use invitations.
- [x] Implement manual inventory entry, editing, removal, search, expiry filters, and transactional usage or discard recording.
- [x] Implement shared equipment and private English or Thai language and Foods to avoid settings.
- [x] Implement OpenAI web search for barcodes with Open Food Facts as a fallback.
- [x] Add typed photo-analysis and menu-generation placeholders that return `501`.

## API contract

| Route | Behavior |
| --- | --- |
| `GET /health/live`, `GET /health/ready` | Check process and database health respectively. |
| `POST /api/auth/register`, `POST /api/auth/login` | Accept JSON with `username` and `password`. Registration also accepts optional `first_name` and `last_name` (1–200 characters each after trimming) and an initial `language` of `en` (default) or `th`. Return the account, a new bearer token, and its expiry seven days after issue. Return `409` for an unavailable username on registration, `401` for invalid credentials on login, or `429` when rate limited. |
| `GET /api/auth/me`, `POST /api/auth/logout` | Read the signed-in account or revoke the current bearer token. |
| `GET /api/preferences`, `PATCH /api/preferences` | Read or update the account's language. |
| `GET /api/preferences/foods-to-avoid`, `POST /api/preferences/foods-to-avoid`, `DELETE /api/preferences/foods-to-avoid/{food_id}` | Manage the signed-in account's private list. |
| `GET /api/household`, `POST /api/household` | Read the current membership or create a household. |
| `POST /api/household/invitations`, `POST /api/household/join` | Issue and accept a single-use invitation. |
| `GET /api/inventory`, `POST /api/inventory` | List active stock or save a confirmed entry. Listing supports name search, location, expiry, and local calendar date. |
| `PATCH /api/inventory/{entry_id}`, `DELETE /api/inventory/{entry_id}` | Edit or remove an owned entry. Keep recorded history. |
| `GET /api/inventory/{entry_id}/events`, `POST /api/inventory/{entry_id}/events` | Read history or record a usage or discard. |
| `GET /api/inventory-history` | Read household usage and discard events, including entries that were depleted or removed. |
| `GET /api/menus` | List the signed-in member’s saved bilingual menus, newest first. |
| `GET /api/equipment`, `POST /api/equipment` | List or add equipment. |
| `PATCH /api/equipment/{equipment_id}`, `DELETE /api/equipment/{equipment_id}` | Edit or remove owned equipment. |
| `GET /api/barcodes/{code}` | Look up a product without writing inventory. Return code, name, and brands, with optional localized names and numeric `Quantity` and `Unit`. Include `X-Barcode-Source` for web results. Use an optional `language` override or the saved preference. |
| `POST /api/photos/analyze`, `POST /api/menus` | Reserve authenticated routes for future AI work. Return `501` with a machine-readable error. |

## Verification

- [x] Verify Python syntax, Ruff linting and formatting, and documentation links.
- [x] Run quantity and expiry validation tests, plus barcode client tests for request parameters, localization, and failures using controlled HTTPX responses.
- [x] Compare generated PostgreSQL DDL from the ORM models and migration for all nine tables and their indexes.
- [x] Document setup, run, and verification commands.
- [x] Run `uv sync` and generate `uv.lock`.
- [x] Run the full API suite, including local session authentication and Swagger UI.
- [ ] Verify the barcode client over local HTTP. The Postman simulation was blocked from binding a loopback socket.
- [x] Apply the migrations to a test PostgreSQL instance and verify household isolation, private settings, invitation redemption, and concurrent stock deductions.
- [ ] Verify the user's `fridgellio` database connection and apply migrations after `.env` is provided.

## Deferred AI work

- [ ] Connect OpenAI for bilingual photo suggestions and menu generation. Validate eligibility, compatible quantities across dishes, equipment, translations, and the current inventory before saving menus.

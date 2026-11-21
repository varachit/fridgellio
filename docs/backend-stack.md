# Fridgellio backend stack

The backend lives in `backend/` and uses FastAPI. PostgreSQL stores household memberships, shared stock entries, inventory history, and equipment. Each account owns its language preference and **Foods to avoid** list. FastAPI searches the web for barcodes with OpenAI and uses Open Food Facts as a fallback. Photo analysis and menu generation return `501 ai_not_implemented` while OpenAI integration is deferred. The migration includes storage for account-owned bilingual menus. See the [product requirements](requirements.md) and [backend checklist](backend-todo.md).

## Runtime dependencies

| Package | Use in Fridgellio | Reference |
| --- | --- | --- |
| `fastapi` | Define the JSON API, wire up authorization dependencies, and generate OpenAPI and Swagger UI from route and model declarations. | [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/) |
| `uvicorn` | Run the FastAPI application as an ASGI server in development and deployment. | [FastAPI deployment guide](https://fastapi.tiangolo.com/deployment/manually/) |
| `pydantic` v2 | Define and validate request and response models, including ingredient quantities, units, equipment, and cooking steps. Declare it directly because the backend imports its models. | [Pydantic models](https://docs.pydantic.dev/latest/concepts/models/) |
| `pydantic-settings` | Validate the PostgreSQL connection URL and other server configuration from environment variables. | [FastAPI settings guide](https://fastapi.tiangolo.com/advanced/settings/) |
| `starlette` | Use ASGI message types and header helpers for request logging middleware. | [FastAPI middleware](https://fastapi.tiangolo.com/advanced/middleware/) |
| `httpx` | Use an async client for Open Food Facts lookups and support FastAPI's `TestClient` in tests. | [HTTPX async support](https://www.python-httpx.org/async/), [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/#using-testclient) |
| `openai` | Create a shared `AsyncOpenAI` client in the FastAPI lifespan when `OPENAI_API_KEY` is set. Async handlers can access it through `request.app.state.openai_client` and await `client.responses.create(...)` or `client.responses.parse(...)`. | [OpenAI Python SDK](https://developers.openai.com/api/reference/python), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) |
| `argon2-cffi` | Hash and verify local account passwords with Argon2id. | [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) |
| `sqlalchemy[asyncio]` | Map and query inventory, equipment, and history using SQLAlchemy 2.x. Manage PostgreSQL connections through the SQLAlchemy engine and pool. | [SQLAlchemy PostgreSQL dialect](https://docs.sqlalchemy.org/en/21/dialects/postgresql.html) |
| `psycopg[binary]` | Connect SQLAlchemy to PostgreSQL using Psycopg 3. Use the binary distribution on supported targets. | [Psycopg installation](https://www.psycopg.org/psycopg3/docs/basic/install.html) |
| `alembic` | Version the PostgreSQL schema. Review the generated revisions and apply them once as a deployment step before starting the new app version. | [Alembic migration guide](https://alembic.sqlalchemy.org/en/latest/autogenerate.html) |
| `structlog` | Emit structured JSON logs with a request ID shared by the request's application events. | [structlog context variables](https://www.structlog.org/en/stable/contextvars.html) |

FastAPI manages Fridgellio accounts and issues opaque session tokens. NextAuth’s Credentials provider uses the FastAPI login or registration response to create an encrypted HttpOnly, SameSite=Lax web session cookie. NextAuth sets Secure for HTTPS origins. The Next.js server reads the bearer token for protected API calls and revokes the corresponding FastAPI session on sign-out. The frontend checks the browser origin on writes. The OpenAI API key stays in the FastAPI environment. Apply a per-user rate limit before sending a request to OpenAI.

## Grocery intake and localization

- **Manual entry** uses the standard stock creation flow. Photo analysis and barcode lookup return editable suggestions. Only an explicit save writes a stock entry.
- **Photo analysis** reserves a multipart upload contract. The deferred implementation will use `python-multipart` and FastAPI's `UploadFile` to take a camera image and check its size and type, then use the `openai` SDK to send it to a vision-capable model and parse bilingual Structured Outputs. [FastAPI file uploads](https://fastapi.tiangolo.com/tutorial/request-files/), [OpenAI vision](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- **Barcode lookup** checks verified corrections by exact barcode before searching with the OpenAI Responses API and `web_search` when configured. It requires a cited product name and brand. When search is unavailable, rate limited, or finds no verified match, FastAPI calls the Open Food Facts v3 product endpoint with `cc=th` and the selected language. The barcode stays a string to preserve leading zeros. The API returns numeric `Quantity` and string `Unit` when both are known. [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Open Food Facts v3 product lookup](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/)
- **Bilingual content** uses `en` and `th` fields for each AI-generated name or cooking step. Validate that both values are nonblank. Save both translations for confirmed photo entries and validated menus. Use shared quantities and stable ingredient and equipment references so a language change affects display text only. Keep static UI translations in the frontend and store the selected language on the account.

## PostgreSQL persistence

- Resolve the signed-in account from the bearer token's SHA-256 digest and the session's expiry in PostgreSQL. Authorize shared inventory, inventory history, and equipment through household membership. Scope settings and generated menus to the account. Use foreign keys for ownership and history, `numeric` for quantities, `date` for expiry dates, and timezone-aware timestamps for inventory events.
- Each account can belong to one household. The creator issues single-use invitations that expire after 24 hours. PostgreSQL stores the digest of each invitation token.
- Update the remaining quantity and insert the usage or discard event in one transaction. Use an atomic conditional update to reject deductions that would take stock below zero, including concurrent requests. [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- Clients can reuse an `Idempotency-Key` when retrying a usage or discard request. For the same member and stock entry, a matching retry returns the existing event and current stock with `200`. Reusing a key with a different deduction returns `409`.
- For expiry classification, the frontend supplies the user's local calendar date as `today`. The API defaults to UTC when omitted.
- When menu generation is implemented, filter household stock by the requester's **Foods to avoid**. Release the database connection while waiting for OpenAI and recheck membership, stock, equipment, and settings before saving the menu.

## Validation

| Layer | Checks |
| --- | --- |
| Next.js forms | Give field-level feedback for missing names, invalid quantities, and invalid dates. Preserve entered values when the API rejects a save. |
| FastAPI request models | Use Pydantic v2 to reject unexpected fields, blank names after trimming, unsupported units or locations, and invalid calendar dates. Take quantities as decimal strings such as `"0.15"`, parse them to `Decimal`, and require finite, positive values for new stock and inventory deductions. Require whole numbers for `each`. Use field constraints for individual values and model validators for rules that depend on multiple fields. [Pydantic validators](https://docs.pydantic.dev/latest/concepts/validators/) |
| FastAPI business rules | Check household membership or account ownership and available stock using current database state. For a menu, parse the OpenAI response into a Pydantic model and check its ingredient names and combined quantities across dishes against the household stock eligible for the requester. Verify that the listed equipment belongs to the household. Require a dish name and a nonempty list of cooking steps. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) |
| PostgreSQL | Enforce required fields, foreign keys, and quantity constraints on writes. Allow zero remaining stock and require positive quantities in usage and discard events. Keep the deduction and its history entry in the same transaction. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) |

Return `422` with field paths and messages for invalid request fields, `409` if current stock is insufficient for a deduction, and `502` when OpenAI returns a malformed or unusable menu. An explicit no-menu result is a normal outcome. Include the request ID in errors and document the response models in Swagger. [FastAPI error handling](https://fastapi.tiangolo.com/tutorial/handling-errors/)

## Middleware and operations

| Concern | MVP plan |
| --- | --- |
| Request logging | Use ASGI middleware to generate a request ID, return it as `X-Request-ID`, and log one completion event with HTTP method, route template, status, and duration. Emit JSON to stdout and configure Uvicorn to avoid duplicate access logs. [structlog](https://www.structlog.org/en/stable/contextvars.html), [Uvicorn logging options](https://uvicorn.dev/settings/#logging) |
| OpenAI calls | Log duration, outcome, model, upstream request ID, and token usage when available. Exclude authorization headers, cookies, API keys, connection URLs, and request or response bodies from routine logs. |
| Authentication and errors | Use FastAPI route dependencies for token checks, account authorization, and household membership checks. Use exception handlers for consistent JSON errors and include the request ID in error responses. Check CSRF on Next.js routes that use session cookies. |
| Proxy and CORS | Keep browser calls same-origin through Next.js. Add FastAPI CORS middleware only if a browser client needs direct cross-origin access, using an explicit origin allowlist. [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/) |
| Health and lifecycle | Initialize and close the database engine and upstream HTTP clients in FastAPI's lifespan. Use a liveness endpoint that checks the process and a readiness endpoint that checks database connectivity with a short timeout. Keep health checks independent of external APIs. [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/) |

Start with structured logs and health checks. Revisit OpenTelemetry when the deployment needs traces across Next.js, FastAPI, and PostgreSQL. [OpenTelemetry for Python](https://opentelemetry.io/docs/languages/python/)

## Swagger and OpenAPI

FastAPI serves Swagger UI at `/docs` and the generated OpenAPI schema at `/openapi.json`. Both come from `fastapi`. Document stock creation, photo analysis, barcode lookup, and the proposed `POST /api/menus` operation. Include typed examples for bilingual results, missing products, a photo with no usable suggestions, no suitable menu, invalid input, authorization errors, rate limits, and upstream failures. [FastAPI OpenAPI and docs URLs](https://fastapi.tiangolo.com/tutorial/first-steps/)

Sign in with `POST /api/auth/login`, then paste the response's `token` into Swagger's **Authorize** dialog. Serve deployed authentication and API traffic over HTTPS and limit the production docs and schema to developers. [FastAPI security tools](https://fastapi.tiangolo.com/reference/security/)

## Authentication operations

Usernames are stored lowercase and accept 3 to 32 ASCII letters, numbers, periods, underscores, and hyphens. The first character must be a letter or number. Passwords are 15 to 128 characters. A session lasts seven days from issue and signing out revokes that session. Rate limits apply over 15-minute windows across API instances. Sign-in allows 10 attempts per username and 30 per source address. Registration allows 10 attempts per source address. When deploying behind a proxy, configure Uvicorn to trust forwarded addresses only from your proxy. [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

From `backend/`, an operator with database access can reset a password with `uv run python -m fridgellio.manage_auth set-password USERNAME`. The command prompts for the new password and revokes all existing sessions for that account. Run `uv run python -m fridgellio.manage_auth prune` periodically to remove expired sessions and rate-limit records.

The migration preserves existing account IDs, pantry membership, and settings. For a member with an existing account from the previous provider, verify their ownership and use `uv run python -m fridgellio.manage_auth set-password USERNAME --legacy-account-id ACCOUNT_UUID` to attach local credentials to that account.

## Development dependencies

| Package | Use in Fridgellio | Reference |
| --- | --- | --- |
| `pytest` | Run menu validation unit tests and endpoint tests. | [FastAPI testing guide](https://fastapi.tiangolo.com/tutorial/testing/) |
| `ruff` | Lint and format the Python backend. | [Ruff documentation](https://docs.astral.sh/ruff/) |

Use `uv` to manage the Python environment and dependencies declared in `backend/pyproject.toml`. The first successful `uv sync` generates `backend/uv.lock`. Commit that lockfile and use `uv sync --locked` in CI. [uv with FastAPI](https://docs.astral.sh/uv/guides/integration/fastapi/), [uv locking and syncing](https://docs.astral.sh/uv/concepts/projects/sync/)

Run database integration tests against PostgreSQL provisioned for the test run. Cover migration from an empty schema, shared access within a household, isolation between households and between user settings, and concurrent stock deductions. Stub OpenAI and Open Food Facts in routine API tests and cover personal ingredient filtering, incomplete bilingual results, and upstream failures.

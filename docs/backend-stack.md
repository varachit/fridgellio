# Fridgellio backend stack

The planned backend lives in `apps/api/` and uses FastAPI. PostgreSQL stores each account's stock entries, inventory history, equipment, menus, and language preference. FastAPI calls OpenAI directly for photo analysis and menu generation and calls Open Food Facts for barcode lookups. See the [product requirements](requirements.md) for the intake and menu rules.

## Runtime dependencies

| Package | Use in Fridgellio | Reference |
| --- | --- | --- |
| `fastapi` | Define the JSON API, wire up authorization dependencies, and generate OpenAPI and Swagger UI from route and model declarations. | [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/) |
| `uvicorn` | Run the FastAPI application as an ASGI server in development and deployment. | [FastAPI deployment guide](https://fastapi.tiangolo.com/deployment/manually/) |
| `pydantic` v2 | Define and validate request and response models, including ingredient quantities, units, equipment, and cooking steps. Declare it directly because the backend imports its models. | [Pydantic models](https://docs.pydantic.dev/latest/concepts/models/) |
| `pydantic-settings` | Validate server configuration from environment variables, including the PostgreSQL connection URL, OpenAI model and key, and Auth0 issuer and audience. | [FastAPI settings guide](https://fastapi.tiangolo.com/advanced/settings/) |
| `openai` | Use the official async Python client to call the Responses API directly for photo analysis and menu generation. Parse bilingual Structured Outputs with Pydantic. Set an explicit request timeout and a bounded retry policy. | [OpenAI Python SDK](https://github.com/openai/openai-python), [Images and vision](https://developers.openai.com/api/docs/guides/images-vision?api-mode=responses), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) |
| `python-multipart` | Parse grocery photo uploads through FastAPI's `UploadFile`. | [FastAPI file uploads](https://fastapi.tiangolo.com/tutorial/request-files/) |
| `httpx` | Use an async client for Open Food Facts lookups and support FastAPI's `TestClient` in tests. | [HTTPX async support](https://www.python-httpx.org/async/), [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/#using-testclient) |
| `PyJWT[crypto]` | Verify Auth0 access tokens using the issuer's published signing keys (JWKS). Pin the expected signing algorithm in configuration and validate the issuer, audience, and expiration. Check the `menus:generate` scope before calling OpenAI. | [FastAPI JWT guidance](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/), [Auth0 token validation](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens), [PyJWT examples](https://pyjwt.readthedocs.io/en/latest/usage.html) |
| `sqlalchemy[asyncio]` | Map and query inventory, equipment, and history using SQLAlchemy 2.x. Manage PostgreSQL connections through the SQLAlchemy engine and pool. | [SQLAlchemy PostgreSQL dialect](https://docs.sqlalchemy.org/en/21/dialects/postgresql.html) |
| `psycopg[binary]` | Connect SQLAlchemy to PostgreSQL using Psycopg 3. Use the binary distribution on supported targets. | [Psycopg installation](https://www.psycopg.org/psycopg3/docs/basic/install.html) |
| `alembic` | Version the PostgreSQL schema. Review the generated revisions and apply them once as a deployment step before starting the new app version. | [Alembic migration guide](https://alembic.sqlalchemy.org/en/latest/autogenerate.html) |
| `structlog` | Emit structured JSON logs with a request ID shared by the request's application events. | [structlog context variables](https://www.structlog.org/en/stable/contextvars.html) |

Auth0 is the proposed identity provider. Next.js manages the browser session and forwards an API access token to FastAPI. The OpenAI API key stays in the FastAPI environment. Apply a per-user rate limit before sending a request to OpenAI. Choose the rate-limit storage or service alongside the deployment topology so limits can be shared if the API runs across replicas.

## Grocery intake and localization

- **Manual entry** uses the standard stock creation flow. Photo analysis and barcode lookup return editable suggestions. Only an explicit save writes a stock entry.
- **Photo analysis** accepts a camera image through FastAPI, checks the file type and size, and sends it to a vision-capable OpenAI model. Return English and Thai name suggestions with optional quantities and dates. Discard the photo after processing in Fridgellio.
- **Barcode lookup** sends `GET https://world.openfoodfacts.org/api/v3/product/{lookupCode}` with `cc=th`, `lc=en` or `lc=th` matching the app language, and `fields=code,product_name,product_name_th,product_name_en,brands,quantity`. Treat the barcode as a string to preserve leading zeros. Send an identifiable `User-Agent` and handle missing products, rate limits, and timeouts. Use the selected-language name when present, then the generic name or other available translation. [Open Food Facts v3 product lookup](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/)
- **Bilingual content** uses `en` and `th` fields for each AI-generated name or cooking step. Validate that both values are nonblank. Save both translations for confirmed photo entries and validated menus. Use shared quantities and stable ingredient and equipment references so a language change affects display text only. Keep static UI translations in the frontend and store the selected language on the account.

## PostgreSQL persistence

- Scope all reads and writes to the account resolved from the verified token's issuer and subject. Use foreign keys for ownership and history, `numeric` for quantities, `date` for expiry dates, and timezone-aware timestamps for inventory events.
- Update the remaining quantity and insert the usage or discard event in one transaction. Use an atomic conditional update to reject deductions that would take stock below zero, including concurrent requests. [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- Release the database connection while waiting for OpenAI. Recheck stock and equipment in a fresh read before returning the menu so an inventory change during generation can invalidate the result.

## Validation

| Layer | Checks |
| --- | --- |
| Next.js forms | Give field-level feedback for missing names, invalid quantities, and invalid dates. Preserve entered values when the API rejects a save. |
| FastAPI request models | Use Pydantic v2 to reject unexpected fields, blank names after trimming, unsupported units or locations, and invalid calendar dates. Take quantities as decimal strings such as `"0.15"`, parse them to `Decimal`, and require finite, positive values for new stock and inventory deductions. Require whole numbers for `each`. Use field constraints for individual values and model validators for rules that depend on multiple fields. [Pydantic validators](https://docs.pydantic.dev/latest/concepts/validators/) |
| FastAPI business rules | Check ownership and available stock using current database state. For a menu, parse the OpenAI response into a Pydantic model and check its ingredient names, combined quantities across dishes, and listed equipment against the account's stock and equipment. Require a dish name and a nonempty list of cooking steps. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) |
| PostgreSQL | Enforce required fields, foreign keys, and quantity constraints on writes. Allow zero remaining stock and require positive quantities in usage and discard events. Keep the deduction and its history entry in the same transaction. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) |

Return `422` with field paths and messages for invalid request fields, `409` if current stock is insufficient for a deduction, and `502` when OpenAI returns a malformed or unusable menu. An explicit no-menu result is a normal outcome. Include the request ID in errors and document the response models in Swagger. [FastAPI error handling](https://fastapi.tiangolo.com/tutorial/handling-errors/)

## Middleware and operations

| Concern | MVP plan |
| --- | --- |
| Request logging | Use ASGI middleware to generate a request ID, return it as `X-Request-ID`, and log one completion event with HTTP method, route template, status, and duration. Emit JSON to stdout and configure Uvicorn to avoid duplicate access logs. [structlog](https://www.structlog.org/en/stable/contextvars.html), [Uvicorn logging options](https://uvicorn.dev/settings/#logging) |
| OpenAI calls | Log duration, outcome, model, upstream request ID, and token usage when available. Exclude authorization headers, cookies, API keys, connection URLs, and request or response bodies from routine logs. |
| Authentication and errors | Use FastAPI route dependencies for token checks and account authorization. Use exception handlers for consistent JSON errors and include the request ID in error responses. Check CSRF on Next.js routes that use session cookies. |
| Proxy and CORS | Keep browser calls same-origin through Next.js. Add FastAPI CORS middleware only if a browser client needs direct cross-origin access, using an explicit origin allowlist. [FastAPI CORS](https://fastapi.tiangolo.com/tutorial/cors/) |
| Health and lifecycle | Initialize and close the database engine and upstream HTTP clients in FastAPI's lifespan. Use a liveness endpoint that checks the process and a readiness endpoint that checks database connectivity with a short timeout. Keep health checks independent of external APIs. [FastAPI lifespan](https://fastapi.tiangolo.com/advanced/events/) |

Start with structured logs and health checks. Revisit OpenTelemetry when the deployment needs traces across Next.js, FastAPI, and PostgreSQL. [OpenTelemetry for Python](https://opentelemetry.io/docs/languages/python/)

## Swagger and OpenAPI

FastAPI serves Swagger UI at `/docs` and the generated OpenAPI schema at `/openapi.json`. Both come from `fastapi`. Document stock creation, photo analysis, barcode lookup, and the proposed `POST /api/menus` operation. Include typed examples for bilingual results, missing products, a photo with no usable suggestions, no suitable menu, invalid input, authorization errors, rate limits, and upstream failures. [FastAPI OpenAPI and docs URLs](https://fastapi.tiangolo.com/tutorial/first-steps/)

Enable Swagger's **Authorize** and **Try it out** in local development and staging using a dedicated public OAuth client with Authorization Code + PKCE. Limit access to the production docs and schema to developers. [FastAPI security tools](https://fastapi.tiangolo.com/reference/security/), [Swagger OAuth settings](https://swagger.io/docs/open-source-tools/swagger-ui/usage/oauth2/)

## Development dependencies

| Package | Use in Fridgellio | Reference |
| --- | --- | --- |
| `pytest` | Run menu validation unit tests and endpoint tests. | [FastAPI testing guide](https://fastapi.tiangolo.com/tutorial/testing/) |
| `ruff` | Lint and format the Python backend. | [Ruff documentation](https://docs.astral.sh/ruff/) |

Use `uv` to manage the Python environment and dependencies. At implementation, declare the runtime packages and the `dev` dependency group in `apps/api/pyproject.toml`, resolve compatible versions, and check in `apps/api/uv.lock`. CI should use the lockfile without updating it. [uv with FastAPI](https://docs.astral.sh/uv/guides/integration/fastapi/), [uv locking and syncing](https://docs.astral.sh/uv/concepts/projects/sync/)

Run database integration tests against PostgreSQL provisioned for the test run. Cover migration from an empty schema, account isolation, and concurrent stock deductions. Stub OpenAI and Open Food Facts in routine API tests and cover incomplete bilingual results and upstream failures.

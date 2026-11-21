# Fridgellio

Fridgellio helps households track pantry items and groceries together and decide what to cook. It sends eligible ingredients and the household's available cooking equipment to OpenAI, then shows a suggested menu with ingredient quantities and step-by-step cooking instructions. Each member can set their own **Foods to avoid** for their meal ideas.

## Who it serves

The first release is designed for household members who shop and cook. They share one pantry where they can check what is already at home, see which groceries are due soon, and record what they used or discarded. Registration requires a first name and last name. Each member signs in to Fridgellio with their own username and password. Members can edit their names under **Settings → Profile**, where both fields are required. The sidebar uses the username for older accounts that have no saved name. Profile pictures are read-only.

## First-release experience

1. Add groceries manually, take a photo for AI suggestions, or open the barcode camera and select **Read barcode** to fill in its digits. Select **Look up product** to find a match and prefill the quantity and unit when the package size is available. Review the name, quantity, unit, and storage location before saving. Add an expiry date when available.
2. Open **Use soon** to see food dated within the next three days, with the closest dates first. Past-date entries appear in a separate list.
3. In **Settings**, select a card for each piece of cooking equipment your household has. Select it again to remove it. Add any ingredients you want to exclude under **Foods to avoid**. In **Meal ideas**, request a menu using the shared pantry, selected equipment, and your personal food preferences. The menu shows what to make, how much to use, which equipment is needed, and how to cook it.
4. Record what you used directly in inventory after cooking. Open **History** or an item's **Entry history** to see who added, used, or discarded stock and in what quantity. Open **Household** to see who shares your pantry. The owner can create and remove unused invitation codes such as `K7RM-3X9D`.

Use the app in English or Thai. Fridgellio saves both language versions of AI-generated grocery names and menus so switching languages can display the saved translation.

## Monorepo structure

| Path | Purpose |
| --- | --- |
| `docs/requirements.md` | First-release scope, business rules, and acceptance criteria |
| `docs/backend-stack.md` | Backend libraries, API documentation, and tooling |
| `docs/backend-todo.md` | Backend routes, implementation checklist, and verification status |
| `frontend/` | English and Thai Next.js application with NextAuth, TanStack Query, and Zustand, managed with `pnpm` |
| `backend/` | FastAPI service managed with `uv`, including PostgreSQL persistence, account and session management, barcode lookup, and Swagger UI |

FastAPI stores shared inventory, cooking equipment, and each member's private settings in PostgreSQL. Barcode lookup checks verified corrections by exact barcode, then uses OpenAI web search when configured, with Open Food Facts as a fallback. The first backend pass reserves routes for OpenAI photo analysis and bilingual menu generation. See the [backend stack](docs/backend-stack.md) for integration and Swagger details.

**Read barcode** sends a camera still to `POST /api/barcodes/decode` as a multipart `photo` field. The authenticated endpoint returns the barcode digits as a JSON string, for example `"8851234567898"`. **Look up product** sends those digits to `GET /api/barcodes/{code}`.

## Run the backend

Copy [`.env.example`](.env.example) to `.env` at the repository root and set `DATABASE_URL` for the local `fridgellio` PostgreSQL database. Restrict deployed Swagger to developers or set `DOCS_ENABLED=false`.

```sh
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn fridgellio.main:create_app --factory --reload --no-access-log
```

Open Swagger UI at `http://127.0.0.1:8000/docs`. Register with `POST /api/auth/register` and supply `username`, `password`, `first_name`, and `last_name`. Sign in to an existing account with `POST /api/auth/login`. Copy the returned `token` into Swagger’s **Authorize** field to call protected routes. The household owner can issue single-use invites that expire after 24 hours and revoke them before use. The photo and menu routes return `501` until AI integration is added.

See [Authentication operations](docs/backend-stack.md#authentication-operations) for password resets, expired session cleanup, and provisioning local credentials for existing accounts.

From `backend/`, run `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Set `FRIDGELLIO_TEST_DATABASE_URL` to also run the PostgreSQL tests. The test role needs permission to create a temporary schema.

### Try the OpenAI Responses API

Set `OPENAI_API_KEY` in the repository root `.env` using a key from your OpenAI project. Restart the backend after changing the key. [OpenAI API keys](https://platform.openai.com/api-keys)

Run the following command from `backend/` to make a test request.

```sh
uv run --locked --env-file ../.env python - <<'PY'
from openai import OpenAI

with OpenAI() as client:
    response = client.responses.create(
        model="gpt-5.4-mini",
        input="Reply with OK.",
        store=False,
    )
    print(response.output_text)
PY
```

## Run the frontend

Start the backend first, then open a second terminal with Node.js 22.18 or later and pnpm 10. On a new checkout, copy the frontend environment example to `frontend/.env.local` and set `NEXTAUTH_SECRET` to the output of `openssl rand -base64 32`. [Frontend environment example](frontend/.env.example)

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`, create an account, and create a household or join with an invitation code. The Next.js server connects to FastAPI at `http://127.0.0.1:8000` by default. See the [frontend guide](frontend/README.md) for configuration and browser tests.

## How to judge the first release

Household members should be able to add groceries to the same pantry and get meal ideas using the shared stock and equipment and their own **Foods to avoid** settings. After one member records what they used, the other members should see the updated quantities.

See [Product requirements](docs/requirements.md) for detailed behavior and acceptance criteria.

See [Design tokens and UX proposal](docs/design-tokens.md) for the proposed green-and-white visual system, Lucide icons, accessibility targets, and low-effort pantry workflows. Proposed features beyond the current first release are marked in that document.

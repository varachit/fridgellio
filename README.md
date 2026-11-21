# Fridgellio

Fridgellio helps households track pantry items and groceries together and decide what to cook. In **Meal ideas**, members can generate up to five recipes from their pantry and selected equipment.

## Who it serves

The first release is designed for household members who shop and cook. They share one pantry where they can check what is already at home, see which groceries are due soon, and record what they used or discarded. Registration requires a first name and last name. Each member signs in to Fridgellio with their own username and password. Members can edit their names under **Settings → Profile**, where both fields are required. The top-bar profile button uses initials when a picture is unavailable, deriving them from the username for older accounts without saved names. Profile pictures are read-only.

## First-release experience

1. In **Add groceries**, enter items manually or select **Photo**. Choose **Open camera** to take a picture with your phone or webcam, or **Choose image** to select an existing photo. Preview the image and select **Analyze photo**. For a packaged product, select **Scan barcode** for automatic lookup or type the digits and select **Look up product**. Review the name, quantity, unit, and storage location before saving. Add an expiry date when available.
2. Open **Use soon** to see food dated within the next three days, with the closest dates first. Past-date entries appear in a separate list. Inventory shows a past-date alert, and the workspace top bar has an expiry-notification bell and profile menu on the right. Select **Review expired items** to open the past-date list.
3. In **Settings**, select a card for each piece of cooking equipment your household has. Select it again to remove it. Add any ingredients you want to exclude under **Foods to avoid**. In **Meal ideas**, choose servings and a time limit. Expand the sections for dietary styles, a nutrition goal, cuisines, difficulty, and kitchen settings. Adjust exclusions or equipment for this meal, then select **Generate menu** to see recommendations with AI-generated illustrations. Recipes are available while their images are generating.
4. Record what you used directly in inventory after cooking. Open **History** or an item's **Entry history** to see who added, used, or discarded stock and in what quantity. Open **Statistics** to compare actual use with groceries lost after expiry over the latest six months. Open **Household** to see who shares your pantry. The owner can create and remove unused invitation codes such as `K7RM-3X9D`.

Use the app in English or Thai. After joining a household, change language in **Settings → Language**; your profile remains in the top bar. Inventory uses a plain heading with a Three.js paper grocery bag that hops gently on hover or tap. Fridgellio saves both language versions of AI-generated grocery names and menus so switching languages can display the saved translation.

## Monorepo structure

| Path | Purpose |
| --- | --- |
| `docs/requirements.md` | First-release scope, business rules, and acceptance criteria |
| `docs/backend-stack.md` | Backend libraries, API documentation, and tooling |
| `docs/backend-todo.md` | Backend routes, implementation checklist, and verification status |
| `frontend/` | English and Thai Next.js application with NextAuth, TanStack Query, and Zustand, managed with `pnpm` |
| `backend/` | FastAPI service managed with `uv`, including PostgreSQL persistence, account and session management, barcode lookup, and Swagger UI |
| `assets/brand/` | Lucide-derived SVG logo variants and usage guidance |
| `frontend/experimental/` | Standalone Three.js illustration and Framer Motion UI preview, with exported GLB models |

FastAPI stores shared inventory, optional grocery prices in Thai baht, cooking equipment, and each member's private settings in PostgreSQL. Recipe recommendations use saved prices to show proportional cost estimates with coverage labels. Grocery photos are analyzed with OpenAI to produce editable bilingual item suggestions. Barcode lookup checks verified corrections by exact barcode, then uses OpenAI web search when configured, with Open Food Facts as a fallback. OpenAI also generates up to five bilingual recipe recommendations when configured. See the [backend stack](docs/backend-stack.md) for integration and Swagger details.

**Scan barcode** sends camera stills one at a time to `POST /api/barcodes/decode` as multipart `photo` fields. Once the endpoint returns barcode digits such as `"8851234567898"`, the camera stops and the frontend sends those digits to `GET /api/barcodes/{code}`.

## Run the backend

Copy [`.env.example`](.env.example) to `.env` at the repository root and set `DATABASE_URL` for the local `fridgellio` PostgreSQL database. Restrict deployed Swagger to developers or set `DOCS_ENABLED=false`.

```sh
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn fridgellio.main:create_app --factory --reload --no-access-log
```

Open Swagger UI at `http://127.0.0.1:8000/docs`. Register with `POST /api/auth/register` and supply `username`, `password`, `first_name`, and `last_name`. Sign in to an existing account with `POST /api/auth/login`. Copy the returned `token` into Swagger’s **Authorize** field to call protected routes. The household owner can issue single-use invites that expire after 24 hours and revoke them before use. Send one JPEG, PNG, or WebP file in the `photo` field to `POST /api/photos/analyze` for editable grocery suggestions. Use `POST /api/menus/recommendations` with `generate: true` to request recipe recommendations. Set `OPENAI_API_KEY` and restart the backend to enable both AI workflows.

See [Authentication operations](docs/backend-stack.md#authentication-operations) for password resets, expired session cleanup, and provisioning local credentials for existing accounts.

From `backend/`, run `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`. Set `FRIDGELLIO_TEST_DATABASE_URL` to also run the PostgreSQL tests. The test role needs permission to create a temporary schema.

For a Vercel API deployment, set the project's **Root Directory** to `backend` and **Framework Preset** to **FastAPI**. Vercel reads the application entrypoint from [backend/pyproject.toml](backend/pyproject.toml). After deployment, `GET /health/live` should return `{"status":"ok"}`.

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

Household members should be able to add groceries to the same pantry and preview meal requests using shared stock and equipment and their own **Foods to avoid** settings. After one member records what they used, the other members should see the updated quantities.

See [Product requirements](docs/requirements.md) for detailed behavior and acceptance criteria.

See [Design tokens and UX proposal](docs/design-tokens.md) for the proposed green-and-white visual system, Lucide icons, accessibility targets, and low-effort pantry workflows. Proposed features beyond the current first release are marked in that document.

The public landing page, sign-in and registration forms, and inventory header reuse the refrigerator and vegetable bowl from the [Three.js illustration study](frontend/experimental/README.md). Signed-out visitors can register or sign in from the landing page. Signed-in members open their household kitchen directly. Install its pinned dependencies with `npm ci --prefix frontend/experimental`, serve the repository with `python3 -m http.server 8765 --bind 127.0.0.1`, and open `http://127.0.0.1:8765/frontend/experimental/`. This standalone preview runs independently of the application and backend.

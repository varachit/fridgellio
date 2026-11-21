# Fridgellio web app

Household members can register, join a shared pantry, add groceries, track dates, and record use or discard. Settings holds shared kitchen equipment, personal foods to avoid, and household invitations. Switch between English and Thai using the language control.

## Local development

Use Node.js 22.18 or later and pnpm 10. On a new checkout, copy `.env.example` to `.env.local` in this directory. Generate a secret with `openssl rand -base64 32` and assign it to `NEXTAUTH_SECRET`. [Frontend environment example](.env.example)

Start FastAPI and PostgreSQL, then run these commands from this directory. [Backend setup](../README.md#run-the-backend)

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Create an account and choose **Create household**. To share a pantry, the creator can generate a code in **Settings**. A new member can enter it after registration.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `NEXTAUTH_SECRET` | Secret used to encrypt the NextAuth cookie. Use a persistent value shared by the Next.js instances in one deployment. Rotating it requires members to sign in again. |
| `NEXTAUTH_URL` | Public origin for the web app, such as `http://localhost:3000` in development. Set the HTTPS origin in production so NextAuth uses secure cookies and the correct callback URLs. |
| `FRIDGELLIO_API_URL` | FastAPI origin reachable by the Next.js server. Defaults to `http://127.0.0.1:8000`. |

Set these values on the Next.js server or in `frontend/.env.local`. Existing configurations can use `FRIDGELLIO_WEB_ORIGIN` as a fallback for `NEXTAUTH_URL`.

```sh
pnpm build
pnpm start
```

## Authentication and state

NextAuth’s Credentials provider calls FastAPI to register or sign in. FastAPI owns the account, password hash, and seven-day session. NextAuth keeps the FastAPI bearer token in an encrypted HttpOnly cookie. The public session contains the account ID, username (as `user.name`), nullable `user.firstName`, `user.lastName`, and `user.image`, and expiry. The sidebar displays a provisioned HTTPS profile picture or the member’s initials. The same-origin Next.js API proxy forwards the bearer token to FastAPI for authorization. [Credentials provider](https://next-auth.js.org/providers/credentials)

Reading the web session checks the backend session. Signing out revokes that browser’s backend session before clearing its cookie. If FastAPI cannot confirm revocation, the form allows a retry. Browsers using the previous web cookie sign in once with their existing credentials.

TanStack React Query manages household, preference, inventory, history, equipment, menu, and barcode reads. Each signed-in account gets a separate in-memory cache. Writes update or invalidate the relevant entries. Zustand holds the display language across screens, with the signed-in member’s preference saved to FastAPI. Form drafts stay local to the form.

## Pantry workflows

- Inventory shows active entries separately for each purchase. Search by any saved name, filter by storage location, and select an entry to edit, remove, use, or discard it. Shared stock refreshes after writes, on window focus, and every 30 seconds while visible.
- **Use soon** groups entries due today through three days ahead and lists past-date groceries separately. The app sends the member’s local calendar date to FastAPI.
- **History** includes usage and discard events after a stock entry is depleted or removed. A retry of the same deduction in the open form reuses its request key.
- Scan a barcode using the camera or type the digits. Review localized names and enter the actual quantity before saving. The browser loads the scanner when the camera is opened.
- Photo intake and meal ideas call the backend contracts. The current service returns `501 ai_not_implemented` for analysis and generation. Photo intake offers manual entry and meal ideas offers a retry. **Saved menus** displays any validated menus stored for the account.

## Verification

```sh
pnpm typecheck
pnpm test
pnpm build
```

For the browser tests, use a **disposable PostgreSQL database**. The test role needs permission to create a temporary schema. Each run applies migrations inside that schema and removes it at shutdown. Install the backend dependencies with `uv sync` from the backend directory and set `FRIDGELLIO_E2E_DATABASE_URL` to the test database connection URL.

```sh
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

Playwright starts its own FastAPI and Next.js servers on loopback ports 8310 and 3310. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use a preinstalled Chromium binary. The suite checks backend session issuance, independent sign-out, expiry, account cache isolation, a phone viewport, and actual stock mutations. Barcode product data in the browser test comes from a controlled response. The backend also has [barcode and validation tests](../backend/tests/test_validation_and_barcode.py).

The sign-in photograph is a locally served ImageGen asset.

## Experimental illustration preview

The independent [experimental preview](experimental/README.md) contains Three.js refrigerator and vegetable models, hover interactions, and Framer Motion UI animations. It runs on a static server and is not a Next.js application route. See its guide for setup, model exports, screenshots, and checks.

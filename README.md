# Fridgellio

Fridgellio helps households track pantry items and groceries and decide what to cook. It sends the ingredients on hand and the available cooking equipment to OpenAI, then shows a suggested menu with ingredient quantities and step-by-step cooking instructions.

## Who it serves

The first release is designed for a household member who shops and cooks regularly. They can check what is already at home before shopping, see which groceries are due soon, and record what they used or discarded.

## First-release experience

1. Add groceries manually, take a photo for AI suggestions, or scan a barcode to look up a product in Open Food Facts. Review the name, quantity, unit, and storage location before saving. Add an expiry date when available.
2. Open **Use soon** to see food dated within the next three days, with the closest dates first. Past-date entries appear in a separate list.
3. In **Meal ideas**, enter the cooking equipment you have available and request a menu. Fridgellio calls OpenAI with the current ingredients and equipment. The menu shows what to make, how much to use, which equipment is needed, and how to cook it.
4. Record what you used directly in inventory after cooking.

Use the app in English or Thai. Fridgellio saves both language versions of AI-generated grocery names and menus so switching languages can display the saved translation.

## Proposed project structure

| Path | Purpose |
| --- | --- |
| `docs/requirements.md` | First-release scope, business rules, and acceptance criteria |
| `docs/backend-stack.md` | Planned backend libraries, API documentation, and tooling |
| `apps/web/` | Planned Next.js app managed with `pnpm`, including inventory, expiry, equipment, and meal ideas |
| `apps/api/` | Planned FastAPI service managed with `uv`, including PostgreSQL persistence, menu generation, token verification, and Swagger UI |

The first implementation is proposed as a browser app with a private pantry for each signed-in account. FastAPI stores inventory, cooking equipment, and bilingual menus in PostgreSQL. It calls OpenAI directly for photo analysis and menu generation, and Open Food Facts for barcode lookup. Household sharing is future work. See the [backend stack](docs/backend-stack.md) for planned integrations and Swagger details.

## How to judge the first release

A household member should be able to add groceries, list the equipment they have, and get a menu they can cook with both. After cooking, they can record what they used and see the updated quantities in inventory.

See [Product requirements](docs/requirements.md) for detailed behavior and acceptance criteria.

# Smart Pantry

Smart Pantry helps households track pantry items and groceries and decide what to cook. It sends the ingredients on hand and the available cooking equipment to OpenAI, then shows a suggested menu with ingredient quantities and step-by-step cooking instructions.

## Who it serves

The first release is designed for a household member who shops and cooks regularly. They can check what is already at home before shopping, see which groceries are due soon, and record what they used or discarded.

## First-release experience

1. Add items with a quantity, unit, and storage location. Record an expiry date when available. Keep purchases with different dates in separate inventory entries.
2. Open **Use soon** to see food dated within the next three days, with the closest dates first. Past-date entries appear in a separate list.
3. In **Meal ideas**, enter the cooking equipment you have available and request a menu. Smart Pantry calls OpenAI with the current ingredients and equipment. The menu shows what to make, how much to use, which equipment is needed, and how to cook it.
4. Record what you used directly in inventory after cooking.

## Proposed project structure

| Path | Purpose |
| --- | --- |
| `docs/requirements.md` | First-release scope, business rules, and acceptance criteria |
| `src/ui/` | Future inventory, use-soon, and recipe screens |
| `src/domain/` | Future rules for inventory quantities, expiry, and menu validation |
| `src/data/` | Future browser storage adapter |
| `src/server/` | Future endpoint that calls OpenAI directly and keeps its API key on the server |
| `tests/` | Future tests for inventory rules and menu requests |

The first implementation is proposed as a browser app that stores inventory and cooking equipment in one browser profile. A server endpoint calls OpenAI directly when the user requests a menu. Accounts, household sharing, and synchronization are future work.

## How to judge the first release

A household member should be able to add groceries, list the equipment they have, and get a menu they can cook with both. After cooking, they can record what they used and see the updated quantities in inventory.

See [Product requirements](docs/requirements.md) for detailed behavior and acceptance criteria.

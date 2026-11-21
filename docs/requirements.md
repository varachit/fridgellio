# Smart Pantry product requirements

## Goals and scope

- Track pantry items and groceries by quantity and storage location in one browser profile.
- Surface groceries with approaching recorded expiry dates.
- Call OpenAI directly with the ingredients on hand and the household's available cooking equipment. Show a suggested menu with quantities, required equipment, and step-by-step cooking instructions.

Household supplies, a recipe catalog, recipe ranking, deductions from a generated menu, shared inventories, notifications outside the app, barcode scanning, receipt import, and automatic shopping lists are outside first-release scope.

## Functional requirements

| ID | Requirement |
| --- | --- |
| INV-01 | Add, edit, and remove stock entries for pantry items and groceries. An entry needs an item name, positive quantity, unit, and storage location. Its expiry date is optional. Offer pantry, fridge, freezer, and other as location choices. |
| INV-02 | Keep quantities from separate purchases as separate entries so dates and locations remain accurate. Allow searching by item name and filtering by location. |
| INV-03 | Record use or discard against a specific entry. Show the quantity remaining and prevent deductions above the available amount. Hide zero-quantity entries from active inventory and retain usage and discard records. Use removal to correct erroneous entries. |
| EXP-01 | Display dated food as **Past date**, **Due today**, **Use soon** (one to three days away), or **Later**. Group entries due today and in the next three days in the use-soon view, sorted by date. Food without a date appears as **No date** in inventory. |
| REC-01 | Let the user add, edit, or remove available cooking equipment and request a menu on demand. A server endpoint calls OpenAI directly with the current eligible ingredients (names, available quantities, and units) and equipment names. Keep the OpenAI API key on the server. |
| REC-02 | Include entries with positive quantities and recorded dates of today or later, plus undated entries with positive quantities. Compare ingredient names case-insensitively, ignoring leading, trailing, or repeated spaces. Combine matching quantities across entries within compatible units. Count, mass, and volume are distinct. |
| REC-03 | Show a menu with one or more dishes. For each dish, show its name, ingredient quantities and units, required equipment, and ordered cooking steps. Ask OpenAI to use only the supplied ingredients and equipment, including in the steps. Before displaying the menu, check that it has the required fields, that the quantities across all dishes fit the current stock, and that the listed equipment is available. |
| REC-04 | If no eligible ingredients exist, prompt the user to add stock. If OpenAI returns no suitable menu, show that outcome. If the request fails or returns an invalid menu, show a clear error and let the user try again. Users record ingredient usage manually through INV-03. |
| DATA-01 | Preserve inventory, usage and discard records, and the equipment list across reloads in the same browser profile. Explain where data is stored and show a clear error if a change could not be saved. |

## Data model

| Record | Fields |
| --- | --- |
| Stock entry | ID, item name, remaining quantity, unit, location, optional expiry date |
| Cooking equipment | Name |
| Generated menu | One or more dishes, each with a name, ingredient lines (name, quantity, unit), required equipment, and ordered cooking steps |
| Inventory event | ID, stock entry ID, item name, change type (used or discarded), quantity, unit, timestamp |

Store expiry dates as calendar dates. Determine today using the household member’s local date so due-today status changes at local midnight. Keep the first-release units to `each`, `g`, `kg`, `ml`, and `l`. Support decimal quantities for weight and volume and whole numbers for `each`.

## Acceptance criteria

| Scenario | Expected result |
| --- | --- |
| On June 10, food entries have dates of June 9, 10, 13, 14, or no date. | June 9 appears under **Past date**. June 10 and 13 appear in **Use soon**, in that order. June 14 and undated food stay visible in inventory. |
| The user has 100 g of spinach due tomorrow, 0.15 kg of spinach dated next week, and 50 g of past-date spinach. The equipment list contains a skillet and a stove. | The request to OpenAI includes a total of 250 g of spinach (or its equivalent) and lists the skillet and stove. A returned menu that uses 200 g of spinach with the skillet and stove is displayed with quantities, equipment, and ordered instructions. Inventory quantities remain unchanged until the user records usage. |
| Inventory has 150 g of eligible spinach. OpenAI returns two dishes that each use 100 g. | The app shows an error with a retry action and applies zero inventory changes. |
| The user lists a skillet and a stove. OpenAI returns a dish that requires an oven. | The app shows an error with a retry action and applies zero inventory changes. |
| The menu request times out. | The app shows an error and lets the user retry with the current ingredients and equipment. |
| The only stock entry is 50 g of past-date spinach. | The app prompts the user to add ingredients and makes zero OpenAI requests. |
| After cooking, the user records 75 g of spinach used from a 100 g entry. | Inventory shows 25 g remaining and records a 75 g usage event. |
| A user discards 50 g from a 150 g entry and reloads the app. | The entry shows 100 g remaining and a 50 g discard appears in its history. |

## Usability requirements

- Support phone and desktop layouts. Give all form controls visible labels, support keyboard navigation, and convey expiry status with text.
- Show clear empty states for inventory and food due soon. Show a loading state during menu generation and give the user a next action when a menu is unavailable.
- Validate quantities and dates before saving. Reflect failed saves in the interface and preserve the user's form input for retry.

# Fridgellio product requirements

## Goals and scope

- Track pantry items and groceries by quantity and storage location in one shared pantry per household. Each member signs in with their own account.
- Add pantry items and groceries manually, from a photo analyzed by OpenAI, or by looking up a barcode in Open Food Facts.
- Surface groceries with approaching recorded expiry dates.
- Let each member manage their own **Foods to avoid** in **Settings**. Use that list to filter the shared pantry when they request a menu.
- Call OpenAI directly with eligible ingredients and the household's available cooking equipment. Show a suggested menu with quantities, required equipment, and step-by-step cooking instructions.
- Support English and Thai in the app. Generate and save both languages for AI-generated grocery names and menus.

Household supplies, a recipe catalog, recipe ranking, deductions from a generated menu, notifications outside the app, receipt import, and automatic shopping lists are outside first-release scope.

## Functional requirements

| ID | Requirement |
| --- | --- |
| AUTH-01 | Let each member register and sign in with a case-insensitive username and a password of 15 to 128 characters. NextAuth handles web sign-in with the FastAPI account service, which stores hashed passwords. Use expiring server-side sessions and revoke the current session on sign-out. Limit repeated login attempts. Members can supply either or both names at registration. Existing accounts keep their username as their display name until a name is available. Profile picture uploads are disabled. |
| HH-01 | Give signed-in members of the same household access to the same pantry, inventory history, and cooking equipment. Verify household membership before every read or write of shared data. |
| INV-01 | Add, edit, and remove stock entries for pantry items and groceries. An entry needs an item name, positive quantity, unit, and storage location. Its expiry date is optional. Offer pantry, fridge, freezer, and other as location choices. |
| INV-02 | Keep quantities from separate purchases as separate entries so dates and locations remain accurate. Allow searching by item name and filtering by location. |
| INV-03 | Record use or discard against a specific entry. Show the quantity remaining and prevent deductions above the available amount. Hide zero-quantity entries from active inventory and retain usage and discard records. Use removal to correct erroneous entries. |
| INV-04 | Let the user take a grocery photo and send it to OpenAI for analysis. Return one or more editable item suggestions with English and Thai names. Suggest a quantity and unit or an expiry date when clearly visible, and leave uncertain fields blank. Let the user retake the photo or switch to manual entry if the photo cannot be read or the request fails. |
| INV-05 | Let the user scan a barcode or type its digits. Look it up through the Open Food Facts v3 product endpoint with country `th` and the current app language. Prefill available product names and show brand and package size when present. Treat package size as a hint and ask the user to confirm the amount they are adding. Offer manual entry if the product is missing or the lookup fails. |
| INV-06 | Use the same inventory form and validation for all entry methods. Let the user review, edit, and confirm each item before saving it to the household pantry. Save confirmed names in both languages when available. Keep quantity, unit, location, and expiry as shared values. |
| EXP-01 | Display dated food as **Past date**, **Due today**, **Use soon** (one to three days away), or **Later**. Group entries due today and in the next three days in the use-soon view, sorted by date. Food without a date appears as **No date** in inventory. |
| SET-01 | In **Settings**, let each signed-in user add or remove ingredient names under **Foods to avoid**. Only the account owner can read or edit the list. Apply the list to menus requested by that user. All household members can still view and manage the full pantry. |
| REC-01 | In Settings, let household members select or deselect cooking equipment using labeled cards. Save each change to the shared household. Show previously saved custom items as selected cards and let members remove them. When a member requests a menu, the server loads the household's stock and equipment and the requesting user's settings from PostgreSQL. It calls OpenAI directly with the filtered ingredient names, available quantities, units, and equipment names. Keep the OpenAI API key on the server. |
| REC-02 | Include entries with positive quantities and recorded dates of today or later, plus undated entries with positive quantities. Exclude any entry whose item name or saved English or Thai name matches an entry in the requesting user's **Foods to avoid** list. Compare names independent of the selected display language, ignoring case and leading, trailing, or repeated spaces. Combine matching quantities across eligible entries within compatible units. Count, mass, and volume are distinct. |
| REC-03 | Show a menu with one or more dishes. Generate dish names, display names for ingredients and equipment, and ordered cooking steps in English and Thai in the same response. Share ingredient quantities, units, and equipment references across languages. Ask OpenAI to use only the supplied ingredients and equipment, including in the steps. Before saving or displaying the menu, validate both languages, confirm that each listed ingredient is still eligible for the requesting user, check quantities across all dishes against current stock, and verify that the listed equipment is available. |
| REC-04 | If the pantry has no in-date or undated stock with positive quantities, prompt the user to add stock. If the user's **Foods to avoid** list filters out all eligible stock, explain that no ingredients are available for their menu. In either case, skip the OpenAI request. If OpenAI returns no suitable menu, show that outcome. If the request fails or returns an invalid menu, show a clear error and let the user try again. Users record ingredient usage manually through INV-03. |
| DATA-01 | Store household membership, shared inventory, usage and discard records, shared equipment, validated bilingual menus, and account settings in PostgreSQL. Signed-in users can access their household's shared data and their own settings and menus from another browser. Show a clear error if a change could not be saved. |
| LOC-01 | Let the user switch between English and Thai. Display UI labels and messages in the selected language. Select the stored language variant for item names and generated menus without calling OpenAI again. For manual entries and barcode results with only one name, display that name in either language. |

## Data model

| Record | Fields |
| --- | --- |
| Household | ID |
| Household membership | Household ID, account ID |
| Account | ID, username, password hash, optional first and last names, optional read-only profile picture URL, preferred language (`en` or `th`), foods to avoid (ingredient names) |
| Account session | Token digest, account ID, expiry timestamp |
| Stock entry | ID, household ID, item name, optional English and Thai names, remaining quantity, unit, location, optional expiry date |
| Cooking equipment | ID, household ID, name |
| Generated menu | ID, account ID, creation timestamp, dishes with bilingual names and steps, ingredient references with bilingual labels and shared quantities and units, and equipment references with bilingual labels |
| Inventory event | ID, stock entry ID, item name, change type (used or discarded), quantity, unit, timestamp |

Store expiry dates as calendar dates. Determine today using the household member’s local date so due-today status changes at local midnight. Keep the first-release units to `each`, `g`, `kg`, `ml`, and `l`. Support decimal quantities for weight and volume and whole numbers for `each`.

## Acceptance criteria

| Scenario | Expected result |
| --- | --- |
| A member registers as `PantryCook` and signs in as `pantrycook` from a second browser. They sign out from the first browser. | Both sessions resolve to the same account. After sign-out, the first session loses access and the second still works. |
| On June 10, food entries have dates of June 9, 10, 13, 14, or no date. | June 9 appears under **Past date**. June 10 and 13 appear in **Use soon**, in that order. June 14 and undated food stay visible in inventory. |
| The user has 100 g of spinach due tomorrow, 0.15 kg of spinach dated next week, and 50 g of past-date spinach. The equipment list contains a skillet and a stove. | The request to OpenAI includes a total of 250 g of spinach (or its equivalent) and lists the skillet and stove. A returned menu that uses 200 g of spinach with the skillet and stove is displayed with quantities, equipment, and ordered instructions. Inventory quantities remain unchanged until the user records usage. |
| Inventory has 150 g of eligible spinach. OpenAI returns two dishes that each use 100 g. | The app shows an error with a retry action and applies zero inventory changes. |
| The user lists a skillet and a stove. OpenAI returns a dish that requires an oven. | The app shows an error with a retry action and applies zero inventory changes. |
| The menu request times out. | The app shows an error and lets the user retry with the current ingredients and equipment. |
| The only stock entry is 50 g of past-date spinach. | The app prompts the user to add ingredients and makes zero OpenAI requests. |
| A user tries to save `1.5 each` eggs, `0 g` of new stock, or an expiry date of `2026-02-30`. | Each invalid field is identified, the form retains the entered values, and inventory stays unchanged. |
| A user saves `0.15 kg` of spinach with no expiry date. | The app saves exactly `0.15 kg` and shows the expiry as **No date**. |
| A photo clearly shows a carton of chicken eggs labeled `6`, but the expiry date is unreadable. | The review form suggests `Chicken eggs` and `ไข่ไก่` with `6 each` and leaves expiry blank. Inventory stays unchanged until the user confirms the entry. |
| The user scans a barcode in Thai. Open Food Facts returns a Thai and English product name and a package size of `500 g`. The user enters `250 g` and saves. | Both names are saved and inventory shows `250 g`. Switching to English shows the English name with the same quantity. |
| A barcode has no matching product. | The app offers manual entry and inventory stays unchanged. |
| A bilingual menu for `200 g` of spinach is saved, and the user switches from English to Thai. | The app shows the saved Thai dish name and cooking steps with the same `200 g` quantity and makes zero additional OpenAI requests. |
| OpenAI returns a menu with English cooking steps and no Thai cooking steps. | The app offers a retry and saves zero menus for that request. |
| After cooking, the user records 75 g of spinach used from a 100 g entry. | Inventory shows 25 g remaining and records a 75 g usage event. |
| A user discards 50 g from a 150 g entry, then signs in from another browser. | The entry shows 100 g remaining and a 50 g discard appears in its history. |
| Two requests each try to deduct 75 g from the same 100 g entry at the same time. | One deduction succeeds. Inventory shows 25 g remaining and exactly one 75 g usage event. |
| Two members of the same household see 100 g of spinach. One records using 75 g. | Both members see 25 g remaining and the same 75 g usage event. |
| Two members share a pantry with 250 g of spinach, 100 g of peanuts listed as `Peanuts` and `ถั่วลิสง`, and a skillet. The first saves `ถั่วลิสง` under **Foods to avoid** while using the app in English. The second has an empty list. | Both members still see both stock entries and the skillet. The first member's menu request includes 250 g of spinach and the skillet. The second member's request also includes 100 g of peanuts. The first member sees their saved setting after signing in from another browser. |
| A member removes `Peanuts` from their **Foods to avoid** list while the household has 100 g of eligible peanuts in stock. Another member keeps `Peanuts` on their list. | The first member's next menu request can use all 100 g. The second member's next request still excludes peanuts, and each member can read and edit only their own list. |
| The pantry contains 100 g of peanuts on the requesting member's **Foods to avoid** list. | The app explains that no ingredients are available for this member's menu and makes zero OpenAI requests. |
| A member's **Foods to avoid** list excludes peanuts. The pantry has 250 g of spinach and 100 g of peanuts. OpenAI returns a dish that lists 10 g of peanuts. | The app shows an error with a retry action and saves zero menus for that request. |
| One household has 250 g of spinach and a skillet. Another has 100 g of potatoes and a microwave. | Each household sees its own stock and equipment. The second household's menu request uses only the potatoes and microwave. A member of the second household cannot read or change the first household's stock by its entry ID. |
| A member selects the Skillet and Rice cooker cards, then opens Settings in Thai. Another member deselects the skillet. | Both cards show a checkmark after the language switch. After refreshing Settings, both members see only the rice cooker selected. |

## Usability requirements

- Treat landing-page and dashboard 3D illustrations as optional decoration. Keep pantry data and actions in accessible HTML, show a static fallback if WebGL is unavailable, honor reduced motion, and stop animation while offscreen or in a hidden tab. Illustration loading must not block core tasks.
- Support phone and desktop layouts. Give all form controls visible labels, support keyboard navigation, and convey expiry status with text.
- Show clear empty states for inventory and food due soon. Show a loading state during menu generation and give the user a next action when a menu is unavailable.
- Keep manual entry available when the camera is unavailable or permission is declined. Show progress for photo analysis and barcode lookup and keep the entry editable while reviewing results.
- Validate quantities and dates before saving. Reflect failed saves in the interface and preserve the user's form input for retry.

# Fridgellio Design Tokens

## Direction

A proposal for Fridgellio: a clean, cozy, friendly kitchen experience that answers “What should I cook today with what I have?” Put essential information before details. Use green and white as the primary colors, Lucide icons exclusively, and no emoji in the UI.

This document proposes visual and UX guidance for the intended experience. It does not change the approved scope in the current [requirements](requirements.md). Ranking three meal options, preferences, shopping budgets, purchase prices, and confirming inventory deductions from meals still require updated requirements and acceptance criteria before implementation. Preserve existing INV and REC IDs to trace those changes.

## Design principles

- **Make the next action obvious:** Highlight “Use soon” and “Find meals from my pantry” on the home screen.
- **Ask only for necessary information:** Show name, quantity, unit, and storage location in the main entry step. Dates and prices are optional. Never invent a use-by date when no information is available.
- **Give verifiable reasons:** “Uses 100 g of spinach due today” is clearer than “AI picked this for you.”
- **Keep users in control:** Let users adjust servings, cooking time, and actual quantities used. Opening a meal must not deduct inventory.
- **Be friendly without pressure:** Avoid guilt scores, full-screen red warnings, and messages that blame users for discarding food.

## Base colors

Use Tailwind palette names as the source of truth. Emerald supports the brand and primary actions; Stone provides backgrounds and text that make the green feel soft and warm.

| Group | Tailwind palette | Usage |
| --- | --- | --- |
| Brand | `emerald-50`, `emerald-100`, `emerald-700`, `emerald-800`, `emerald-900` | Highlight surfaces, primary buttons, selected states |
| Neutral | `white`, `stone-50`, `stone-100`, `stone-200`, `stone-500`, `stone-600`, `stone-900` | Surfaces, borders, text |
| Attention | `amber-50`, `amber-200`, `amber-800` | Food due today or within three days |
| Danger | `red-50`, `red-200`, `red-700`, `red-800` | Invalid input, discard confirmation, past-date items |
| Information | `sky-50`, `sky-200`, `sky-800` | Explanations and decision support |

Use light Stone and white for the main surfaces. Reserve green for important actions and emphasis rather than applying it to every element.

## Semantic color tokens

Components should use names that express purpose, such as `bg-primary`, instead of choosing palette shades independently.

| Token | Tailwind value | Usage |
| --- | --- | --- |
| `canvas` | `stone-50` | Page background |
| `surface` | `white` | Cards, forms, dialogs |
| `surface-muted` | `stone-100` | Secondary information areas |
| `foreground` | `stone-900` | Headings and primary content |
| `muted` | `stone-600` | Details, labels, placeholders |
| `border-subtle` | `stone-200` | Decorative separators |
| `border-control` | `stone-500` | Visible input and control boundaries |
| `primary` / `primary-hover` / `primary-active` | `emerald-700` / `emerald-800` / `emerald-900` | Primary buttons |
| `on-primary` | `white` | Text on primary buttons |
| `selected` / `on-selected` | `emerald-50` / `emerald-900` | Selected options, with a border and checkmark |
| `success-surface` / `success-text` | `emerald-50` / `emerald-800` | Successful saves |
| `warning-surface` / `warning-text` | `amber-50` / `amber-800` | Food to use soon |
| `danger-surface` / `danger-text` | `red-50` / `red-800` | Past-date items or invalid input |
| `danger-action` | `red-700` | Discard confirmation button with white text |
| `info-surface` / `info-text` | `sky-50` / `sky-800` | Estimated prices and explanations |
| `focus` | `emerald-700` | Focus outline around controls |
| `disabled-surface` / `disabled-text` | `stone-100` / `stone-600` | Unavailable controls with an adjacent explanation |

Do not rely on a `stone-200` border as the only way to identify an input. Avoid reducing opacity on an entire component until its text becomes hard to read.

## Typography

Use `Noto Sans Thai` as the primary font for both Thai and English, with `system-ui, sans-serif` as fallbacks. Use weights 400, 500, 600, and 700. Align both languages to a consistent baseline and avoid additional letter spacing in Thai.

| Token | Size / line height | Weight | Usage |
| --- | --- | --- | --- |
| `page-title` | 28 / 40 px | 700 | “What should I cook today?” |
| `section-title` | 20 / 32 px | 600 | “Use soon” |
| `card-title` | 18 / 28 px | 600 | Meal names |
| `body` | 16 / 28 px | 400 | Body content and inputs |
| `label` | 16 / 24 px | 500 | Labels and buttons |
| `supporting` | 14 / 24 px | 400 | Dates, reasons, supporting details |

Use `rem` in implementation so text scales with user preferences. Keep essential content at least 14 px at the default size. Do not truncate ingredient names, recommendation reasons, or errors to a single line. Use `tabular-nums` for quantities and prices.

## Space, shape, and elevation

| Token | Value | Tailwind / usage |
| --- | --- | --- |
| `space-1` | 4 px | `gap-1` between an icon and a badge |
| `space-2` | 8 px | `gap-2` between an icon and text |
| `space-3` | 12 px | `gap-3` between related controls |
| `space-4` | 16 px | `p-4` for cards and mobile page margins |
| `space-6` | 24 px | `gap-6`, `p-6` for information groups and desktop cards |
| `space-8` | 32 px | `gap-8` between sections |
| `radius-control` | 12 px | `rounded-xl` for inputs and buttons |
| `radius-card` | 16 px | `rounded-2xl` for cards |
| `radius-dialog` | 24 px | `rounded-3xl` for dialogs and top corners of sheets |
| `radius-chip` | 9999 px | `rounded-full` for badges and filters |
| `shadow-card` | Tailwind `shadow-sm` | Subtle elevation for interactive cards |
| `shadow-overlay` | Tailwind `shadow-lg` | Sheets and dialogs |
| `control-height` | At least 48 px | `min-h-12` for buttons, inputs, and icon buttons |
| `content-width` | 1152 px | `max-w-6xl mx-auto` |

Use subtle borders and whitespace to establish hierarchy. Avoid heavy shadows on every container. Rounded corners should feel welcoming while keeping form fields clearly recognizable.

## Framer Motion

Use Framer Motion for component animations through the current `motion` package, importing from `motion/react` as described in the [Motion for React installation guide](https://motion.dev/docs/react-installation). Motion for React is the current name of Framer Motion. When frontend implementation begins, install it in `apps/web/` with `pnpm add motion`. This document has not installed the dependency.

| Token | Value | Usage |
| --- | --- | --- |
| `motion-fast` | 120 ms | Hover / pressed colors |
| `motion-standard` | 180 ms | Revealing details |
| `motion-overlay` | 240 ms | Sheets / dialogs |
| `motion-easing` | `easeOut` | Motion easing for general state changes |
| `motion-distance` | 8 px | Card entry offset |
| `motion-stagger` | 40 ms | Staggering up to three meal cards |

Set `MotionConfig reducedMotion="user"` in the animation provider. Use `useReducedMotion` to set duration and delay to 0 when reduced motion is enabled: the provider setting alone still permits opacity and color animations. For CSS, also use `motion-reduce:transition-none` and `motion-reduce:animate-none`.

| UI element | Animation | Constraints |
| --- | --- | --- |
| Meal card | Opacity 0 → 1 and y 8 → 0 over 180 ms | Stagger by 40 ms only for a new result set; do not replay on input changes |
| Primary button | `whileTap` scale 0.98 over 120 ms | Preserve layout dimensions; do not enlarge on hover |
| Ingredient details | `AnimatePresence` with opacity over 180 ms | Use a button with `aria-expanded`; keep hidden controls out of the Tab order |
| Sheet / dialog | Opacity and y 16 → 0 over 240 ms | Use a project-built dialog component that manages focus, Escape, and modal semantics |
| Save confirmation | Text fades in over 120 ms | Announce through a live region without automatically moving focus |

Use `AnimatePresence` with stable ID-based keys for exit animations. Do not use array indexes as keys for inventory or meals. Avoid animated reranking while users are reading, celebration animations, and spinning icons while reading recipes. During AI generation, show “Finding meals from your pantry…” without invented progress percentages or time estimates.

## Lucide icons

Use outline icons at 20 px with `strokeWidth={2}`; use 24 px for navigation and 32 px for empty states. Match the text color. Do not mix in emoji or other icon libraries.

| Purpose | Lucide name | Accompanying label |
| --- | --- | --- |
| Pantry | `Refrigerator` | My pantry |
| Meal recommendations | `ChefHat` | Today's meals |
| Add ingredients | `Plus` | Add food |
| Photo / scan | `Camera` / `ScanBarcode` | Take a photo / Scan barcode |
| Use soon | `Clock` | Due today / Due in 2 days |
| Past-date items | `CircleAlert` | Past date by 1 day |
| Servings | `Users` | Serves 2 |
| Cooking time | `Timer` | 20 minutes |
| Additional shopping | `ShoppingBasket` | Buy 1 extra item |
| Alternative meals | `RefreshCw` | Show other meals |
| Record cooking | `Check` | Cooked it |
| Record discard | `Trash2` | Discarded it |
| History | `History` | History |
| Expand details | `ChevronDown` | View ingredients used |

Icons next to text use `aria-hidden="true"`. Icon-only buttons need an accessible name on the button, such as `aria-label="Close dialog"`, and a tooltip for mouse users.

## Component patterns

### Custom components only

Build every UI component within the project and style it with these design tokens. Do not use browser-native widget interfaces or prebuilt component libraries. This includes buttons, text fields, quantity steppers, selection controls, dropdowns, comboboxes, date pickers, tooltips, tabs, sheets, dialogs, and notifications. Use Lucide for icons and Framer Motion for animation.

This rule concerns the component implementation and visible UI. Keep semantic HTML foundations such as `button`, `input`, `textarea`, and `form` inside project-built components for keyboard behavior, form submission, autofill, and assistive technology. Do not replace them with clickable `div` elements merely to avoid native styling. Reset browser appearance where necessary and define every visible state through the design system.

| Browser-native UI to avoid | Project-built replacement | Required behavior |
| --- | --- | --- |
| Native `select` popup | Custom Select or Combobox | Accessible name, expanded state, arrow-key navigation, selection, Escape, and focus restoration |
| Native date input picker | Custom DatePicker with a text-entry alternative | Calendar keyboard navigation, clear date format, date validation, and no invented dates |
| Native number-input spinner | Custom QuantityInput with stepper buttons | Numeric text entry, accessible increase/decrease labels, and unit-specific validation |
| Browser `alert()`, `confirm()`, or `prompt()` | Custom Dialog or confirmation sheet | Accessible title, focus containment, Escape handling, and return focus |
| Browser validation bubbles | Custom inline field errors | Preserve input, identify the invalid field, and connect error text with `aria-describedby` |
| Browser `title` tooltip | Custom Tooltip | Available on hover and keyboard focus, dismissible with Escape; never the only accessible label |
| Visible native file-input control | Custom upload or camera trigger backed by an accessible file input | Keyboard activation, selected-file feedback, and manual-entry fallback |

System permission prompts, camera access prompts, operating-system keyboards, and file choosers remain platform-controlled. The application builds their entry points and feedback rather than attempting to reproduce system interfaces.

Create reusable components in the planned web app and use them throughout all screens. Include default, hover, pressed, focus, selected, disabled, loading, and error states wherever relevant. Verify keyboard and screen-reader behavior for custom widgets before reuse. When custom validation replaces browser bubbles, use form-level `noValidate` and implement equivalent validation and accessible error reporting.

### Styling and behavior

| Component | Recommended styling | Behavior |
| --- | --- | --- |
| Primary button | `bg-primary text-on-primary rounded-xl min-h-12 px-4 font-semibold` | One primary action per area |
| Secondary button | `bg-surface text-foreground border border-border-control rounded-xl min-h-12 px-4` | Change meals, go back, or edit |
| Text action | `text-primary underline underline-offset-4` | History or secondary details; maintain a target of at least 48 px |
| Input | `bg-surface border border-border-control rounded-xl min-h-12 px-3 text-base` | Always show a label; placeholders do not replace labels |
| Card | `bg-surface border border-border-subtle rounded-2xl p-4 sm:p-6` | Heading, reason, summary, then action |
| Status badge | Light background, dark text, `rounded-full px-3 py-1 text-sm` | Always include a descriptive status label |
| Error | `bg-danger-surface text-danger-text rounded-xl p-3` | Explain how to fix the issue and preserve entered data |

All interactive controls use `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`. Verify focus visibility against the actual surrounding surface. Indicate selection with a border, text, and `Check`, rather than color alone.

While saving, retain a “Saving…” label, prevent duplicate submission, and announce status with `aria-live="polite"`. Avoid unnecessarily blocking navigation back. Connect input errors using `aria-describedby` and `aria-invalid`.

## Core experiences

### Home screen

Mobile order: heading → “Use soon” group → find-meals action → three meal recommendations → link to all pantry items. Use three primary navigation destinations: “Today,” “My pantry,” and “History,” with an easy-to-find add-food button.

Use-soon entries show the name, quantity, and actual date, such as “Spinach · 100 g · Due today, 21 Nov 2026.” Group items due today and in the next 1–3 days according to EXP-01. Separate past-date entries. Do not use green to certify food safety or treat a recorded date as a guarantee of quality.

### Low-effort food entry

- Offer “Enter manually,” “Take a photo,” and “Scan barcode,” leading to the same review form under INV-04 through INV-06.
- Show name, quantity, unit, and storage location first. Use chips instead of a dropdown when there are only four storage options.
- Put use-by date and purchase price under “Add details (optional).” Show “No date set” when a date is absent.
- Remember the latest unit and storage location as editable suggestions. Do not infer quantities or dates from previous entries. Offer name autocomplete from previously saved items.
- Provide “Save” and “Save and add another.” When adding another item, clear the name and quantity while retaining the selected storage location.
- Use a numeric keyboard for quantity. Show readable unit names such as “grams” while storing `g`; allow only whole numbers for `each`. Put errors such as “Enter a quantity greater than 0” below the affected field.
- Treat AI and barcode results as suggestions that require review before saving. If camera permission fails, let users continue manually without losing their input.

Label price as “Price paid for this purchase” and include the currency, such as Thai baht. Do not require it for core functions. Do not present a previous purchase price as the current price of additional groceries.

### Three meal options

Use the same card structure so users can compare options without opening every card:

1. Meal name and “Serves 2 · 20 minutes.”
2. A one-sentence reason: “Uses 100 g of spinach due today.”
3. “You have everything” or “Buy 1 extra item · About THB 25.”
4. “View ingredients used” expands quantities and shopping details. Do not hide all additional-shopping information behind a click.
5. A “View recipe” button, followed by “Cooked it” on the recipe screen.

Show ranks 1–3 with reasons. Avoid unexplained confidence scores. Validate excluded-food constraints before displaying results. Let users edit servings and cooking time near the request button without re-entering them each time.

If AI returns fewer than three validated options, show the available options with a retry action. Do not duplicate cards to reach three. Food photos are optional and must not obstruct meal names or recommendation reasons.

### Other meal ideas

Open a sheet with two options and short explanations:

| Option | Requested information | Action |
| --- | --- | --- |
| Try other meals from the same ingredients | Reuse editable servings, cooking time, and restrictions | Find other meals |
| Buy a little extra | Maximum budget and maximum number of additional shopping items | Find meals within budget |

Define “item” clearly, for example, “One pack of eggs counts as one shopping item.” Show the quantity to buy separately from the quantity used by the recipe. Do not interchange ingredient types and purchased units under an ambiguous “piece” label.

Example: a THB 80 budget and at most two additional items. Show “About THB 65 · Buy 2 extra items,” with sort options “Fewest extra items,” “Lowest price,” and “Best preference match.” For unknown prices, show “Price not yet available” and separate those results from options whose budget eligibility can be established. Do not label them as within budget.

If no options meet the constraints, offer “Increase budget” or “Change item limit” while preserving existing values. Never automatically increase the budget or change excluded-food restrictions.

### Cooking and discard records

“Cooked it” opens an ingredient summary with editable actual quantities before “Confirm and update pantry.” Open “Discarded it” from a stock entry with its remaining quantity. Do not place it beside “Cooked it” with equal visual emphasis.

Display the entry's unit and validate compatible conversions according to REC-02. When an ingredient has several stock entries, show which batch and date will be deducted. Do not merge away date information. Prevent deductions above the available amount and recheck current inventory on confirmation.

Example: 100 g of spinach, 75 g actually used → 25 g remaining, with a 75 g usage record. If saving fails, preserve the entered quantity and offer retry. Do not show success in advance. After confirmation succeeds, show a short message: “Saved. 25 g of spinach remaining.”

## Responsive design and accessibility

- Start with mobile. At 320 px wide, users must be able to read and enter information without horizontal scrolling. Desktop may show three meal columns while preserving the same content order.
- Target at least 48 × 48 px for interactive areas, with at least 8 px between actions that could be confused. This project target exceeds the WCAG 2.2 minimum of 24 × 24 CSS px, subject to the criterion's exceptions.
- Require at least 4.5:1 contrast for normal text and 3:1 for large text. Target at least 3:1 against adjacent surfaces for essential control boundaries and state indicators. Verify rendered CSS color pairs, including hover, focus, and errors, before claiming compliance.
- Support full keyboard operation and visible focus. Move focus into an opened dialog, support Escape to close, and restore focus to its trigger.
- Use buttons, radios, or tabs with semantics appropriate to the selection behavior. Avoid click-only `div` controls.
- Support 200% zoom and test reflow at 400% on a 1280 px viewport, leaving 320 CSS px of content width without information loss. Thai vowels and tone marks must not be clipped.
- Sticky actions must not cover inputs, focus indicators, errors, or final page content. Include mobile safe-area spacing.
- Do not require swiping, dragging, or hovering for core actions. Do not navigate away merely because a form value changes.

## Tailwind CSS v4 example

This is a starting point for future implementation. No dependencies have been added and no repository version has been selected. Use `@theme inline` to map semantic tokens to Tailwind's palette.

```css
@import "tailwindcss";

@theme inline {
  --color-canvas: var(--color-stone-50);
  --color-surface: var(--color-white);
  --color-surface-muted: var(--color-stone-100);
  --color-foreground: var(--color-stone-900);
  --color-muted: var(--color-stone-600);
  --color-border-subtle: var(--color-stone-200);
  --color-border-control: var(--color-stone-500);
  --color-primary: var(--color-emerald-700);
  --color-primary-hover: var(--color-emerald-800);
  --color-primary-active: var(--color-emerald-900);
  --color-on-primary: var(--color-white);
  --color-selected: var(--color-emerald-50);
  --color-on-selected: var(--color-emerald-900);
  --color-success-surface: var(--color-emerald-50);
  --color-success-text: var(--color-emerald-800);
  --color-warning-surface: var(--color-amber-50);
  --color-warning-text: var(--color-amber-800);
  --color-danger-surface: var(--color-red-50);
  --color-danger-text: var(--color-red-800);
  --color-danger-action: var(--color-red-700);
  --color-info-surface: var(--color-sky-50);
  --color-info-text: var(--color-sky-800);
  --color-focus: var(--color-emerald-700);
  --color-disabled-surface: var(--color-stone-100);
  --color-disabled-text: var(--color-stone-600);
}

@theme {
  /* Load the Noto Sans Thai font files before use */
  --font-sans: "Noto Sans Thai", system-ui, sans-serif;
  --text-page-title: 1.75rem;
  --text-page-title--line-height: 2.5rem;
  --text-section-title: 1.25rem;
  --text-section-title--line-height: 2rem;
  --text-card-title: 1.125rem;
  --text-card-title--line-height: 1.75rem;
  --text-body: 1rem;
  --text-body--line-height: 1.75rem;
  --text-label: 1rem;
  --text-label--line-height: 1.5rem;
  --text-supporting: 0.875rem;
  --text-supporting--line-height: 1.5rem;
  --radius-control: 0.75rem;
  --radius-card: 1rem;
  --radius-dialog: 1.5rem;
}
```

The following button uses semantic tokens and Framer Motion. With the Next.js App Router, files using hooks must be Client Components:

```tsx
"use client";

import { MotionConfig, motion, useReducedMotion } from "motion/react";

const motionTokens = {
  fast: 0.12,
  standard: 0.18,
  overlay: 0.24,
  stagger: 0.04,
  distance: 8,
  easing: "easeOut",
} as const;

// Wrap animated UI with MotionConfig in the production app provider
export function MealAction({
  onFindMeals,
  pending = false,
}: {
  onFindMeals: () => void;
  pending?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      <motion.button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={onFindMeals}
        whileTap={reduceMotion || pending ? undefined : { scale: 0.98 }}
        transition={{
          duration: reduceMotion ? 0 : motionTokens.fast,
          ease: motionTokens.easing,
        }}
        className="min-h-12 rounded-control bg-primary px-4 text-label
                   font-semibold text-on-primary hover:bg-primary-hover
                   active:bg-primary-active focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-focus
                   disabled:bg-disabled-surface disabled:text-disabled-text"
      >
        {pending ? "Finding meals…" : "Find meals from my pantry"}
      </motion.button>
    </MotionConfig>
  );
}
```

Motion durations are in seconds, so 120 ms becomes `0.12`. Let Tailwind handle colors and layout while Motion handles transforms, entry, and exit. Do not let CSS transitions and Motion control the same property simultaneously, and avoid `transition-all` across the page.

## UI verification checklist

| Scenario | Expected result |
| --- | --- |
| A 320 px mobile screen shows a long Thai ingredient name. | The name wraps; quantities and buttons remain readable without horizontal scrolling. |
| The user enters `0 g` and saves. | An error appears below the field, other input is preserved, and no stock is added. |
| Today is 21 Nov 2026; items are dated 20, 21, 24, or 25 Nov 2026, or have no date. | The 20th is shown separately as past date; the 21st and 24th appear in use soon; the 25th and undated items remain in inventory. |
| The user sets a THB 80 budget and a two-item limit using the keyboard. | Every value is reachable and editable, with visible focus and accessible control names. |
| An additional-shopping result has an unknown price. | It is labeled as unknown and is not claimed to fit the THB 80 budget. |
| Only 100 g of spinach remains, but the user confirms using 125 g. | No stock is deducted; show the available amount and allow correction. |
| Saving usage of 75 g from a 100 g entry fails. | Do not show 25 g remaining; preserve input and offer retry. |
| Reduced motion is enabled and text is enlarged to 200%. | Core tasks remain usable, text is unobstructed, and understanding results does not depend on animation. |
| The user opens a selector, date picker, or discard confirmation. | The project-built component appears with consistent tokens; no native select popup, date picker, or browser confirmation is used. |
| The user completes a form with only the keyboard. | Custom controls support their expected keys, focus remains visible, errors are accessible, and focus returns correctly after overlays close. |

These are verification criteria for future UI work, not test results for an existing implementation.

## References

- [Tailwind CSS colors](https://tailwindcss.com/docs/colors): palettes and color variables.
- [Tailwind CSS theme variables](https://tailwindcss.com/docs/theme): semantic tokens and `@theme inline`.
- [Motion for React installation](https://motion.dev/docs/react-installation): the current Framer Motion package and Next.js integration.
- [Motion accessibility](https://motion.dev/docs/react-accessibility): `MotionConfig` and reduced motion.
- [useReducedMotion](https://motion.dev/docs/react-use-reduced-motion): adapting animation to user preferences.
- [Lucide icons](https://lucide.dev/icons): the project's icon library.
- [Lucide accessibility](https://github.com/lucide-icons/lucide/blob/main/docs/guide/lucide/advanced/accessibility.md): accessible names for icons and buttons.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): contrast, keyboard operation, focus, reflow, and target size.
- [WCAG contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): text contrast requirements.

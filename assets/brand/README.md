# Fridgellio Logo

The mark combines simplified Lucide Refrigerator geometry with the main Lucide Sparkles path. The refrigerator outline opens at the upper-right corner so the sparkle completes the silhouette. Secondary sparkles are removed to keep the mark clear at small sizes.

## Assets

| File | Purpose |
| --- | --- |
| [Green mark](fridgellio-mark.svg) | Primary logo; transparent background, Emerald 700 (`#047857` sRGB fallback) |
| [Monochrome mark](fridgellio-mark-mono.svg) | Uses `currentColor` when embedded inline; standalone images default to black |
| [Inverse mark](fridgellio-mark-inverse.svg) | White logo for dark backgrounds |
| [Logo presentation](fridgellio-logo-preview.svg) | Composition preview, background treatments, and 24 / 32 / 48 px size samples |

The presentation includes a typeset wordmark and an illustrative tagline. Its system font can vary between devices; it is a composition reference, not an outlined wordmark asset. Use the standalone mark SVGs for production.

## Usage

- Use the primary mark on white or light Stone surfaces. Use the inverse mark on dark surfaces with adequate contrast.
- Prefer at least 32 × 32 px; 24 × 24 px is the minimum intended size. Check optical clarity in the target interface before release.
- Leave clear space of at least 6 viewBox units, or one-sixth of the rendered SVG width, around the asset.
- Preserve the 36 × 36 viewBox, proportions, rounded strokes, and transparent background. Do not add extra sparkles, gradients, shadows, or animation to the logo itself.
- In a labeled navigation link, hide a redundant mark from assistive technology and provide the link's accessible name. If the image is the only label, use `alt="Fridgellio home"` on the image inside the home link.
- SVG titles and descriptions support standalone viewing. For inline reuse, ensure title and description IDs are unique per instance.

## Attribution

Adapted from [Lucide Refrigerator](https://github.com/lucide-icons/lucide/blob/main/icons/refrigerator.svg) and [Lucide Sparkles](https://github.com/lucide-icons/lucide/blob/main/icons/sparkles.svg). The refrigerator proportions, outline, and handle placement were modified; only the main sparkle path is retained and scaled. Keep the accompanying [Lucide license](LUCIDE-LICENSE.txt) with redistributed assets.

See the [design tokens](../../docs/design-tokens.md) for the product palette and UI icon rules.

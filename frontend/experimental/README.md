# Fridgellio 3D Illustrations

Three original procedural Three.js models for the landing page, dashboard, and inventory. They use rounded geometry, matte materials, soft lighting, and Emerald / cream colors. No external textures, model downloads, or component libraries are used. Preview link arrows use Lucide ArrowUpRight paths under the accompanying [Lucide license](../../assets/brand/LUCIDE-LICENSE.txt).

The Next.js app uses these illustration assets on its public entry screens and in inventory. This directory also contains the standalone design preview. The preview contains editorial copy rather than live pantry data.

The surrounding UI uses the installed Motion package (Framer Motion) for staggered text entrances, one-time viewport reveals, link-arrow hover, and a small press scale. The standalone HTML preview loads Motion's local browser bundle; the React application can use `motion/react` from the same package.

## Models

| Asset | Composition | Intended use |
| --- | --- | --- |
| [Landing GLB](models/fridgellio-landing.glb) | Mint refrigerator, grocery bag, leafy vegetables, tomatoes, carrots, and a bowl on a wooden board | Main landing-page illustration; optional subtle motion |
| [Dashboard GLB](models/fridgellio-dashboard.glb) | Prepared vegetable bowl, board, eggs, tomato, and carrot | Compact dashboard welcome or empty-state illustration; static by default |
| [Groceries GLB](models/fridgellio-groceries.glb) | Open paper bag with handles, leafy greens, carrots, tomatoes, and bread | Plain Inventory heading; one small hover or tap hop |

The source of truth is [scenes.js](scenes.js). GLB files contain geometry, materials, and named door/ingredient groups, not the preview camera, lighting, animation, or HTML. Use them in another Three.js scene or a glTF-compatible editor. The supplied renderer builds models directly from source so it needs no GLB network request.

## Hover interactions

- Hover or tap the Inventory grocery bag for one finite hop of up to 0.085 model units. The whole bag and its contents move together, return to their original pose, and stop rendering when settled. Reduced motion leaves the bag still. See the [rendered bag preview](previews/groceries.png) and the application's [WebP fallback](../public/illustrations/groceries.webp).
- Hover over the refrigerator to open both doors around their right-hand hinges. The hollow cabinet reveals stocked shelves with greens, carrots, tomatoes, containers, and eggs. Food makes one small hop after the doors start opening. Leaving closes the doors smoothly, including when opening is interrupted.
- Hover over the dashboard board or its food to give only the bowl's ingredients a short, staggered hop. The bowl, board, and loose ingredients stay still. The hop settles even if the pointer remains over the model; re-entering plays it again.
- Picking uses Three.js raycasting against model geometry. Empty canvas space does not trigger an interaction. The original cabinet area remains active as moving doors reveal gaps, avoiding hover flicker.
- Touch users can tap the fridge to toggle it or tap the dashboard model to trigger the hop. Drags longer than 8 px remain scrolling; no pointer events are cancelled. Tapping outside clears the interaction.
- Reduced motion reveals or hides the fridge contents immediately without spring movement or ingredient hops. These are decorative effects; no inventory details or core actions are available only through hover.
- Door and food motion is implemented by [hover-animation.js](hover-animation.js). The landing idle turn pauses while interacting, and rendering stops once the interaction settles. Framer Motion remains responsible for surrounding HTML transitions.

## Local preview

Requirements: Node.js 22 or newer, npm, Python 3, and a browser with WebGL 2 support.

From the repository root:

```bash
npm ci --prefix frontend/experimental
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/frontend/experimental/`. Dependencies are served locally: Three.js uses an import map and Motion uses its browser bundle. The preview does not depend on a CDN. Stop the server with Ctrl+C. Do not open the HTML directly with `file://`.

Regenerate and verify model exports after changing geometry:

```bash
npm --prefix frontend/experimental run generate
npm --prefix frontend/experimental run check
node --check frontend/experimental/scenes.js
node --check frontend/experimental/illustration.js
```

The model check loads all three GLB exports back with `GLTFLoader`, compares their bounds to the source, checks vertex coordinates, and enforces a 2 MB limit per model. The hover check verifies opening and interrupted closing, small finite hops, return to rest, and reduced-motion behavior. These checks do not replace visual or browser lifecycle checks.

## Integration

Import [illustration.js](illustration.js) in browser code and mount into an element with an explicit height:

```js
import { mountIllustration } from './illustration.js';

const illustration = mountIllustration(host, {
  variant: 'landing', // or 'dashboard' / 'groceries'
  animate: true, // dashboard defaults to false when this option is omitted
});

// On route change or component unmount:
illustration.dispose();
```

The [React wrapper](../components/illustration.tsx) loads the renderer when its host enters the viewport and disposes it on unmount. The frontend depends on the same Three.js version as the preview.

The preview uses custom HTML/CSS composition and custom link styling. It does not introduce a UI component library or browser-native widget interfaces. The preview font is a system sans-serif; use the product's Noto Sans Thai stack when integrating into the application.

## Rendering and accessibility

- Decorative canvases are hidden from assistive technology. Their hosts listen for hover and tap without capturing pointers or blocking scrolling. Keep headings, explanations, and actions in HTML; no task or pantry status depends on the illustration.
- Supply a static fallback inside the host. The preview uses the [brand mark](../../assets/brand/fridgellio-mark.svg), which stays visible if loading or WebGL initialization fails or the context is lost. A restored context replaces the fallback again.
- Landing idle motion is a gentle turn of at most 0.025 radians in either direction. Dashboard stays static until a hover or tap triggers its finite hop. Both honor changes to `prefers-reduced-motion` immediately.
- Animation pauses offscreen and while the document is hidden. Reduced motion uses a static frame, not a continuous render loop.
- Device pixel ratio is capped at 1.5. Landing shadow maps are 1024 px and dashboard shadow maps are 512 px. No postprocessing or image textures are required.
- `dispose()` cancels animation, removes observers and listeners, releases geometries and materials once each, disposes the renderer, and releases the WebGL context.
- Three.js owns the canvas render loop. [UI Motion](ui-motion.js) uses Framer Motion's installed Motion package for surrounding HTML transitions; it does not control the same 3D transforms.
- UI entrances use 180 ms, 8 px travel, and 40 ms stagger. Hover arrows and press scale use 120 ms. Press scale is 0.98; hover does not enlarge buttons. Content remains visible if Motion fails to load. Reduced motion omits entrances and gestures, including when the preference changes mid-animation. Disposing UI Motion removes its observers and gestures, stops playback, and restores original inline styles.
- The preview exports its mounted instances as `window.fridgellioIllustrations` for manual lifecycle inspection. This debug hook belongs only to the standalone preview.
- The preview also exposes `window.fridgellioUIMotion` for UI cleanup inspection. UI Motion loads independently of the WebGL scenes.

## Visual review

Check desktop and 320 px mobile layouts, rendered model proportions, reduced motion, no horizontal overflow, context-loss fallback, and repeated mount/dispose. Dashboard decoration should stay smaller than the main content and must not push primary tasks below the fold when integrated.

Captured previews: [landing](previews/landing.png), [open refrigerator](previews/landing-hover.png), [dashboard](previews/dashboard.png), [vegetable hop](previews/dashboard-hover.png), and [320 px mobile](previews/mobile.png).

Verified in headless Chromium with software WebGL rendering: both scenes render without page errors; layouts have no horizontal overflow at 320, 768, and 1440 px; raycast hover opens the fridge and triggers finite ingredient hops; empty canvas space does not activate the effects; moving across the original cabinet does not flicker; pointer exit and rapid re-entry reverse the door smoothly; reduced motion settles an in-progress interaction immediately; touch taps toggle the fridge and repeat the bowl hop; a touch drag does not toggle the door or cancel the gesture; settled interactions stop rendering; landing pauses offscreen; context loss shows the fallback and restoration resumes rendering; repeated disposal removes the canvases without errors. Verify performance on target physical devices before release.

## References

- [Motion quick start](https://motion.dev/docs/quick-start): the browser bundle and JavaScript animation API from the current Framer Motion package.
- [Motion inView](https://motion.dev/docs/inview): one-time viewport entrance effects.
- [Three.js installation](https://threejs.org/manual/pages/installation.html): package imports and local development.
- [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer): renderer configuration and resource lifecycle.
- [Fridgellio design tokens](../../docs/design-tokens.md): palette, typography, accessibility, and motion policy.

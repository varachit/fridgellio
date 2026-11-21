// The local browser bundle lets this standalone preview use Framer Motion's
// current Motion package without adding a React app or a bundler.
import './node_modules/motion/dist/motion.js';

const { animate, inView, hover, press } = globalThis.Motion;
const tokens = Object.freeze({ fast: 0.12, standard: 0.18, stagger: 0.04, distance: 8 });

export function mountUIMotion(root = document) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const controls = new Map();
  const originals = new Map();
  const cleanups = [];
  let disposed = false;
  let preferenceFrame = 0;

  function watchPreference() {
    preferenceFrame = 0;
    if (disposed) return;
    if (preference.matches) settle();
    else if (controls.size) preferenceFrame = requestAnimationFrame(watchPreference);
  }

  function remember(element) {
    if (!originals.has(element)) originals.set(element, {
      opacity: element.style.opacity,
      transform: element.style.transform,
      transformOrigin: element.style.transformOrigin,
    });
  }
  function restore(element, styles) {
    Object.assign(element.style, styles);
  }
  function play(element, keyframes, options = {}) {
    if (disposed || preference.matches || document.hidden) return;
    remember(element);
    controls.get(element)?.stop();
    const animation = animate(element, keyframes, {
      duration: tokens.standard, ease: 'easeOut', ...options,
    });
    controls.set(element, animation);
    if (!preferenceFrame) preferenceFrame = requestAnimationFrame(watchPreference);
    animation.then(() => {
      if (controls.get(element) === animation) controls.delete(element);
    });
  }
  function settle() {
    cancelAnimationFrame(preferenceFrame);
    preferenceFrame = 0;
    for (const control of controls.values()) control.stop();
    controls.clear();
    for (const [element, styles] of originals) restore(element, styles);
  }

  // Only animate on entry, never hide content in CSS while waiting for JS.
  // Controls are kept in a separate wrapper from press/hover transforms.
  const heroElements = [...root.querySelectorAll('.hero-copy [data-motion-reveal]')];
  heroElements.forEach((element, index) => {
    cleanups.push(inView(element, () => {
      play(element, {
        opacity: [0, 1],
        transform: [`translateY(${tokens.distance}px)`, 'translateY(0px)'],
      }, { delay: index * tokens.stagger });
    }, { amount: 0.15 }));
  });
  for (const element of root.querySelectorAll('.hero-art, .section-heading, .dashboard-card')) {
    cleanups.push(inView(element, () => {
      play(element, {
        opacity: [0, 1],
        transform: [`translateY(${tokens.distance}px)`, 'translateY(0px)'],
      });
    }, { amount: 0.15 }));
  }

  const actions = [...root.querySelectorAll('.primary-action, .text-link')];
  cleanups.push(hover(actions, element => {
    const icon = element.querySelector('svg');
    if (icon) play(icon, { transform: 'translate(2px, -2px)' }, { duration: tokens.fast });
    return () => {
      if (icon) play(icon, { transform: 'translate(0px, 0px)' }, { duration: tokens.fast });
    };
  }));
  cleanups.push(press(actions, element => {
    play(element, { transform: 'scale(0.98)' }, { duration: tokens.fast });
    return () => play(element, { transform: 'scale(1)' }, { duration: tokens.fast });
  }));

  function onPreferenceChange() {
    if (preference.matches) settle();
  }
  function onVisibilityChange() {
    if (document.hidden) settle();
  }
  // Also cover a preference flip between scheduling and starting an animation.
  function onAnimationStart() {
    if (preference.matches) settle();
  }
  preference.addEventListener('change', onPreferenceChange);
  document.addEventListener('visibilitychange', onVisibilityChange);
  root.addEventListener('pointerdown', onAnimationStart, { capture: true });
  root.addEventListener('pointerover', onAnimationStart, { capture: true });
  document.documentElement.dataset.uiMotion = 'ready';

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups) cleanup();
      settle();
      preference.removeEventListener('change', onPreferenceChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      root.removeEventListener('pointerdown', onAnimationStart, { capture: true });
      root.removeEventListener('pointerover', onAnimationStart, { capture: true });
      delete document.documentElement.dataset.uiMotion;
    },
  };
}

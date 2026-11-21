const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// A single soft hop followed by a much smaller settling hop. No looping.
function hop(time) {
  if (time < 0 || time >= 0.66) return 0;
  if (time < 0.42) return Math.sin(Math.PI * time / 0.42);
  return 0.18 * Math.sin(Math.PI * (time - 0.42) / 0.24);
}

/** Frame-rate-independent door spring and finite ingredient hops. No DOM. */
export function createHoverAnimation(model) {
  const upper = model.getObjectByName('fridge-door-upper');
  const lower = model.getObjectByName('fridge-door-lower');
  const fridgeFood = model.getObjectByName('fridge-food');
  const bowlFood = model.getObjectByName('bowl-food');
  const bag = model.getObjectByName('grocery-bag');
  const bagY = bag?.position.y ?? 0;
  const bagScale = bag?.scale.clone();
  const ingredients = (bowlFood?.children ?? []).map(object => ({
    object, y: object.position.y, scale: object.scale.clone(),
  }));
  let target = null;
  let progress = 0;
  let velocity = 0;
  let fridgeTime = Infinity;
  let bowlTime = Infinity;
  let bagTime = Infinity;

  function apply() {
    if (upper) upper.rotation.y = progress * 2.15;
    if (lower) lower.rotation.y = progress * 2.25;
    if (fridgeFood) fridgeFood.position.y = hop(fridgeTime) * 0.055;
    if (bag) {
      const lift = hop(bagTime);
      bag.position.y = bagY + lift * 0.085;
      bag.scale.set(bagScale.x * (1 - lift * 0.015), bagScale.y * (1 + lift * 0.025), bagScale.z * (1 - lift * 0.015));
    }
    ingredients.forEach(({ object, y, scale }, index) => {
      const lift = hop(bowlTime - index * 0.045);
      object.position.y = y + lift * (index === 0 ? 0.11 : 0.085);
      object.scale.set(scale.x * (1 - lift * 0.025), scale.y * (1 + lift * 0.045), scale.z * (1 - lift * 0.025));
    });
  }
  function snap() {
    progress = target === 'fridge' ? 1 : 0;
    velocity = 0;
    fridgeTime = Infinity;
    bowlTime = Infinity;
    bagTime = Infinity;
    apply();
  }
  return {
    setTarget(next, reducedMotion = false) {
      if (next === target) {
        if (reducedMotion) snap();
        return;
      }
      target = next;
      if (reducedMotion) snap();
      else {
        if (next === 'fridge') fridgeTime = -0.18;
        if (next === 'bowl') bowlTime = 0;
        if (next === 'bag') bagTime = 0;
      }
    },
    step(delta) {
      const dt = clamp(delta, 0, 0.05);
      const goal = target === 'fridge' ? 1 : 0;
      // Small integration steps keep the spring stable even on slower devices.
      let remaining = dt;
      while (remaining > 0) {
        const step = Math.min(remaining, 1 / 120);
        velocity += ((goal - progress) * 105 - velocity * 19) * step;
        progress = clamp(progress + velocity * step, 0, 1.015);
        remaining -= step;
      }
      if (Math.abs(progress - goal) < 0.0001 && Math.abs(velocity) < 0.0005) {
        progress = goal;
        velocity = 0;
      }
      fridgeTime += dt;
      bowlTime += dt;
      bagTime += dt;
      apply();
    },
    get active() {
      const goal = target === 'fridge' ? 1 : 0;
      return progress !== goal || velocity !== 0 || fridgeTime < 0.66 || bowlTime < 0.66 + ingredients.length * 0.045 || bagTime < 0.66;
    },
    reset() {
      target = null;
      snap();
    },
    snap,
  };
}

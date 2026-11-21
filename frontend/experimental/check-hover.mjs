import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createIllustrationModel, disposeModel } from './scenes.js';
import { createHoverAnimation } from './hover-animation.js';

function advance(animation, seconds, hz = 60) {
  for (let i = 0; i < Math.ceil(seconds * hz); i++) animation.step(1 / hz);
}
const landing = createIllustrationModel('landing');
const animation = createHoverAnimation(landing);
const lower = landing.getObjectByName('fridge-door-lower');
const upper = landing.getObjectByName('fridge-door-upper');
const fridgeFood = landing.getObjectByName('fridge-food');
assert.ok(lower && upper && fridgeFood, 'Fridge rig exists');
assert.equal(lower.rotation.y, 0, 'Doors start closed');
animation.setTarget('fridge');
advance(animation, 0.35);
assert.ok(lower.rotation.y > 0.5 && lower.rotation.y < 2.3, 'Door opens progressively around its hinge');
assert.ok(fridgeFood.position.y > 0 && fridgeFood.position.y <= 0.055, 'Food hops after door starts opening');
animation.setTarget(null);
const interrupted = lower.rotation.y;
advance(animation, 0.05);
assert.ok(lower.rotation.y < interrupted, 'Leaving reverses the opening smoothly');
advance(animation, 2, 30);
assert.equal(lower.rotation.y, 0, 'Door returns fully closed at 30 fps');
assert.equal(fridgeFood.position.y, 0, 'Food returns to its shelf');
assert.equal(animation.active, false, 'Finite interaction settles');
animation.setTarget('fridge', true);
assert.equal(lower.rotation.y, 2.25, 'Reduced motion reveals food immediately');
assert.equal(upper.rotation.y, 2.15);
assert.equal(animation.active, false, 'Reduced motion does not schedule a hop');
animation.reset();
assert.equal(lower.rotation.y, 0);

// Regression: check the entire carrot, including its leaves, against the
// cabinet walls, back, closed-door lining, and neighboring shelves.
const fridge = landing.getObjectByName('refrigerator');
const carrot = landing.getObjectByName('fridge-carrot');
const cavity = new THREE.Box3(new THREE.Vector3(-0.68, 0.4175, -0.4625), new THREE.Vector3(0.68, 1.1025, 0.5825));
for (const target of ['fridge', null]) {
  animation.setTarget(target);
  for (let frame = 0; frame < 240; frame++) {
    animation.step(1 / 120);
    landing.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(carrot)
      .applyMatrix4(fridge.matrixWorld.clone().invert());
    assert.ok(cavity.containsBox(bounds), 'Carrot and leaves stay inside the cabinet throughout opening, hopping, and closing');
  }
}

const dashboard = createIllustrationModel('dashboard');
const bowl = dashboard.getObjectByName('vegetable-bowl');
const ingredients = dashboard.getObjectByName('bowl-food').children;
const originals = ingredients.map(object => ({ y: object.position.y, scale: object.scale.clone() }));
const bowlY = bowl.position.y;
const dashboardAnimation = createHoverAnimation(dashboard);
dashboardAnimation.setTarget('bowl');
advance(dashboardAnimation, 0.2);
assert.ok(ingredients[0].position.y > originals[0].y, 'Vegetables rise');
assert.ok(ingredients[0].position.y - originals[0].y <= 0.11, 'Hop stays small');
assert.equal(bowl.position.y, bowlY, 'Bowl and board stay still');
advance(dashboardAnimation, 1.2);
ingredients.forEach((object, index) => {
  assert.equal(object.position.y, originals[index].y, 'Ingredient returns to its original position');
  assert.ok(object.scale.equals(originals[index].scale), 'Ingredient returns to its original scale');
});
assert.equal(dashboardAnimation.active, false, 'No looping bounce while hovered');
dashboardAnimation.setTarget(null);
dashboardAnimation.setTarget('bowl');
advance(dashboardAnimation, 0.2);
assert.ok(ingredients[0].position.y > originals[0].y, 'Re-entry triggers a new hop');
dashboardAnimation.snap();
assert.equal(dashboardAnimation.active, false, 'Preference changes cancel remaining motion');
const groceries = createIllustrationModel('groceries');
const bag = groceries.getObjectByName('grocery-bag');
const bagPosition = bag.position.clone();
const bagScale = bag.scale.clone();
const bagAnimation = createHoverAnimation(groceries);
bagAnimation.setTarget('bag');
advance(bagAnimation, 0.2);
assert.ok(bag.position.y > bagPosition.y && bag.position.y - bagPosition.y <= 0.085, 'Bag makes a small hop');
advance(bagAnimation, 1);
assert.ok(bag.position.equals(bagPosition) && bag.scale.equals(bagScale), 'Bag returns to its exact rest pose');
assert.equal(bagAnimation.active, false, 'Bag does not bounce continuously while hovered');
bagAnimation.setTarget(null);
bagAnimation.setTarget('bag', true);
assert.ok(bag.position.equals(bagPosition), 'Reduced motion leaves the bag still');
assert.equal(bagAnimation.active, false);
disposeModel(groceries);
disposeModel(landing);
disposeModel(dashboard);
console.log('Hover: progressive doors, interrupted close, gentle hops, finite settling, and reduced motion OK');

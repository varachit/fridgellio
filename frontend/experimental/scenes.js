import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Tailwind palette sRGB fallbacks; all geometry is authored for Fridgellio.
export const palette = Object.freeze({
  emerald: '#047857', sage: '#a7d8bd', mint: '#d1fae5', cream: '#fffdf5',
  stone: '#e7e5e4', dark: '#292524', wood: '#d6b68d', tomato: '#e78268',
  carrot: '#efb36b', leaf: '#4f936a', egg: '#f4ead7', plate: '#f5f5f4',
});

function toolkit() {
  const materials = new Map();
  const boxes = new Map();
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  const leafGeometry = new THREE.SphereGeometry(1, 16, 10);
  function material(color, roughness = 0.78) {
    const key = `${color}:${roughness}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
    return materials.get(key);
  }
  function mesh(parent, geometry, color, position = [0, 0, 0], scale = [1, 1, 1]) {
    const object = new THREE.Mesh(geometry, material(color));
    object.position.set(...position);
    object.scale.set(...scale);
    parent.add(object);
    return object;
  }
  function box(parent, size, position, color, radius = 0.08) {
    const key = `${size.join(',')}:${radius}`;
    if (!boxes.has(key)) boxes.set(key, new RoundedBoxGeometry(...size, 3, radius));
    return mesh(parent, boxes.get(key), color, position);
  }
  function ball(parent, position, scale, color) {
    return mesh(parent, sphere, color, position, scale);
  }
  function cylinder(parent, top, bottom, height, position, color) {
    return mesh(parent, new THREE.CylinderGeometry(top, bottom, height, 40), color, position);
  }
  function leaf(parent, position, scale = [0.13, 0.3, 0.045], angle = 0) {
    const object = mesh(parent, leafGeometry, palette.leaf, position, scale);
    object.rotation.z = angle;
    return object;
  }
  function tomato(parent, position, size = 0.22) {
    const group = new THREE.Group();
    group.position.set(...position);
    parent.add(group);
    ball(group, [0, 0, 0], [size, size * 0.85, size], palette.tomato);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      const stem = leaf(group, [Math.sin(angle) * size * 0.2, size * 0.83, Math.cos(angle) * size * 0.2], [size * 0.14, size * 0.46, size * 0.08]);
      stem.rotation.set(Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9);
    }
    return group;
  }
  function carrot(parent, position, rotation = [0, 0, 0]) {
    const group = new THREE.Group();
    group.position.set(...position);
    group.rotation.set(...rotation);
    parent.add(group);
    cylinder(group, 0.01, 0.11, 0.65, [0, 0, 0], palette.carrot);
    for (let i = -1; i <= 1; i++) leaf(group, [i * 0.06, -0.45, 0], [0.05, 0.18, 0.025], i * 0.4);
    return group;
  }
  function greens(parent, position) {
    const group = new THREE.Group();
    group.position.set(...position);
    parent.add(group);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      leaf(group, [Math.sin(angle) * 0.16, 0.23 + (i % 2) * 0.07, Math.cos(angle) * 0.15], [0.13, 0.32, 0.07], -Math.sin(angle) * 0.65);
    }
    return group;
  }
  return { box, ball, cylinder, leaf, tomato, carrot, greens };
}

function refrigerator(parent, t) {
  const fridge = new THREE.Group();
  fridge.name = 'refrigerator';
  fridge.userData.interaction = 'fridge';
  fridge.position.set(-0.7, 0, -0.25);
  parent.add(fridge);
  // A genuinely hollow cabinet, so opening a door reveals shelves rather
  // than the face of a solid box. Front is +Z; both hinges are on the right.
  t.box(fridge, [1.64, 2.88, 0.16], [0, 1.64, -0.6], palette.sage, 0.07);
  for (const x of [-0.75, 0.75]) {
    t.box(fridge, [0.14, 2.88, 1.22], [x, 1.64, 0.01], palette.sage, 0.06);
  }
  for (const y of [0.27, 3.01]) {
    t.box(fridge, [1.5, 0.14, 1.22], [0, y, 0.01], palette.sage, 0.06);
  }
  t.box(fridge, [1.34, 2.57, 0.055], [0, 1.64, -0.49], palette.cream, 0.025);
  t.box(fridge, [1.37, 0.08, 1.14], [0, 2.14, 0.03], palette.cream, 0.03);
  for (const y of [0.39, 1.13, 1.77, 2.29]) {
    t.box(fridge, [1.35, 0.055, 1.08], [0, y, 0.03], palette.cream, 0.025);
    t.box(fridge, [1.34, 0.045, 0.045], [0, y, 0.57], palette.mint, 0.015);
  }
  for (const [name, height, y, color, handleHeight, handleY] of [
    ['fridge-door-upper', 0.77, 2.57, palette.cream, 0.32, 2.51],
    ['fridge-door-lower', 1.78, 1.24, palette.mint, 0.5, 1.75],
  ]) {
    const hinge = new THREE.Group();
    hinge.name = name;
    hinge.position.set(0.735, 0, 0.7);
    fridge.add(hinge);
    t.box(hinge, [1.47, height, 0.13], [-0.735, y, 0], color, 0.065);
    t.box(hinge, [1.28, height - 0.15, 0.055], [-0.735, y, -0.09], palette.cream, 0.025);
    t.box(hinge, [0.075, handleHeight, 0.08], [-1.245, handleY, 0.11], palette.emerald, 0.03);
  }
  const food = new THREE.Group();
  food.name = 'fridge-food';
  fridge.add(food);
  t.greens(food, [-0.34, 0.43, 0.14]);
  // Include the leafy end in the fit: the full carrot must clear both walls.
  const fridgeCarrot = t.carrot(food, [0.14, 0.57, 0.12], [0, 0, Math.PI / 2]);
  fridgeCarrot.name = 'fridge-carrot';
  fridgeCarrot.scale.setScalar(0.72);
  t.tomato(food, [-0.32, 1.35, 0.2], 0.18);
  t.tomato(food, [0.13, 1.33, 0.24], 0.16);
  t.tomato(food, [0.4, 1.32, -0.12], 0.14);
  for (const x of [-0.35, 0.22]) {
    t.box(food, [0.27, 0.2, 0.3], [x, 1.91, 0.1], palette.mint, 0.035);
    t.box(food, [0.29, 0.03, 0.32], [x, 2.025, 0.1], palette.emerald, 0.015);
  }
  for (const x of [-0.34, 0, 0.34]) {
    t.ball(food, [x, 2.47, 0.14], [0.115, 0.15, 0.115], palette.egg);
  }
  for (const x of [-0.55, 0.55]) for (const z of [-0.43, 0.43]) {
    t.cylinder(fridge, 0.075, 0.09, 0.19, [x, 0.16, z], palette.dark);
  }
  return fridge;
}

function board(parent, t, position, size = [1.35, 0.1, 0.95]) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  t.box(group, size, [0, 0, 0], palette.wood, 0.09);
  t.box(group, [0.32, 0.09, 0.28], [size[0] / 2 + 0.09, 0, 0], palette.wood, 0.08);
  return group;
}

function bowl(parent, t, position, scale = 1) {
  const group = new THREE.Group();
  group.name = 'vegetable-bowl';
  group.userData.interaction = 'bowl';
  group.position.set(...position);
  group.scale.setScalar(scale);
  parent.add(group);
  // Open lathed vessel rather than a closed cylinder.
  const profile = [[0.26, 0], [0.34, 0.04], [0.47, 0.16], [0.57, 0.36], [0.58, 0.4], [0.54, 0.4], [0.52, 0.35], [0.42, 0.17], [0.31, 0.08], [0.26, 0.07]];
  const geometry = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 48);
  const material = new THREE.MeshStandardMaterial({ color: palette.cream, roughness: 0.65, side: THREE.DoubleSide });
  group.add(new THREE.Mesh(geometry, material));
  t.cylinder(group, 0.29, 0.26, 0.07, [0, 0.035, 0], palette.cream);
  const food = new THREE.Group();
  food.name = 'bowl-food';
  group.add(food);
  t.greens(food, [-0.13, 0.25, -0.05]);
  t.tomato(food, [0.14, 0.39, 0.12], 0.17);
  t.tomato(food, [-0.16, 0.37, 0.16], 0.13);
  return group;
}

function groceryBag(parent, t) {
  const bag = new THREE.Group();
  bag.name = 'grocery-bag';
  bag.userData.interaction = 'bag';
  parent.add(bag);
  // Four paper walls leave a real opening for the groceries and handles.
  for (const z of [-0.38, 0.38]) t.box(bag, [1.15, 1.2, 0.055], [0, 0.66, z], palette.wood, 0.025);
  for (const x of [-0.55, 0.55]) t.box(bag, [0.055, 1.2, 0.76], [x, 0.66, 0], palette.wood, 0.025);
  t.box(bag, [1.1, 0.08, 0.73], [0, 0.08, 0], palette.wood, 0.025);
  // Folded top edges keep the silhouette soft without adding surface clutter.
  for (const z of [-0.38, 0.38]) t.box(bag, [1.16, 0.045, 0.075], [0, 1.26, z], palette.wood, 0.015);
  for (const z of [-0.29, 0.29]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.3, 1.2, z), new THREE.Vector3(-0.26, 1.7, z),
      new THREE.Vector3(0.26, 1.7, z), new THREE.Vector3(0.3, 1.2, z),
    ]);
    bag.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.028, 8, false), new THREE.MeshStandardMaterial({ color: palette.wood, roughness: 0.95 })));
  }
  const food = new THREE.Group();
  food.name = 'grocery-bag-food';
  bag.add(food);
  t.greens(food, [-0.24, 1.03, -0.04]);
  t.carrot(food, [0.29, 1.38, -0.04], [0.08, 0, 2.94]);
  t.tomato(food, [0.15, 1.3, 0.22], 0.22);
  t.tomato(food, [-0.25, 1.23, 0.23], 0.15);
  const bread = new THREE.Group();
  bread.position.set(-0.06, 1.55, -0.17);
  bread.rotation.z = 0.16;
  food.add(bread);
  t.ball(bread, [0, 0, 0], [0.17, 0.55, 0.15], palette.egg);
  for (const y of [0.05, 0.24, 0.4]) {
    const score = t.box(bread, [0.18, 0.027, 0.025], [0, y, 0.13 - y * 0.1], palette.wood, 0.012);
    score.rotation.z = -0.32;
  }
  return bag;
}

/** Returns an unlit, exportable Group. No DOM, network, or GPU is required. */
export function createIllustrationModel(variant = 'landing') {
  if (!['landing', 'dashboard', 'groceries'].includes(variant)) throw new TypeError('Unknown illustration variant');
  const root = new THREE.Group();
  root.name = `Fridgellio ${variant} illustration`;
  root.userData = { variant, units: 'meters', author: 'Fridgellio', decorative: true };
  const t = toolkit();
  if (variant === 'landing') {
    t.cylinder(root, 2.38, 2.28, 0.13, [0, 0, 0], palette.mint);
    refrigerator(root, t);
    const cuttingBoard = board(root, t, [1.15, 0.14, 0.65]);
    cuttingBoard.rotation.y = -0.22;
    t.tomato(cuttingBoard, [-0.26, 0.24, 0.1], 0.21);
    t.carrot(cuttingBoard, [0.27, 0.17, -0.05], [0.1, 0.25, Math.PI / 2]);
    bowl(root, t, [1.0, 0.07, -0.8], 0.82);
    const bag = new THREE.Group();
    bag.position.set(-1.45, 0.07, 1.0);
    bag.rotation.y = -0.16;
    root.add(bag);
    t.box(bag, [0.7, 0.74, 0.5], [0, 0.38, 0], palette.wood, 0.06);
    // Two rounded handles built from curves, not additional icon artwork.
    for (const z of [-0.16, 0.16]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.17, 0.71, z), new THREE.Vector3(-0.15, 1.0, z), new THREE.Vector3(0.15, 1.0, z), new THREE.Vector3(0.17, 0.71, z)]);
      const handle = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.025, 8, false), new THREE.MeshStandardMaterial({ color: palette.wood, roughness: 0.8 }));
      bag.add(handle);
    }
    t.greens(bag, [-0.12, 0.66, 0]);
    t.carrot(bag, [0.15, 0.85, 0.05], [0, 0, 2.9]);
  } else if (variant === 'groceries') {
    t.cylinder(root, 0.98, 0.94, 0.07, [0, -0.015, 0], palette.mint);
    groceryBag(root, t);
  } else {
    root.userData.interaction = 'bowl';
    t.cylinder(root, 1.45, 1.38, 0.1, [0, 0, 0], palette.mint);
    const cuttingBoard = board(root, t, [0.05, 0.11, 0.22], [1.85, 0.11, 1.18]);
    cuttingBoard.rotation.y = -0.18;
    bowl(cuttingBoard, t, [-0.25, 0.06, -0.08], 1.05);
    t.tomato(cuttingBoard, [0.55, 0.24, 0.24], 0.19);
    t.carrot(cuttingBoard, [0.55, 0.19, -0.22], [0, -0.25, Math.PI / 2]);
    t.ball(root, [-0.85, 0.22, 0.6], [0.14, 0.19, 0.14], palette.egg);
    t.ball(root, [-0.58, 0.21, 0.85], [0.13, 0.18, 0.13], palette.egg);
  }
  root.updateMatrixWorld(true);
  return root;
}

export function disposeModel(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

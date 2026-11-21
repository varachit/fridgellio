import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createIllustrationModel, disposeModel } from './scenes.js';

for (const variant of ['landing', 'dashboard', 'groceries']) {
  const source = createIllustrationModel(variant);
  const file = await readFile(new URL(`./models/fridgellio-${variant}.glb`, import.meta.url));
  assert.equal(file.readUInt32LE(0), 0x46546c67, 'GLB header');
  assert.equal(file.readUInt32LE(4), 2, 'glTF version');
  assert.equal(file.readUInt32LE(8), file.byteLength, 'GLB declared length');
  const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const loaded = await new GLTFLoader().parseAsync(data, '');
  const rigNames = variant === 'landing'
    ? ['refrigerator', 'fridge-door-upper', 'fridge-door-lower', 'fridge-food', 'fridge-carrot', 'bowl-food']
    : variant === 'groceries' ? ['grocery-bag', 'grocery-bag-food'] : ['vegetable-bowl', 'bowl-food'];
  for (const name of rigNames) assert.ok(loaded.scene.getObjectByName(name), `Export preserves interaction group: ${name}`);
  const expected = new THREE.Box3().setFromObject(source);
  const actual = new THREE.Box3().setFromObject(loaded.scene);
  assert.ok(expected.min.distanceTo(actual.min) < 1e-5, 'Round-trip minimum bounds');
  assert.ok(expected.max.distanceTo(actual.max) < 1e-5, 'Round-trip maximum bounds');
  let meshes = 0;
  loaded.scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++;
    const position = object.geometry.getAttribute('position');
    for (const value of position.array) assert.ok(Number.isFinite(value), 'Finite vertex coordinates');
  });
  assert.ok(meshes > 0, 'Model contains meshes');
  assert.ok(file.byteLength < 2_000_000, 'Model stays below 2 MB');
  console.log(`${variant}: ${meshes} meshes, valid GLB, finite vertices, round-trip bounds OK`);
  disposeModel(source);
  disposeModel(loaded.scene);
}
assert.throws(() => createIllustrationModel('unknown'), TypeError);

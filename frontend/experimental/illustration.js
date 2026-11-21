import * as THREE from 'three';
import { createIllustrationModel, disposeModel } from './scenes.js';
import { createHoverAnimation } from './hover-animation.js';

/** Mount a decorative scene; call dispose() when its host unmounts. */
export function mountIllustration(host, { variant = 'landing', animate = variant === 'landing' } = {}) {
  const model = createIllustrationModel(variant);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    disposeModel(model);
    host.dataset.state = 'fallback';
    return { dispose() {}, error };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none';
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(model);
  model.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  scene.add(new THREE.HemisphereLight('#fffdf5', '#a7bcae', 2.8));
  const light = new THREE.DirectionalLight('#fff5e6', 4);
  light.position.set(-3, 7, 5);
  light.castShadow = true;
  light.shadow.mapSize.setScalar(variant === 'landing' ? 1024 : 512);
  Object.assign(light.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 });
  light.shadow.normalBias = 0.035;
  light.shadow.bias = -0.0002;
  scene.add(light);
  const fill = new THREE.DirectionalLight('#d1fae5', 1.3);
  fill.position.set(4, 3, -4);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.085;
  ground.receiveShadow = true;
  scene.add(ground);

  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, 0.1, 50);
  camera.position.copy(center).add(new THREE.Vector3(5, variant === 'landing' ? 3.2 : variant === 'groceries' ? 4.2 : 5.8, 7));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  // Measure projected corners so both wide and narrow hosts keep the entire model visible.
  const viewBounds = new THREE.Box3();
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    viewBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
  }
  const viewSize = viewBounds.getSize(new THREE.Vector3());
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverAnimation = createHoverAnimation(model);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const fridge = model.getObjectByName('refrigerator');
  // Keep the original cabinet area active while its moving doors reveal gaps.
  const fridgeHoverBounds = fridge ? new THREE.Box3().setFromObject(fridge) : null;
  const bag = model.getObjectByName('grocery-bag');
  const bagHoverBounds = bag ? new THREE.Box3().setFromObject(bag) : null;
  let hovered = null;
  let touchStart = null;
  let visible = true;
  let disposed = false;
  let contextLost = false;
  let frame = 0;
  let elapsed = 0;
  let previousTime = null;

  function render() {
    if (disposed || contextLost) return;
    renderer.render(scene, camera);
    host.dataset.state = 'ready';
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || disposed) return;
    const aspect = width / height;
    const halfHeight = Math.max(viewSize.y / 2, viewSize.x / (2 * aspect)) * 1.18;
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }
  function canAnimate() {
    return !disposed && !contextLost && !motionPreference.matches && visible && !document.hidden;
  }
  function tick(time) {
    frame = 0;
    if (!canAnimate()) {
      // A preference can change between scheduling and running this frame.
      // Settle immediately instead of leaving a door or hop halfway through.
      if (motionPreference.matches && !disposed && !contextLost && visible && !document.hidden) {
        hoverAnimation.snap();
        model.rotation.y = 0;
        render();
      }
      previousTime = null;
      return;
    }
    const delta = previousTime === null ? 1 / 60 : Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    elapsed += delta;
    hoverAnimation.step(delta);
    // Keep the interaction still in space while doors and ingredients move.
    model.rotation.y = animate && !hovered ? Math.sin(elapsed * 0.35) * 0.025 : 0;
    render();
    if ((animate && !hovered) || hoverAnimation.active) frame = requestAnimationFrame(tick);
    else previousTime = null;
  }
  function syncAnimation() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
    if (disposed || contextLost) return;
    if (!visible || document.hidden) {
      hovered = null;
      touchStart = null;
      delete host.dataset.hovered;
      hoverAnimation.reset();
      model.rotation.y = 0;
      return;
    }
    if (motionPreference.matches) {
      hoverAnimation.snap();
      model.rotation.y = 0;
    }
    if (canAnimate() && ((animate && !hovered) || hoverAnimation.active)) frame = requestAnimationFrame(tick);
    else render();
  }
  function pickInteraction(event) {
    if (disposed || contextLost || !visible || document.hidden) return null;
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    model.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(model, true)[0];
    for (let object = hit?.object; object; object = object.parent) {
      if (object.userData.interaction) return object.userData.interaction;
    }
    if (hovered === 'fridge' && fridgeHoverBounds && raycaster.ray.intersectsBox(fridgeHoverBounds)) return 'fridge';
    if (hovered === 'bag' && bagHoverBounds && raycaster.ray.intersectsBox(bagHoverBounds)) return 'bag';
    return null;
  }
  function setHovered(next) {
    if (next === hovered || disposed || contextLost) return;
    hovered = next;
    if (next) host.dataset.hovered = next;
    else delete host.dataset.hovered;
    hoverAnimation.setTarget(next, motionPreference.matches);
    syncAnimation();
  }
  function onPointerMove(event) {
    if (event.pointerType !== 'touch') setHovered(pickInteraction(event));
  }
  function onPointerLeave(event) {
    if (event.pointerType !== 'touch') setHovered(null);
  }
  function onPointerDown(event) {
    if (event.pointerType === 'touch') touchStart = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event) {
    if (event.pointerType !== 'touch' || !touchStart) return;
    const distance = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y);
    touchStart = null;
    if (distance > 8) return; // Let touch scrolling remain scrolling.
    const next = pickInteraction(event);
    if ((next === 'bowl' || next === 'bag') && hovered === next) {
      hoverAnimation.setTarget(null);
      hoverAnimation.setTarget(next, motionPreference.matches);
      syncAnimation();
    } else setHovered(next === hovered ? null : next);
  }
  function onPointerCancel() {
    touchStart = null;
    setHovered(null);
  }
  function onOutsidePointerDown(event) {
    if (!host.contains(event.target)) setHovered(null);
  }
  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    hoverAnimation.reset();
    hovered = null;
    delete host.dataset.hovered;
    cancelAnimationFrame(frame);
    frame = 0;
    host.dataset.state = 'fallback';
  }
  function onContextRestored() {
    contextLost = false;
    resize();
    syncAnimation();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    syncAnimation();
  });
  intersectionObserver.observe(host);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerleave', onPointerLeave);
  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerCancel);
  document.addEventListener('pointerdown', onOutsidePointerDown);
  motionPreference.addEventListener('change', syncAnimation);
  document.addEventListener('visibilitychange', syncAnimation);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);
  resize();
  syncAnimation();

  return {
    model,
    camera,
    renderer,
    // Suitable for route changes or a React effect cleanup.
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      hoverAnimation.reset();
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerCancel);
      document.removeEventListener('pointerdown', onOutsidePointerDown);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionPreference.removeEventListener('change', syncAnimation);
      document.removeEventListener('visibilitychange', syncAnimation);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposeModel(scene);
      scene.traverse(object => { if (object.isLight) object.dispose?.(); });
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      delete host.dataset.state;
      delete host.dataset.hovered;
    },
  };
}

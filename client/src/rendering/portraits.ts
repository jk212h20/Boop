// Inventory portraits are rendered once from the real rig and cached as images.
// Four live <Canvas> portraits used to cost four extra WebGL contexts (six
// during a return hop); this keeps the page at exactly one.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createCatScene } from './boardAppearance';
import { PlayerColor, PieceType } from '../types';

export type PortraitKey = `${PlayerColor}-${PieceType}`;

const COMBOS: [PlayerColor, PieceType][] = [
  ['orange', 'kitten'], ['orange', 'cat'], ['gray', 'kitten'], ['gray', 'cat'],
];

const urls = new Map<PortraitKey, string>();
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const WIDTH = 192, HEIGHT = 216;
// The portrait render is supersampled and then cropped to the cat's own pixels,
// so every model fills its box the same way and no ear or paw is ever left
// outside the frame.
const SUPERSAMPLE = 2;
const MARGIN = .06;
// A kitten is a smaller animal, and its portrait should say so: the kitten is
// drawn at its true height relative to the cat, less a little more, so it never
// reads as a cat and never comes near the edge of its box.
const KITTEN_FILL_SLACK = .92;

export function portraitUrl(color: PlayerColor, type: PieceType): string | undefined {
  return urls.get(`${color}-${type}` as PortraitKey);
}

/** Re-render subscribers once the portraits exist. */
export function subscribePortraits(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function renderPortrait(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] },
  color: PlayerColor, type: PieceType, fill: number) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const renderWidth = WIDTH * SUPERSAMPLE, renderHeight = HEIGHT * SUPERSAMPLE;
  renderer.setSize(renderWidth, renderHeight, false);
  renderer.setClearAlpha(0);
  const scene = new THREE.Scene();
  const fov = 30;
  const camera = new THREE.PerspectiveCamera(fov, WIDTH / HEIGHT, .1, 40);
  camera.position.set(1.3, 1.1, 2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);

  const model = createCatScene(gltf.scene, color, false);
  model.position.set(0, -.45, 0);
  model.rotation.set(0, Math.atan2(9.2, 12), 0);
  model.scale.setScalar(type === 'cat' ? 1.1 : 1);
  scene.add(model);

  // Settle into the idle pose so the portrait is not the bind pose.
  const mixer = new THREE.AnimationMixer(model);
  const sit = THREE.AnimationClip.findByName(gltf.animations, 'Sit');
  if (sit) mixer.clipAction(sit).play();
  mixer.update(.35);

  // Frame the whole cat before rendering. The camera used to sit at a fixed
  // distance, which cropped the ears off the kitten and the paws off the cat.
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = new THREE.Vector3(1.3, 1.1, 2).normalize();
  const vertical = THREE.MathUtils.degToRad(fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * (WIDTH / HEIGHT));
  // 1.3 is slack for the bind pose being wider than the settled pose.
  const distance = Math.max(
    (size.y * 1.3) / (2 * Math.tan(vertical / 2)),
    (size.x * 1.3) / (2 * Math.tan(horizontal / 2)),
  );
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  camera.far = distance * 4;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const url = cropToCat(renderer.domElement, renderWidth, renderHeight, fill);

  mixer.stopAllAction();
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => material.dispose());
  });
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}

/** Trim the rendered frame to the pixels the cat actually occupied, then scale
 * that into the portrait box with a margin, so the same framing holds for both
 * models and nothing sits on the border. */
function cropToCat(source: HTMLCanvasElement, width: number, height: number, fill: number): string {
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = height;
  const context = scratch.getContext('2d');
  if (!context) return source.toDataURL('image/png');
  context.drawImage(source, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return source.toDataURL('image/png');
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  // `fill` is the share of the box height the animal may occupy: 1 for a cat,
  // less for a kitten. Everything is bottom-aligned, so both sit on the floor.
  const availableHeight = HEIGHT * (1 - MARGIN * 2);
  const scale = Math.min((WIDTH * (1 - MARGIN * 2)) / boxWidth, (availableHeight * fill) / boxHeight);
  const drawnWidth = boxWidth * scale;
  const drawnHeight = boxHeight * scale;
  const out = document.createElement('canvas');
  out.width = WIDTH;
  out.height = HEIGHT;
  const outContext = out.getContext('2d');
  if (!outContext) return source.toDataURL('image/png');
  outContext.imageSmoothingEnabled = true;
  outContext.imageSmoothingQuality = 'high';
  outContext.drawImage(scratch, minX, minY, boxWidth, boxHeight,
    (WIDTH - drawnWidth) / 2, HEIGHT * (1 - MARGIN) - drawnHeight, drawnWidth, drawnHeight);
  return out.toDataURL('image/png');
}

/** How tall the model stands once it is placed and scaled for the portrait. */
function modelHeight(gltf: { scene: THREE.Object3D }, type: PieceType) {
  const model = createCatScene(gltf.scene, 'orange', false);
  model.position.set(0, -.45, 0);
  model.scale.setScalar(type === 'cat' ? 1.1 : 1);
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => material.dispose());
  });
  return height;
}

/** Idempotent: call from any portrait that mounts. */
export function ensurePortraits(): Promise<void> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all([
    loader.loadAsync('/assets/models/boop-kitten.glb'),
    loader.loadAsync('/assets/models/boop-cat.glb'),
  ]).then(([kitten, cat]) => {
    const heights = { kitten: modelHeight(kitten, 'kitten'), cat: modelHeight(cat, 'cat') };
    const fills: Record<PieceType, number> = {
      cat: 1,
      kitten: Math.min(.9, (heights.kitten / heights.cat) * KITTEN_FILL_SLACK),
    };
    for (const [color, type] of COMBOS) {
      try {
        urls.set(`${color}-${type}` as PortraitKey, renderPortrait(type === 'kitten' ? kitten : cat, color, type, fills[type]));
      } catch (error) {
        // A portrait is decoration: never let it break the game.
        console.error('portrait render failed', color, type, error);
      }
    }
    listeners.forEach(listener => listener());
  }).catch(error => {
    console.error('portrait models failed to load', error);
  });
  return loading;
}

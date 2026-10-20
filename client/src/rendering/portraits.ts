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

export function portraitUrl(color: PlayerColor, type: PieceType): string | undefined {
  return urls.get(`${color}-${type}` as PortraitKey);
}

/** Re-render subscribers once the portraits exist. */
export function subscribePortraits(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function renderPortrait(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] },
  color: PlayerColor, type: PieceType) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.setClearAlpha(0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, .1, 40);
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

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');

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

/** Idempotent: call from any portrait that mounts. */
export function ensurePortraits(): Promise<void> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all([
    loader.loadAsync('/assets/models/boop-kitten.glb'),
    loader.loadAsync('/assets/models/boop-cat.glb'),
  ]).then(([kitten, cat]) => {
    for (const [color, type] of COMBOS) {
      try {
        urls.set(`${color}-${type}` as PortraitKey, renderPortrait(type === 'kitten' ? kitten : cat, color, type));
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

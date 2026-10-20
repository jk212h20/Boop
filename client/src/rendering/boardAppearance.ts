import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PlayerColor } from '../types';

export type QuiltColors = [string, string];
// Two clearly separated values: the cells have to read as a grid at a glance,
// and the previous pair differed mostly in hue, not lightness.
export const DEFAULT_QUILT_COLORS: QuiltColors = ['#b7c4c7', '#5f7d88'];
const LEGACY_QUILT_COLORS: QuiltColors = ['#8c9199', '#849b92'];
export const QUILT_STORAGE_KEY = 'boop.quilt-colors.v1';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parseQuiltColors(saved: string | null): QuiltColors {
  try {
    const value: unknown = saved === null ? null : JSON.parse(saved);
    if (Array.isArray(value) && value.length === 2 && value.every(color =>
      typeof color === 'string' && HEX_COLOR.test(color))) {
      // Anyone still on the old defaults gets the new contrast; an explicit
      // choice is never overwritten.
      const isLegacyDefault = value[0] === LEGACY_QUILT_COLORS[0] && value[1] === LEGACY_QUILT_COLORS[1];
      return isLegacyDefault ? [...DEFAULT_QUILT_COLORS] : [value[0], value[1]];
    }
  } catch { /* Old or damaged preferences should not prevent a game loading. */ }
  return [...DEFAULT_QUILT_COLORS];
}

export function readQuiltColors(): QuiltColors {
  try { return parseQuiltColors(localStorage.getItem(QUILT_STORAGE_KEY)); }
  catch { return [...DEFAULT_QUILT_COLORS]; }
}

const TEAM = {
  orange: { fur: '#ed6b25', light: '#ffd09b', stripe: '#6e2415', eye: '#63bc58' },
  gray: { fur: '#64748b', light: '#dce7f2', stripe: '#222b3c', eye: '#48bfd1' },
};

/** Clone per-instance (independent skeletons for rigged models) and apply
 * team colors. The GLB fur uses a `Mask` vertex-color attribute
 * (R = cream belly/muzzle/paws, G = tabby stripes); team colors are mixed in
 * the shader so cached geometry stays shared between pieces.
 *
 * Ghosts are a dark, translucent silhouette whose stripes and glow carry the
 * player's own color — clearly "yours", clearly not solid. They used to be a
 * near-white wash, which disappeared against the pale quilt. */
const GHOST_BODY = new THREE.Color('#1b2025');

export interface GhostPalette {
  /** main fur: dark and near-neutral, so the cat reads as a shadow */
  body: THREE.Color;
  /** belly, muzzle and paws: the player's accent */
  belly: THREE.Color;
  /** tabby stripes: kept dark, so the silhouette stays the dominant read */
  stripe: THREE.Color;
  /** eye color, kept saturated so the face still reads at a glance */
  eye: THREE.Color;
}

/** The preview palette for a player. Everything that marks the cat as theirs
 * (stripes, eye, glow) comes from their team color; the body stays dark so the
 * silhouette is legible on any quilt. */
export function ghostPalette(color: PlayerColor): GhostPalette {
  const colors = TEAM[color];
  // The accent keeps the team hue but is pushed brighter than the solid fur: a
  // stripe has to read as a thin line on a dark body, and the slate team would
  // otherwise land almost neutral.
  const hsl = { h: 0, s: 0, l: 0 };
  const fur = new THREE.Color(colors.fur);
  fur.getHSL(hsl, THREE.SRGBColorSpace);
  // The accent is the team hue pushed bright: the preview is dark and
  // translucent, so a straight copy of the solid fur reads as brown mud.
  const accent = new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, .85), .66, THREE.SRGBColorSpace);
  return {
    body: GHOST_BODY.clone(),
    // Belly, muzzle and paws are the largest colour area on the model, so they
    // carry the team accent; the stripes stay dark.
    belly: accent.clone(),
    stripe: GHOST_BODY.clone().multiplyScalar(.6),
    eye: new THREE.Color(colors.eye),
  };
}

export function createCatScene(sourceScene: THREE.Object3D, color: PlayerColor, ghost: boolean) {
  const copy = cloneSkinned(sourceScene);
  const colors = TEAM[color];
  const ghostColors = ghostPalette(color);
  const ghostFur = ghostColors.body;
  const ghostLight = ghostColors.belly;
  const ghostStripe = ghostColors.stripe;
  copy.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = !ghost;
    child.receiveShadow = !ghost;
    child.frustumCulled = false; // skinned bounds do not track posed vertices
    const hasMask = Boolean((child.geometry as THREE.BufferGeometry).getAttribute('color'));
    const prepare = (source: THREE.MeshStandardMaterial) => {
      const material = source.clone();
      if (source.name === 'Eyes' || source.name === 'Iris') {
        material.color.set(ghost ? ghostColors.eye : colors.eye);
      }
      if (source.name === 'Fur' && hasMask) {
        // Team coloring happens in the shader; the base stays white.
        material.color.set('#ffffff');
        material.vertexColors = true;
        const fur = ghost ? ghostFur : colors.fur;
        const light = ghost ? ghostLight : colors.light;
        const stripe = ghost ? ghostStripe : colors.stripe;
        material.onBeforeCompile = shader => {
          shader.uniforms.furColor = { value: new THREE.Color(fur) };
          shader.uniforms.lightColor = { value: new THREE.Color(light) };
          shader.uniforms.stripeColor = { value: new THREE.Color(stripe) };
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 furColor;\nuniform vec3 lightColor;\nuniform vec3 stripeColor;')
            .replace('#include <color_fragment>', [
              '#ifdef USE_COLOR',
              '  vec3 catFur = mix(furColor, lightColor, vColor.r);',
              '  catFur = mix(catFur, stripeColor, vColor.g);',
              '  diffuseColor.rgb = catFur;',
              '#endif',
            ].join('\n'));
        };
        material.customProgramCacheKey = () => `boop-fur-${color}-${ghost ? 'ghost' : 'solid'}`;
      } else if (source.name === 'Fur') {
        material.color.set(ghost ? ghostFur : colors.fur);
      }
      if (ghost) {
        // A dark, translucent silhouette, not an opaque cat inside a bubble.
        // The accent glow keeps the player's color visible at the edges.
        material.transparent = true;
        material.opacity = .55;
        material.depthWrite = false;
        material.roughness = 1;
        material.metalness = 0;
        // A faint accent bounce, not a wash: a strong emissive turns the whole
        // dark body the team color and the preview stops reading as a shadow.
        material.emissive.copy(ghostColors.stripe);
        material.emissiveIntensity = .05;
      }
      return material;
    };
    child.material = Array.isArray(child.material)
      ? child.material.map(material => prepare(material as THREE.MeshStandardMaterial))
      : prepare(child.material as THREE.MeshStandardMaterial);
    // Preview geometry must never intercept quilt-cell pointer events.
    if (ghost) {
      child.raycast = () => {};
      child.renderOrder = 2;
    }
  });
  return copy;
}

/** A seamless, deterministic plain weave: alternating over/under yarns.
 * Shared across the quilt, with independent albedo and fine bump relief.
 * No external texture/model download and no regeneration on color changes.
 */
export function createFabricTextures() {
  const size = 128;
  const yarn = 8;
  const albedo = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const horizontalOver = (Math.floor(x / yarn) + Math.floor(y / yarn)) % 2 === 0;
      const cross = horizontalOver ? y % yarn : x % yarn;
      const along = horizontalOver ? x : y;
      const ridge = Math.sin(Math.PI * (cross + .5) / yarn);
      const fiber = Math.sin(along * Math.PI / 2) * .025;
      const height = Math.round(255 * Math.min(1, .13 + ridge * .73 + fiber));
      const value = Math.round(222 + ridge * 28 + fiber * 35);
      const offset = (y * size + x) * 4;
      albedo.set([value, value, value, 255], offset);
      relief.set([height, height, height, 255], offset);
    }
  }
  const map = new THREE.DataTexture(albedo, size, size, THREE.RGBAFormat);
  const bumpMap = new THREE.DataTexture(relief, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
  }
  return { map, bumpMap };
}

/** A soft radial falloff used as a fake contact occlusion under the bed. It
 * holds the furniture to the floor even where the shadow map is soft. */
export function createContactShadowTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, size * .12, size / 2, size / 2, size * .5);
  gradient.addColorStop(0, 'rgba(0,0,0,.46)');
  gradient.addColorStop(.55, 'rgba(0,0,0,.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft round mask (white centre, transparent rim) for the landing ripple. */
export function createRadialAlphaTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(.55, '#f2f2f2');
  gradient.addColorStop(1, '#000000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function quiltColor(base: string, hovered: boolean, active: boolean) {
  // Preserve the selected fabric color, including during hover/last-move states.
  return new THREE.Color(base).lerp(new THREE.Color('#c2d0cb'), hovered ? .07 : active ? .10 : 0);
}

const PATCH_WIDTH = 1.04;
function loft(x: number, z: number) {
  const u = (x + PATCH_WIDTH / 2) / PATCH_WIDTH;
  const v = (z + PATCH_WIDTH / 2) / PATCH_WIDTH;
  return .035 * Math.pow(Math.max(0, Math.sin(Math.PI * u) * Math.sin(Math.PI * v)), .65);
}

/** Soft batting under cloth, rather than tall square ceramic-looking tiles. */
export function createQuiltPatchGeometry() {
  const geometry = new THREE.BoxGeometry(PATCH_WIDTH, .12, PATCH_WIDTH, 20, 2, 20);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (y > .05) position.setY(i, y + loft(x, z));
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createQuiltStitches() {
  const vertices: number[] = [];
  const edge = .47;
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i < 15; i++) {
      const start = -edge + (i + .22) * (edge * 2 / 15);
      const end = start + .032;
      for (const t of [start, end]) {
        const x = side === 0 ? -edge : side === 1 ? edge : t;
        const z = side === 2 ? -edge : side === 3 ? edge : t;
        vertices.push(x, .0615 + loft(x, z), z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

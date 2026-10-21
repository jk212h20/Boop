import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PlayerColor } from '../types';

export type QuiltColors = [string, string, string, string];
/** Four light pastels, one per diagonal, the way the rules film shows the
 * quilt: mint, butter, blush and sky. They are deliberately close in lightness
 * so the board reads as soft fabric, and separated in hue so the diagonals
 * still give the eye a grid to count cells on. */
export const DEFAULT_QUILT_COLORS: QuiltColors = ['#8dd2ae', '#eed583', '#f2a3b0', '#93b8ec'];
export const QUILT_STORAGE_KEY = 'boop.quilt-colors.v1';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function parseQuiltColors(saved: string | null): QuiltColors {
  try {
    const value: unknown = saved === null ? null : JSON.parse(saved);
    if (Array.isArray(value) && value.length === 4 && value.every(color =>
      typeof color === 'string' && HEX_COLOR.test(color))) {
      return [value[0], value[1], value[2], value[3]];
    }
  } catch { /* Old or damaged preferences should not prevent a game loading. */ }
  return [...DEFAULT_QUILT_COLORS];
}

/** The colour of one square: the diagonals of the quilt run through cells with
 * the same `row + col`, so `row + col` picks the pastel. Neighbouring cells are
 * always different, up, down, or across. */
export function quiltCellColor(colors: QuiltColors, row: number, col: number): string {
  return colors[(((row + col) % colors.length) + colors.length) % colors.length];
}

export function readQuiltColors(): QuiltColors {
  try { return parseQuiltColors(localStorage.getItem(QUILT_STORAGE_KEY)); }
  catch { return [...DEFAULT_QUILT_COLORS]; }
}

const TEAM = {
  orange: { fur: '#ed6b25', light: '#fffaf4', stripe: '#6e2415', eye: '#63bc58', rim: '#ffa24a' },
  gray: { fur: '#64748b', light: '#fffaf4', stripe: '#222b3c', eye: '#48bfd1', rim: '#478ef5' },
};

/** Clone per-instance (independent skeletons for rigged models) and apply
 * team colors. The GLB fur uses a `Mask` vertex-color attribute
 * (R = cream belly/muzzle/paws, G = tabby stripes); team colors are mixed in
 * the shader so cached geometry stays shared between pieces.
 *
 * Ghosts are a desaturated grey silhouette with a rim in the player's color:
 * no team tint in the fur at all, so the preview reads as "a cat would go
 * here", and the outline alone says whose. They used to be a near-white wash
 * (invisible on the pale quilt) and then a dark cat with a colored belly
 * (readable as a solid piece). */
const GHOST_BODY = new THREE.Color('#8f9498');
const GHOST_LIGHT = new THREE.Color('#c3c8cb');
const GHOST_STRIPE = new THREE.Color('#6a7075');
const GHOST_EYE = new THREE.Color('#b9bec2');

export interface GhostPalette {
  /** main fur: neutral grey, so the cat reads as an absence of a piece */
  body: THREE.Color;
  /** belly, muzzle and paws: greyer still, never a team tint */
  belly: THREE.Color;
  /** tabby stripes: a darker grey, so the silhouette keeps its markings */
  stripe: THREE.Color;
  /** eye color, neutral too: the outline is the only color on the ghost */
  eye: THREE.Color;
  /** the rim drawn around the silhouette, in the player's team color */
  outline: THREE.Color;
}

/** The preview palette for a player: a grey cat outlined in their color. */
export function ghostPalette(color: PlayerColor): GhostPalette {
  const colors = TEAM[color];
  // The rim is its own color, not the fur hue pushed to full saturation: the
  // orange fur sits close enough to red that a saturated rim of the same hue
  // read as red through the tone mapping. The rim is the one warm orange the
  // orange player ever sees, so it is picked as an orange.
  const outline = new THREE.Color(colors.rim);
  return {
    body: GHOST_BODY.clone(),
    belly: GHOST_LIGHT.clone(),
    stripe: GHOST_STRIPE.clone(),
    eye: GHOST_EYE.clone(),
    outline,
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
      // Mask is fur data, not accessory color. Joined GLBs carry it on every
      // primitive; zero mask values were multiplying eyes and frames to black.
      if (source.name !== 'Fur') material.vertexColors = false;
      if (source.name === 'GlassesAccent') {
        material.color.set(ghost ? ghostColors.outline : colors.fur);
        material.roughness = .3;
      }
      if (source.name === 'Eyes' || source.name === 'Iris') {
        material.color.set(ghost ? ghostColors.eye : colors.eye);
      }
      if (source.name === 'Fur') {
        // Team coloring happens in the shader; the base stays white when the
        // model carries a mask, and is the flat fur color when it does not.
        const fur = ghost ? ghostFur : colors.fur;
        const light = ghost ? ghostLight : colors.light;
        const stripe = ghost ? ghostStripe : colors.stripe;
        if (hasMask) {
          material.color.set('#ffffff');
          material.vertexColors = true;
        } else {
          material.color.set(fur);
        }
        material.onBeforeCompile = shader => {
          shader.uniforms.furColor = { value: new THREE.Color(fur) };
          shader.uniforms.lightColor = { value: new THREE.Color(light) };
          shader.uniforms.stripeColor = { value: new THREE.Color(stripe) };
          shader.uniforms.outlineColor = { value: ghostColors.outline.clone() };
          shader.uniforms.outlineWidth = { value: ghost ? 2.4 : 0 };
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 furColor;\nuniform vec3 lightColor;\nuniform vec3 stripeColor;\nuniform vec3 outlineColor;\nuniform float outlineWidth;')
            .replace('#include <color_fragment>', [
              '#ifdef USE_COLOR',
              '  vec3 catFur = mix(furColor, lightColor, vColor.r);',
              '  catFur = mix(catFur, stripeColor, vColor.g);',
              '  diffuseColor.rgb = catFur;',
              '#endif',
            ].join('\n'))
            // The player's color lives on the edge of the silhouette only:
            // a fresnel rim, so the body itself stays grey.
            .replace('#include <dithering_fragment>', [
              '#include <dithering_fragment>',
              'if (outlineWidth > 0.0) {',
              '  float rim = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);',
              '  float edge = pow(rim, outlineWidth);',
              '  gl_FragColor.rgb = mix(gl_FragColor.rgb, outlineColor, edge);',
              '  gl_FragColor.a = max(gl_FragColor.a, edge);',
              '}',
            ].join('\n'));
        };
        material.customProgramCacheKey = () => `boop-fur-${color}-${ghost ? 'ghost' : 'solid'}-${hasMask ? 'mask' : 'flat'}`;
      }
      if (ghost) {
        // A grey ghost, not an opaque cat inside a bubble. The team color is
        // only in the rim shader above; there is no emissive wash.
        material.transparent = true;
        material.opacity = .42;
        material.depthWrite = false;
        material.roughness = 1;
        material.metalness = 0;
        material.emissive.set('#000000');
        material.emissiveIntensity = 0;
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

// Every square reaches the quilt's own edge: 6 x 1.15 leaves a 2cm border inside
// the 7.04 quilt top, so the outer row and column sit on the rim rather than
// inside a wide margin.
const PATCH_WIDTH = 1.15;
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
  const edge = PATCH_WIDTH / 2 - .05;
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

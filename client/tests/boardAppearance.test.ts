import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as THREE from 'three';
import { createCatScene, createFabricTextures, createQuiltPatchGeometry, createQuiltStitches,
  DEFAULT_QUILT_COLORS, ghostPalette, parseQuiltColors, quiltColor } from '../src/rendering/boardAppearance';

test('quilt preferences accept two hex colors and recover from invalid storage', () => {
  assert.deepEqual(parseQuiltColors('["#556677","#778899"]'), ['#556677', '#778899']);
  for (const input of [null, '', 'broken', '{}', '[]', '["red","blue"]', '["#123456"]', '["#123456",null]']) {
    assert.deepEqual(parseQuiltColors(input), DEFAULT_QUILT_COLORS);
  }
});

function makeSkinnedCat(materialName: string) {
  const geometry = new THREE.BoxGeometry();
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(
    [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
     1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
     1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1,
     1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1], 4));
  const bones = [new THREE.Bone(), new THREE.Bone()];
  bones[0].add(bones[1]);
  const skeleton = new THREE.Skeleton(bones);
  const mesh = new THREE.SkinnedMesh(geometry,
    new THREE.MeshStandardMaterial({ color: '#dddddd', name: materialName }));
  mesh.add(bones[0]);
  mesh.bind(skeleton);
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

test('rigged cats clone with independent skeletons so pieces animate separately', () => {
  const source = makeSkinnedCat('Fur');
  const first = createCatScene(source, 'orange', false);
  const second = createCatScene(source, 'gray', false);
  const sourceMesh = source.children[0] as THREE.SkinnedMesh;
  const firstMesh = first.children[0] as THREE.SkinnedMesh;
  const secondMesh = second.children[0] as THREE.SkinnedMesh;
  assert.notEqual(firstMesh.skeleton, sourceMesh.skeleton);
  assert.notEqual(secondMesh.skeleton, sourceMesh.skeleton);
  assert.notEqual(firstMesh.skeleton, secondMesh.skeleton);
  // Geometry is deliberately shared between instances; only skeletons and materials clone.
  assert.equal(firstMesh.geometry, sourceMesh.geometry);
  assert.equal(sourceMesh.skeleton.bones[0].parent, sourceMesh);
  assert.equal(firstMesh.skeleton.bones[0].parent, firstMesh);
  const fur = firstMesh.material as THREE.MeshStandardMaterial;
  assert.equal(fur.vertexColors, true);
  assert.equal(fur.color.getHexString(), 'ffffff');
  assert.match(fur.customProgramCacheKey?.() ?? '', /orange/);
  const grayFur = (secondMesh.material as THREE.MeshStandardMaterial);
  assert.notEqual(fur.customProgramCacheKey?.(), grayFur.customProgramCacheKey?.());
});

test('hover kitten is genuinely translucent, shadowless and does not intercept clicks', () => {
  const source = new THREE.Group();
  const sourceMaterial = new THREE.MeshStandardMaterial({ color: '#dddddd' });
  sourceMaterial.name = 'Fur';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial);
  source.add(mesh);
  const ghost = createCatScene(source, 'orange', true).children[0] as THREE.Mesh;
  const placed = createCatScene(source, 'orange', false).children[0] as THREE.Mesh;
  const ghostMaterial = ghost.material as THREE.MeshStandardMaterial;
  const placedMaterial = placed.material as THREE.MeshStandardMaterial;
  assert.equal(ghostMaterial.transparent, true);
  assert.equal(ghostMaterial.opacity, .42);
  assert.equal(ghostMaterial.depthWrite, false);
  // The body is an untinted grey silhouette; the player's color lives in the
  // rim shader only, never in the fur.
  assert.notEqual(ghostMaterial.color.getHexString(), placedMaterial.color.getHexString());
  const srgb = THREE.SRGBColorSpace;
  assert.ok(ghostMaterial.color.getHSL({}, srgb).s < .12, 'ghost body is fully desaturated');
  assert.equal(ghost.castShadow, false);
  assert.equal(placed.castShadow, true);
  assert.equal(placedMaterial.opacity, 1);
  assert.equal(placedMaterial.transparent, false);
  assert.equal(sourceMaterial.transparent, false);
  assert.notEqual(ghostMaterial, sourceMaterial);
  assert.notEqual(ghostMaterial, placedMaterial);
  const hits: THREE.Intersection[] = [];
  ghost.raycast(new THREE.Raycaster(), hits);
  assert.equal(hits.length, 0);
});

// The preview names its owner with an outline, not with tinted fur: the body
// is grey for both players and only the rim differs.
test('ghost is grey with a player-colored outline', () => {
  const srgb = THREE.SRGBColorSpace;
  for (const color of ['orange', 'gray'] as const) {
    const palette = ghostPalette(color);
    for (const region of ['body', 'belly', 'stripe', 'eye'] as const) {
      assert.ok(palette[region].getHSL({}, srgb).s < .15,
        `${color} ghost ${region} is desaturated`);
    }
    assert.ok(palette.stripe.getHSL({}, srgb).l < palette.body.getHSL({}, srgb).l,
      `${color} stripes stay darker than the body`);
    assert.ok(palette.outline.getHSL({}, srgb).s > .5, `${color} outline is saturated`);
  }
  const orange = ghostPalette('orange');
  const gray = ghostPalette('gray');
  assert.ok(orange.body.equals(gray.body), 'the silhouette is the same for both players');
  assert.ok(!orange.outline.equals(gray.outline), 'the outline differs per player');
  // Orange is warm, slate is cool: not two shades of the same hue.
  assert.ok(orange.outline.getHSL({}, srgb).h < .12);
  // And orange stays orange. The fur hue pushed to full saturation came out
  // red through the tone mapping, which is what the player sees on a ghost.
  assert.ok(orange.outline.getHSL({}, srgb).h > .07, 'the orange rim is not red');
  assert.ok(Math.abs(gray.outline.getHSL({}, srgb).h - orange.outline.getHSL({}, srgb).h) > .2);
});

// The rim is a fragment-shader term, so the fur program has to be unique per
// ghost: a shared cache key would hand a solid cat the ghost's program.
test('ghost fur program is cached separately from a solid cat', () => {
  const source = new THREE.Group();
  const sourceMaterial = new THREE.MeshStandardMaterial({ color: '#dddddd' });
  sourceMaterial.name = 'Fur';
  source.add(new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial));
  // The real model carries a Mask color attribute; that is the shader path.
  const geometry = new THREE.BoxGeometry();
  const mask = new Float32Array(geometry.attributes.position.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(mask, 3));
  source.children[0] = new THREE.Mesh(geometry, sourceMaterial);
  const ghost = createCatScene(source, 'orange', true).children[0] as THREE.Mesh;
  const placed = createCatScene(source, 'orange', false).children[0] as THREE.Mesh;
  const keyOf = (mesh: THREE.Mesh) =>
    (mesh.material as THREE.MeshStandardMaterial).customProgramCacheKey?.();
  assert.equal(keyOf(ghost), 'boop-fur-orange-ghost-mask');
  assert.equal(keyOf(placed), 'boop-fur-orange-solid-mask');
});

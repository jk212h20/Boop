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
  assert.equal(ghostMaterial.opacity, .55);
  assert.equal(ghostMaterial.depthWrite, false);
  // The body is a dark silhouette rather than a wash of the team color; the
  // player's color moved to the accents (stripes, eyes, edge glow).
  assert.notEqual(ghostMaterial.color.getHexString(), placedMaterial.color.getHexString());
  const srgb = THREE.SRGBColorSpace;
  assert.ok(ghostMaterial.color.getHSL({}, srgb).l < .3, 'ghost body stays dark');
  assert.ok(ghostMaterial.color.getHSL({}, srgb).s < .2, 'ghost body is near-neutral');
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

// The preview must stay legible on any quilt and still name its owner: the
// silhouette is shared and dark, the accent area (belly, muzzle, paws) carries
// the player's color.
test('ghost accents carry the player color on a dark body', () => {
  const srgb = THREE.SRGBColorSpace;
  for (const color of ['orange', 'gray'] as const) {
    const palette = ghostPalette(color);
    const body = palette.body.getHSL({}, srgb);
    const belly = palette.belly.getHSL({}, srgb);
    assert.ok(body.l < .3, `${color} ghost body is dark`);
    assert.ok(body.s < .2, `${color} ghost body is near-neutral`);
    assert.ok(belly.s > .5, `${color} accent is saturated`);
    assert.ok(belly.l > body.l + .3, `${color} accent is clearly lighter than the body`);
    // Stripes stay dark so the accent reads as an accent, not a paint job.
    assert.ok(palette.stripe.getHSL({}, srgb).l <= body.l + .05,
      `${color} stripes stay dark`);
  }
  const orange = ghostPalette('orange');
  const gray = ghostPalette('gray');
  assert.ok(orange.body.equals(gray.body), 'the silhouette is the same for both players');
  assert.ok(!orange.belly.equals(gray.belly), 'the accent differs per player');
  // Orange is warm, slate is cool: not two shades of the same hue.
  assert.ok(orange.belly.getHSL({}, srgb).h < .12);
  assert.ok(Math.abs(gray.belly.getHSL({}, srgb).h - orange.belly.getHSL({}, srgb).h) > .2);
});

test('both colors retain their identity under subdued selection highlights', () => {
  const base = new THREE.Color('#849b92');
  assert.ok(quiltColor('#849b92', false, false).equals(base));
  const target = new THREE.Color('#c2d0cb');
  assert.ok(quiltColor('#849b92', true, false).equals(base.clone().lerp(target, .07)));
  assert.ok(quiltColor('#849b92', false, true).equals(base.clone().lerp(target, .10)));
});

test('fabric textures have repeatable woven albedo and independent yarn relief', () => {
  const { map, bumpMap } = createFabricTextures();
  assert.equal(map.image.width, 128);
  assert.equal(map.wrapS, THREE.RepeatWrapping);
  assert.equal(bumpMap.wrapT, THREE.RepeatWrapping);
  assert.equal(map.colorSpace, THREE.SRGBColorSpace);
  const pixels = map.image.data as Uint8Array;
  const heights = bumpMap.image.data as Uint8Array;
  assert.ok(new Set(pixels).size > 8);
  assert.ok(new Set(heights).size > 8);
  // Symmetric yarn profiles deliberately reuse heights; require actual relief,
  // not an arbitrary count of distinct shades.
  const yarnHeights = Array.from(heights).filter((_, index) => index % 4 !== 3);
  assert.ok(Math.max(...yarnHeights) - Math.min(...yarnHeights) > 150);
  assert.notDeepEqual(pixels, heights);
  map.dispose(); bumpMap.dispose();
});

test('patches have softly lofted centers and discrete stitches, not tile borders', () => {
  const patch = createQuiltPatchGeometry();
  patch.computeBoundingBox();
  assert.ok(patch.boundingBox!.max.y > .09);
  assert.ok(patch.boundingBox!.min.y >= -.061);
  const stitches = createQuiltStitches();
  assert.equal(stitches.getAttribute('position').count, 120);
  patch.dispose(); stitches.dispose();
});

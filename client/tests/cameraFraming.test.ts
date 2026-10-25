import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { quiltFitDistance, QUILT_HALF_SIZE, VIEW_TARGET } from '../src/rendering/cameraFraming';

test('zoom limit keeps every quilt corner in frame at all supported orbits/aspects', () => {
  for (const aspect of [.65, 1, 1.6]) for (const polar of [.000001, .3, .8, 1.16]) for (const azimuth of [-.75, 0, .75]) {
    const camera = new THREE.PerspectiveCamera(46, aspect, .1, 100);
    const direction = new THREE.Vector3().setFromSphericalCoords(1, polar, azimuth);
    camera.position.copy(VIEW_TARGET).addScaledVector(direction, 12.6);
    const distance = quiltFitDistance(camera);
    camera.position.copy(VIEW_TARGET).addScaledVector(direction, distance);
    camera.lookAt(VIEW_TARGET); camera.updateMatrixWorld();
    for (const x of [-QUILT_HALF_SIZE, QUILT_HALF_SIZE]) for (const z of [-QUILT_HALF_SIZE, QUILT_HALF_SIZE]) {
      const p = new THREE.Vector3(x, .49, z).project(camera);
      assert.ok(Math.abs(p.x) <= .976 && Math.abs(p.y) <= .976, JSON.stringify({aspect,polar,azimuth,p}));
    }
  }
});

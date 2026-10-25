import * as THREE from 'three';

// Quilt edges, not the decorative bedroom, define the maximum useful zoom.
export const QUILT_HALF_SIZE = 3.51;
export const VIEW_TARGET = new THREE.Vector3(0, .18, 0);
export const VIEW_MARGIN = .025;

/** Minimum perspective distance that keeps all four quilt corners in frame.
 * Recomputed for the chosen orbit so diagonal/top-down views cannot crop cells. */
export function quiltFitDistance(camera: THREE.PerspectiveCamera, target = VIEW_TARGET): number {
  const direction = camera.position.clone().sub(target).normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  if (right.lengthSq() < .001) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (1 - VIEW_MARGIN);
  const tanX = tanY * camera.aspect;
  let distance = 0;
  for (const x of [-QUILT_HALF_SIZE, QUILT_HALF_SIZE]) {
    for (const z of [-QUILT_HALF_SIZE, QUILT_HALF_SIZE]) {
      const point = new THREE.Vector3(x, .49, z).sub(target);
      distance = Math.max(distance, point.dot(direction) + Math.abs(point.dot(right)) / tanX,
        point.dot(direction) + Math.abs(point.dot(up)) / tanY);
    }
  }
  return distance;
}

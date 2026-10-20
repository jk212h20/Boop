import { createPortal } from 'react-dom';
import { Component, Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Board as BoardType, BoopEffect, Cell, Piece as PieceData, PieceType, PlayerColor } from '../types';
import { GraduatingPiece, FallenPiece } from './Board';
import { createCatScene, createFabricTextures, createQuiltPatchGeometry, createQuiltStitches,
  DEFAULT_QUILT_COLORS, QUILT_STORAGE_KEY, QuiltColors, quiltColor, readQuiltColors } from '../rendering/boardAppearance';
import { BOOP_DELAY_MS, WALK_IN_MS } from '../animationTiming';

interface FloatingBoard3DProps {
  board: BoardType;
  onCellClick: (row: number, col: number) => void;
  isMyTurn: boolean;
  lastMove: Cell | null;
  selectedPieceType: PieceType | null;
  myColor?: PlayerColor;
  boopedPieces: BoopEffect[];
  graduatingPieces: GraduatingPiece[];
  graduationPhase?: 'visible' | 'highlighting' | 'removing' | null;
  highlightedCell?: Cell | null;
  isViewingHistory?: boolean;
  fallenPieces: FallenPiece[];
  animationKey: number;
}

const CELL = 1.06;
const at = (row: number, col: number) => [(col - 2.5) * CELL, .49, (row - 2.5) * CELL] as [number, number, number];

// The last hop into an inventory portrait is a DOM overlay. It must be
// rendered from the DOM component that owns the <Canvas>, never from inside
// the react-three-fiber tree: a portal created there is reconciled by R3F,
// which throws "Canvas is not part of the THREE namespace" the moment a
// booped cat reaches the box and unmounts the whole game.
interface InventoryFlight { id: number; piece: PieceData; from: { x: number; y: number } }
type RequestInventoryFlight = (piece: PieceData, from: { x: number; y: number }) => void;
const InventoryFlightContext = createContext<RequestInventoryFlight>(() => {});

function CatModel({ piece, ghost = false, clip = 'Sit' }: { piece: PieceData; ghost?: boolean; clip?: string }) {
  const { scene, animations } = useGLTF(`/assets/models/boop-${piece.type}.glb`);
  const cloned = useMemo(() => {
    const model = createCatScene(scene, piece.color, ghost);
    if (piece.type === 'kitten') {
      // Baby proportions, applied to the shared rig so every animation retains them.
      model.traverse(node => {
        if (node.name === 'head') node.scale.setScalar(1.22);
      });
    }
    return model;
  }, [scene, piece.color, piece.type, ghost]);
  const mixer = useMemo(() => {
    if (ghost) return null;
    const m = new THREE.AnimationMixer(cloned);
    const idle = THREE.AnimationClip.findByName(animations, clip);
    if (idle) m.clipAction(idle).play();
    return m;
    // The mixer is created once; clip changes crossfade below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloned, ghost]);
  const currentClip = useRef(clip);
  const blink = useMemo(() => (mixer ? THREE.AnimationClip.findByName(animations, 'Blink') ?? null : null), [mixer, animations]);
  const nextBlink = useRef(2 + Math.random() * 4);
  const blinkAction = useRef<THREE.AnimationAction | null>(null);
  useEffect(() => () => { mixer?.stopAllAction(); }, [mixer]);
  useEffect(() => {
    if (!mixer || currentClip.current === clip) return;
    const next = THREE.AnimationClip.findByName(animations, clip);
    if (!next) return;
    const previous = mixer.clipAction(THREE.AnimationClip.findByName(animations, currentClip.current) ?? next);
    const action = mixer.clipAction(next);
    action.reset().play();
    action.crossFadeFrom(previous, .12, true);
    currentClip.current = clip;
  }, [clip, mixer, animations]);
  useEffect(() => () => {
    cloned.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => material.dispose());
    });
  }, [cloned]);
  useFrame((_, delta) => {
    if (!mixer) return;
    mixer.update(delta);
    if (clip !== 'Sit' && clip !== 'Stand') return; // blink only while at ease
    nextBlink.current -= delta;
    if (blink && nextBlink.current <= 0 && (!blinkAction.current || !blinkAction.current.isRunning())) {
      const action = mixer.clipAction(blink);
      action.setLoop(THREE.LoopOnce, 1);
      action.reset().play();
      blinkAction.current = action;
      nextBlink.current = 2.5 + Math.random() * 5;
    }
  });
  return <primitive object={cloned} />;
}

interface CatActorProps {
  piece: PieceData;
  row: number;
  col: number;
  boop?: { fromRow: number; fromCol: number };
  isNew?: boolean;
  isGhost?: boolean;
  isGraduating?: boolean;
  removing?: boolean;
  animationKey: number;
}

// Cat-like motion. Everything below is elapsed-time driven so a re-render
// never restarts a performance.
const WALK_IN_S = WALK_IN_MS / 1000;
const BOOP_DELAY_S = BOOP_DELAY_MS / 1000;
const BOOP_S = .8; // crouch, airborne arc, and the fall onto the carpet
const FLOOR_Y = -1.03;
// Return trip to the inventory portrait: absorb the landing, trot over, look
// up, and only then hand off to the screen-space hop. Paced so the cat stays
// near the bed (and therefore keeps its size) instead of shrinking into the
// far corner in one fast blur.
const CARPET_LAND_S = .24;
const TROT_S = 1.55;
const LOOK_UP_S = .35;
const TROT_DISTANCE = 4.7; // max distance from the bed centre; keeps the cat large
const TROT_NEAR = .95; // pull the finish toward the camera so it reads bigger
// Project the actual inventory portrait into this scene; no invented boxes.
function poolDestination(color: PlayerColor, type: PieceType, camera: THREE.Camera, gl: THREE.WebGLRenderer, parent: THREE.Object3D | null) {
  const icon = document.querySelector(`[data-pool-target="${color}-${type}"] .animated-piece-icon`);
  if (!icon || !parent) return null;
  const rect = icon.getBoundingClientRect(), canvas = gl.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2((rect.left + rect.width / 2 - canvas.left) / canvas.width * 2 - 1, 1 - (rect.top + rect.height / 2 - canvas.top) / canvas.height * 2);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const floor = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y), floor)) return null;
  parent.worldToLocal(floor);
  const landing = floor.clone();
  // Jump ends precisely at the portrait's screen center, at board-depth.
  const depth = new THREE.Vector3(0, 0, 0).project(camera).z;
  const portrait = parent.worldToLocal(new THREE.Vector3(ndc.x, ndc.y, depth).unproject(camera));
  landing.z += 1.4;
  return { landing, portrait };
}
const CROUCH_F = .19, AIR_F = .52; // remaining fraction of the boop is landing
const SETTLE_HEADING = Math.atan2(9.2, 12); // face the default camera (~37°)

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const shortestTurn = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

function CatActor({ piece, row, col, boop, isNew, isGhost, isGraduating, removing, animationKey }: CatActorProps) {
  const group = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const born = useRef(performance.now());
  const removalStarted = useRef<number | null>(null);
  const heading = useRef(SETTLE_HEADING);
  const seed = useMemo(() => (((row + 2) * 17 + (col + 3) * 31 + piece.color.length * 7) % 23) / 23, [row, col, piece.color]);
  const offBoard = row < 0 || row > 5 || col < 0 || col > 5;
  const target = at(row, col);
  const origin = boop ? at(boop.fromRow, boop.fromCol) : target;
  // Walk-in entry: approach from just outside the quilt, along a gentle arc,
  // like a cat strolling up to a spot it has decided on.
  const walkFrom = useMemo(() => {
    const [x, , z] = target;
    const len = Math.hypot(x, z) || 1;
    const jitter = (seed - .5) * .5;
    // Stay on the bed: edge cells must not start beyond the wooden rim.
    const reach = Math.min(1.05 + jitter, Math.max(.4, 3.35 - Math.max(Math.abs(x), Math.abs(z))));
    const sx = x + (x / len) * reach - (z / len) * jitter * .5;
    const sz = z + (z / len) * reach + (x / len) * jitter * .5;
    return [sx, target[1], sz] as [number, number, number];
  }, [target, seed]);
  const walkCtrl = useMemo(() => {
    const mx = (walkFrom[0] + target[0]) / 2, mz = (walkFrom[2] + target[2]) / 2;
    const dx = target[0] - walkFrom[0], dz = target[2] - walkFrom[2];
    const bend = (seed - .5) * .9;
    return [mx - dz * bend, target[1], mz + dx * bend] as [number, number, number];
  }, [walkFrom, target, seed]);
  const qbez = (a: number, c: number, b: number, t: number) =>
    (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

  // Coordinate values, not freshly allocated boop prop objects, own the clock.
  useEffect(() => { born.current = performance.now(); }, [animationKey, boop?.fromRow, boop?.fromCol, isNew]);
  useEffect(() => {
    removalStarted.current = removing ? performance.now() : null;
  }, [removing, animationKey]);

  const [clip, setClip] = useState('Sit');
  const requestFlight = useContext(InventoryFlightContext);
  const flightSent = useRef(false);
  const settleHeading = SETTLE_HEADING + (seed - .5) * .7;
  const scaleBase = piece.type === 'cat' ? .65 : .55;

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const elapsed = (performance.now() - born.current) / 1000;
    let x = target[0], y = target[1], z = target[2];
    let desiredHeading = settleHeading;
    let nextClip = 'Sit';
    let squash = 0, stretch = 0;

    if (isGhost) {
      nextClip = 'Sit';
    } else if (boop) {
      // Real cat jump: crouch anticipation, airborne arc, landing absorb.
      const t = elapsed - BOOP_DELAY_S;
      const crouchEnd = CROUCH_F * BOOP_S;
      const airEnd = (CROUCH_F + AIR_F) * BOOP_S;
      const dx = target[0] - origin[0], dz = target[2] - origin[2];
      if (t <= 0) {
        x = origin[0]; z = origin[2]; // still sitting where it was booped from
        nextClip = 'Sit';
      } else if (t < crouchEnd) {
        const c = t / crouchEnd;
        x = origin[0]; z = origin[2];
        nextClip = 'Crouch';
        squash = Math.sin(c * Math.PI) * .16;
        desiredHeading = Math.atan2(dx, dz);
      } else if (t < airEnd) {
        const p = (t - crouchEnd) / (airEnd - crouchEnd);
        const e = offBoard ? p : easeOut(p); // falls accelerate, boops glide
        x = origin[0] + dx * e;
        z = origin[2] + dz * e;
        const peak = offBoard ? .65 : .85;
        y += Math.sin(p * Math.PI) * peak;
        if (offBoard) y += (FLOOR_Y - target[1]) * p * p;
        nextClip = offBoard ? 'Fall' : 'Jump';
        if (offBoard) g.rotation.x = Math.sin(p * Math.PI) * .3;
        desiredHeading = Math.atan2(dx, dz);
        stretch = Math.sin(p * Math.PI);
      } else if (t < BOOP_S) {
        const l = (t - airEnd) / (BOOP_S - airEnd);
        nextClip = 'Land';
        if (offBoard) y = FLOOR_Y;
        squash = Math.sin(l * Math.PI) * .18;
      }
      if (t >= BOOP_S) {
        g.rotation.x = 0;
        if (offBoard) {
          const destination = poolDestination(piece.color, piece.type, camera, gl, g.parent);
          if (!destination) return;
          const base = destination.landing;
          // Aim at the inventory column but stop at a friendly distance: a run
          // to the true floor point under the portrait shrinks the cat until it
          // is a speck. The DOM hop covers the last stretch at full size.
          const length = Math.hypot(base.x, base.z) || 1;
          const stopX = (base.x / length) * Math.min(length, TROT_DISTANCE);
          const stopZ = (base.z / length) * Math.min(length, TROT_DISTANCE) + TROT_NEAR * .7;
          const settle = Math.min(1, (t - BOOP_S) / CARPET_LAND_S);
          const trot = Math.min(1, Math.max(0, (t - BOOP_S - CARPET_LAND_S) / TROT_S));
          if (trot === 0) {
            // Absorb the landing on the carpet in place.
            x = target[0]; z = target[2]; y = FLOOR_Y;
            nextClip = 'Land';
            squash = Math.sin(settle * Math.PI) * .17;
            desiredHeading = Math.atan2(stopX - target[0], stopZ - target[2]);
          } else {
            // Trot: ease out into the stop, with a four-beat stride bob.
            const e = 1 - (1 - trot) * (1 - trot);
            x = target[0] + (stopX - target[0]) * e;
            z = target[2] + (stopZ - target[2]) * e;
            const stride = t - BOOP_S - CARPET_LAND_S;
            y = FLOOR_Y + Math.abs(Math.sin(stride * Math.PI * 2 * 1.6)) * .05 * (1 - trot * .6);
            desiredHeading = Math.atan2(stopX - target[0], stopZ - target[2]);
            nextClip = trot < 1 ? 'Walk' : 'Sit';
          }
          if (trot >= 1) {
            // A short look up at the box before the hop, so the trip reads.
            nextClip = 'Sit';
            desiredHeading = SETTLE_HEADING;
            const handoffAt = BOOP_S + CARPET_LAND_S + TROT_S + LOOK_UP_S;
            if (t >= handoffAt && !flightSent.current && g.parent) {
              flightSent.current = true;
              const screen = g.parent.localToWorld(new THREE.Vector3(stopX, FLOOR_Y + .35, stopZ)).project(camera);
              const rect = gl.domElement.getBoundingClientRect();
              requestFlight(piece, {x: rect.left + (screen.x + 1) / 2 * rect.width, y: rect.top + (1 - screen.y) / 2 * rect.height});
            }
            g.visible = !flightSent.current;
          }
        }
      }
    } else if (isNew && elapsed < WALK_IN_S) {
      // Stroll in along the arc, then settle and sit.
      const t = elapsed / WALK_IN_S;
      const e = easeOut(t < .85 ? t : .85 + (t - .85) * 2); // decelerate into the seat
      x = qbez(walkFrom[0], walkCtrl[0], target[0], Math.min(1, e));
      z = qbez(walkFrom[2], walkCtrl[2], target[2], Math.min(1, e));
      y += Math.abs(Math.sin(elapsed * 11)) * .035; // bouncy kitten step
      const tx = qbez(walkFrom[0], walkCtrl[0], target[0], Math.min(1, e + .02));
      const tz = qbez(walkFrom[2], walkCtrl[2], target[2], Math.min(1, e + .02));
      // The tangent degenerates once the path is complete; keep the settle heading.
      if (Math.hypot(tx - x, tz - z) > 1e-4) desiredHeading = Math.atan2(tx - x, tz - z);
      nextClip = 'Walk';
    } else if (isGraduating) {
      nextClip = 'Celebrate';
    }

    setClip(previous => (previous === nextClip ? previous : nextClip));

    // Ease the heading; never snap.
    heading.current += shortestTurn(heading.current, desiredHeading) * Math.min(1, delta * 12);
    g.position.set(x, y, z);
    g.rotation.y = heading.current;

    const breathe = 1 + Math.sin(performance.now() / 900 + seed * 20) * .006;
    const squashY = 1 - squash + stretch * .18;
    const squashXZ = 1 + squash - stretch * .12;
    let scale = scaleBase;
    if (isGraduating) scale *= 1 + Math.sin(performance.now() / 90) * .05;
    if (removing && removalStarted.current !== null) {
      const removalElapsed = (performance.now() - removalStarted.current) / 1000;
      g.position.y = target[1] + 6 * Math.pow(Math.min(1, removalElapsed / .7), 1.3);
    }
    g.scale.set(scale * breathe * squashXZ, scale / breathe * squashY, scale * breathe * squashXZ);
  });

  return (
    <><group ref={group} position={target} renderOrder={isGhost ? -1 : 1}
      userData={{ catProbe: isGhost ? 'ghost' : `${piece.color}-${piece.type}-${row}-${col}` }}>
      <CatModel piece={piece} ghost={isGhost} clip={isGhost ? 'Sit' : clip} />
      {isGraduating && (
        <pointLight color="#ffd76a" intensity={2.2} distance={2.4} position={[0, 1.25, 0]} />
      )}
      {isGhost && <Html center position={[0, 2.15, 0]} style={{ pointerEvents: 'none' }}>
        <span className="kitten-preview-label">Preview</span>
      </Html>}
    </group>
    </>
  );
}

/** A screen-space final hop crosses canvas boundaries on stacked phone layouts.
 * It uses the same animated model and lands exactly over the inventory portrait. */
function InventoryJump({piece, from}: {piece: PieceData; from: {x: number; y: number}}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const icon = document.querySelector(`[data-pool-target="${piece.color}-${piece.type}"] .animated-piece-icon`);
    if (!icon || !element.current) return;
    const target = icon.getBoundingClientRect();
    const animation = element.current.animate([
      { transform: `translate(${from.x - target.width / 2}px, ${from.y - target.height / 2}px)`, width: `${target.width}px`, height: `${target.height}px`, opacity: 1 },
      { transform: `translate(${(from.x + target.left + target.width / 2) / 2 - target.width / 2}px, ${Math.min(from.y, target.top) - 80}px)`, offset: .55 },
      { transform: `translate(${target.left}px, ${target.top}px)`, width: `${target.width}px`, height: `${target.height}px`, opacity: 0 }
    ], {duration: 650, easing: 'ease-in-out', fill: 'forwards'});
    return () => animation.cancel();
  }, [piece.color, piece.type, from]);
  // Portal to <body> so viewport coordinates survive any transformed or
  // overflowing ancestor. Safe here: this runs in the react-dom tree.
  return createPortal(<div ref={element} style={{position: 'fixed', left: 0, top: 0, zIndex: 40, pointerEvents: 'none'}}><AnimatedPieceIcon piece={piece} /></div>, document.body);
}

/** Graduation payoff follows the ascent; arrivals are real animated cats,
 * not screen-space icons. A single-piece graduation receives one cat. */
function ReserveArrival({ color, index }: { color: PlayerColor; index: number }) {
  const group = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const started = useRef(performance.now());
  const [clip, setClip] = useState('Jump');
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = (performance.now() - started.current) / 1000 - .7 - index * .12;
    g.visible = t >= 0 && t < 1.15;
    if (t < 0) return;
    const destination = poolDestination(color, 'cat', camera, gl, g.parent);
    if (!destination) return;
    const { x: bx, y: by, z: bz } = destination.portrait;
    const fall = Math.min(1, t / .65);
    const offset = (index - 1) * .34;
    const landed = t >= .65;
    g.position.set(bx + offset, by + (1 - fall * fall) * 7 + (landed ? Math.sin(Math.min(1, (t - .65) / .2) * Math.PI) * .07 : 0), bz - .12);
    g.rotation.y = SETTLE_HEADING;
    const squash = landed ? Math.sin(Math.min(1, (t - .65) / .2) * Math.PI) * .15 : 0;
    const settle = t > .95 ? Math.max(0, 1 - (t - .95) / .2) : 1;
    g.scale.set(.52 * (1 + squash) * settle, .52 * (1 - squash) * settle, .52 * (1 + squash) * settle);
    const next = landed ? 'Land' : 'Jump';
    setClip(previous => previous === next ? previous : next);
  });
  return <group ref={group} visible={false} userData={{ catProbe: `arrival-${color}-${index}` }}><CatModel piece={{color, type: 'cat'}} clip={clip} /></group>;
}

/** A 3D crash must never take the whole page down. A lost WebGL context or an
 * unreachable environment map degrades to an empty board instead of a blank
 * screen, and the game UI around it keeps working. */
class BoardErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error('3D board failed to render', error); }
  render() {
    if (this.state.failed) return <div className="board-fallback" role="alert">3D board unavailable — reload to try again.</div>;
    return this.props.children;
  }
}

type QuiltResources = ReturnType<typeof createFabricTextures> & {
  patch: THREE.BufferGeometry;
  stitches: THREE.BufferGeometry;
};

function QuiltCell({ row, col, enabled, active, hovered, colors, fabric, onClick, onHover }: {
  row: number; col: number; enabled: boolean; active: boolean; hovered: boolean;
  colors: QuiltColors; fabric: QuiltResources;
  onClick: () => void; onHover: (value: boolean) => void;
}) {
  const [x, , z] = at(row, col);
  const shade = colors[(row + col) % 2];
  const color = quiltColor(shade, hovered && enabled, active);
  const threadColor = new THREE.Color(shade).multiplyScalar(.66);
  return (
    <group position={[x, .36, z]}>
      <mesh geometry={fabric.patch}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(true); document.body.style.cursor = enabled ? 'pointer' : 'default'; }}
        onPointerLeave={() => { onHover(false); document.body.style.cursor = 'default'; }}
        castShadow receiveShadow>
        <meshStandardMaterial color={color} map={fabric.map} bumpMap={fabric.bumpMap}
          bumpScale={.018} roughness={.98} metalness={0} />
      </mesh>
      <lineSegments geometry={fabric.stitches} raycast={() => {}}>
        <lineBasicMaterial color={threadColor} transparent opacity={.36} depthWrite={false} />
      </lineSegments>
      {(active || (hovered && enabled)) && (
        <mesh position={[0, .10, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
          <ringGeometry args={[.28, .30, 40]} />
          <meshBasicMaterial color="#c4d2c9" transparent opacity={hovered && enabled ? .18 : .14} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/** Maintainer/QA hook: live cat transform probe (window.__catProbe()) and
 * exact on-screen cell centers (window.__cellScreen(row, col)). */
function CatProbe() {
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const size = useThree(state => state.size);
  const gl = useThree(state => state.gl);
  useEffect(() => {
    (window as unknown as { __catProbe?: () => { cat: string; x: number; y: number; z: number; ry: number; pxPerUnit: number; visible: boolean }[] }).__catProbe = () => {
      const out: { cat: string; x: number; y: number; z: number; ry: number; pxPerUnit: number; visible: boolean }[] = [];
      const rect = gl.domElement.getBoundingClientRect();
      scene.traverse(o => {
        const tag = o.userData?.catProbe;
        if (typeof tag === 'string' && o.parent) {
          // pxPerUnit makes "how big does the cat look" measurable instead of
          // a matter of opinion: one world unit at the cat's own position.
          const world = o.parent.localToWorld(new THREE.Vector3(o.position.x, o.position.y, o.position.z));
          const top = world.clone().setY(world.y + 1).project(camera);
          const bottom = world.clone().project(camera);
          const pxPerUnit = Math.abs((top.y - bottom.y)) * rect.height / 2;
          out.push({ cat: tag, x: +o.position.x.toFixed(3), y: +o.position.y.toFixed(3),
            z: +o.position.z.toFixed(3), ry: +o.rotation.y.toFixed(3),
            pxPerUnit: +pxPerUnit.toFixed(1), visible: o.visible });
        }
      });
      return out;
    };
    (window as unknown as { __cellScreen?: (row: number, col: number) => { x: number; y: number } }).__cellScreen = (row, col) => {
      const rect = gl.domElement.getBoundingClientRect();
      const v = new THREE.Vector3((col - 2.5) * 1.06, .42, (row - 2.5) * 1.06).project(camera);
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
    };
    return () => {
      const w = window as unknown as { __catProbe?: unknown; __cellScreen?: unknown };
      delete w.__catProbe; delete w.__cellScreen;
    };
  }, [scene, camera, size, gl]);
  return null;
}

/** The bed itself: turned legs, a wooden rail box, a soft mattress, a quilt
 * with a draped hem on all four sides, and a low headboard behind row 0.
 * Playable cells stay on the quilt top (y .36) exactly where they were. */
function BedShell({ quiltColors, fabric }: { quiltColors: QuiltColors; fabric: QuiltResources }) {
  const quilt = new THREE.Color(quiltColors[0]);
  const quiltShade = quilt.clone().multiplyScalar(.82);
  const trim = new THREE.Color(quiltColors[1]).multiplyScalar(.58);
  const cushion = new THREE.Color(quiltColors[1]).lerp(new THREE.Color('#f3e9da'), .55);
  const wood = '#75492a';
  const woodLight = '#9a6a41';
  const woodDark = '#553218';

  // A drape hangs from the quilt edge (y .30) and flares outward slightly.
  const drapes: { key: string; at: [number, number, number]; rot: [number, number, number]; box: [number, number, number] }[] = [
    { key: 'near', at: [0, .36, 3.58], rot: [.1, 0, 0], box: [7.06, .66, .13] },
    { key: 'far', at: [0, .36, -3.58], rot: [-.1, 0, 0], box: [7.06, .66, .13] },
    { key: 'right', at: [3.58, .36, 0], rot: [0, 0, -.1], box: [.13, .66, 7.06] },
    { key: 'left', at: [-3.58, .36, 0], rot: [0, 0, .1], box: [.13, .66, 7.06] },
  ];

  return (
    <group>
      {/* Four turned legs with a small brass-free foot. */}
      {[-3.24, 3.24].flatMap(x => [-3.24, 3.24].map(z => (
        <group key={`leg-${x}-${z}`} position={[x, 0, z]}>
          <mesh position={[0, -.85, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[.11, .15, .48, 16]} />
            <meshStandardMaterial color={wood} roughness={.62} metalness={.02} />
          </mesh>
          <mesh position={[0, -1.08, 0]} castShadow>
            <cylinderGeometry args={[.16, .14, .1, 16]} />
            <meshStandardMaterial color={woodDark} roughness={.7} />
          </mesh>
        </group>
      )))}

      {/* Rail box the mattress sits in; its top sits just under the quilt hem. */}
      <RoundedBox args={[7.0, .3, 7.0]} radius={.13} smoothness={4} position={[0, -.47, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={wood} roughness={.6} metalness={.03} />
      </RoundedBox>
      <RoundedBox args={[7.04, .07, 7.04]} radius={.06} smoothness={3} position={[0, -.35, 0]} castShadow>
        <meshStandardMaterial color={woodLight} roughness={.55} />
      </RoundedBox>

      {/* Mattress: soft, pillowy, and just inside the quilt edge. */}
      <RoundedBox args={[6.62, .62, 6.62]} radius={.22} smoothness={5} position={[0, .0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#f2e9da" roughness={.97} />
      </RoundedBox>

      {/* Quilt top: the playable surface. */}
      <RoundedBox args={[7.04, .16, 7.04]} radius={.09} smoothness={4} position={[0, .28, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={quilt} map={fabric.map} bumpMap={fabric.bumpMap}
          bumpScale={.014} roughness={.98} />
      </RoundedBox>
      {/* Drapes and their darker hems. */}
      {drapes.map(drape => (
        <group key={drape.key} position={drape.at} rotation={drape.rot}>
          <mesh position={[0, -.33, 0]} castShadow receiveShadow>
            <boxGeometry args={drape.box} />
            <meshStandardMaterial color={quiltShade} map={fabric.map} bumpMap={fabric.bumpMap}
              bumpScale={.012} roughness={.99} />
          </mesh>
          <mesh position={[0, -.70, 0]} castShadow>
            <boxGeometry args={[drape.box[0] + .04, .1, drape.box[2] + .05]} />
            <meshStandardMaterial color={trim} roughness={.95} />
          </mesh>
        </group>
      ))}

      {/* Headboard behind the far row: posts, rail, and an upholstered panel. */}
      {[-3.3, 3.3].map(x => (
        <group key={`post-${x}`} position={[x, 0, -3.92]}>
          <mesh position={[0, .34, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[.13, .16, 1.5, 18]} />
            <meshStandardMaterial color={wood} roughness={.58} />
          </mesh>
          <mesh position={[0, 1.16, 0]} castShadow>
            <sphereGeometry args={[.14, 18, 14]} />
            <meshStandardMaterial color={woodLight} roughness={.5} />
          </mesh>
        </group>
      ))}
      <RoundedBox args={[6.72, .28, .2]} radius={.09} position={[0, 1.0, -3.92]} castShadow>
        <meshStandardMaterial color={woodLight} roughness={.55} />
      </RoundedBox>
      <RoundedBox args={[6.5, .62, .16]} radius={.12} position={[0, .56, -3.9]} castShadow receiveShadow>
        <meshStandardMaterial color={cushion} map={fabric.map} bumpMap={fabric.bumpMap}
          bumpScale={.02} roughness={.95} />
      </RoundedBox>
      <RoundedBox args={[6.86, .2, .2]} radius={.08} position={[0, .18, -3.88]} castShadow>
        <meshStandardMaterial color={wood} roughness={.6} />
      </RoundedBox>

      {/* Low footboard: below quilt level, so it never hides the near row. */}
      <RoundedBox args={[7.5, .5, .2]} radius={.1} position={[0, -.02, 3.9]} castShadow receiveShadow>
        <meshStandardMaterial color={woodLight} roughness={.6} />
      </RoundedBox>
    </group>
  );
}

// Fixed viewing direction and a distance that fills the shell. The board is a
// fixed-size object in a fixed shell; letting the camera drift made it look
// small and dim, so zoom is gone and framing is derived from the aspect ratio.
const BOARD_VIEW_DIR = new THREE.Vector3(9.2, 10.8, 12).normalize();
const BOARD_DISTANCE = 12.6;

function FrameBoard() {
  const camera = useThree(state => state.camera);
  const size = useThree(state => state.size);
  const controls = useThree(state => state.controls) as { update?: () => void } | null;
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    // Stacked/portrait shells have less width, so stand further back to keep
    // the whole bed (headboard included) inside the frame.
    const distance = BOARD_DISTANCE * (aspect < 1.3 ? 1.3 / aspect : 1);
    camera.position.copy(BOARD_VIEW_DIR).multiplyScalar(distance);
    camera.lookAt(0, .18, 0);
    camera.updateProjectionMatrix();
    controls?.update?.();
  }, [camera, size.width, size.height, controls]);
  return null;
}

function Scene(props: FloatingBoard3DProps & { quiltColors: QuiltColors }) {
  const [hover, setHover] = useState<Cell | null>(null);
  const fabric = useMemo(() => ({ ...createFabricTextures(), patch: createQuiltPatchGeometry(), stitches: createQuiltStitches() }), []);
  useEffect(() => () => {
    fabric.map.dispose(); fabric.bumpMap.dispose(); fabric.patch.dispose(); fabric.stitches.dispose();
  }, [fabric]);
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  const boopTo = (row: number, col: number) => {
    const effect = props.boopedPieces.find(b => b.to?.row === row && b.to?.col === col);
    return effect ? { fromRow: effect.from.row, fromCol: effect.from.col } : undefined;
  };
  return (
    <>
      <FrameBoard />
      <ambientLight intensity={2.55} />
      <directionalLight position={[-5, 9, 4]} intensity={2.0} color="#ffffff" />
      <directionalLight position={[6, 4, -5]} intensity={1.8} color="#ffffff" />
      <group>
        <group rotation={[0, -.08, 0]}>
          <BedShell quiltColors={props.quiltColors} fabric={fabric} />
          {Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, col) => {
            const piece = props.board[row][col];
            const enabled = !piece && props.isMyTurn && !!props.selectedPieceType && !props.isViewingHistory;
            return <QuiltCell key={`${row}-${col}`} row={row} col={col} enabled={enabled}
              active={(props.lastMove?.row === row && props.lastMove?.col === col) || (props.highlightedCell?.row === row && props.highlightedCell?.col === col)}
              hovered={hover?.row === row && hover?.col === col}
              colors={props.quiltColors} fabric={fabric}
              onHover={value => setHover(previous => value ? { row, col } : previous?.row === row && previous?.col === col ? null : previous)}
              onClick={() => props.onCellClick(row, col)} />;
          }))}
          {props.board.map((line, row) => line.map((piece, col) => piece && (
            <CatActor key={`${row}-${col}-${piece.color}-${piece.type}`} piece={piece} row={row} col={col}
              boop={boopTo(row, col)} isNew={props.lastMove?.row === row && props.lastMove?.col === col && !boopTo(row, col)}
              isGraduating={props.graduatingPieces.some(g => g.row === row && g.col === col) && props.graduationPhase === 'highlighting'}
              removing={props.graduatingPieces.some(g => g.row === row && g.col === col) && props.graduationPhase === 'removing'}
              animationKey={props.animationKey} />
          )))}
          {hover && props.isMyTurn && !props.isViewingHistory && props.myColor && props.selectedPieceType && !props.board[hover.row][hover.col] && (
            <CatActor piece={{ color: props.myColor, type: props.selectedPieceType }} row={hover.row} col={hover.col}
              isGhost animationKey={props.animationKey} />
          )}
          {props.graduationPhase === 'removing' && props.graduatingPieces.map((piece, index) => (
            <ReserveArrival key={`arrival-${props.animationKey}-${index}`} color={piece.piece.color} index={index} />
          ))}
          {props.fallenPieces.map((fallen, i) => (
            <CatActor key={`fallen-${i}-${props.animationKey}`} piece={fallen.piece} row={fallen.gutterRow} col={fallen.gutterCol}
              boop={{ fromRow: fallen.fromRow, fromCol: fallen.fromCol }} animationKey={props.animationKey} />
          ))}
        </group>
      </group>
      {/* The page-wide carpet is behind the transparent canvas, without a
          second floor surface creating a rectangular visual division. */}
      <Environment preset="apartment" environmentIntensity={.7} />
      {/* Zoom stays off: the board is framed to its shell, so there is nothing
          to discover by scrolling and no way to end up small and fogged out. */}
      <OrbitControls makeDefault enablePan={false} enableZoom={false}
        minPolarAngle={.52} maxPolarAngle={1.16} minAzimuthAngle={-.75} maxAzimuthAngle={.75}
        target={[0, .18, 0]} />
    </>
  );
}

export function FloatingBoard3D(props: FloatingBoard3DProps) {
  useEffect(() => {
    const update = () => {
      const pools = [...document.querySelectorAll('[data-pool-target]')];
      const opponent = document.querySelector('.game-pool-opponent');
      const relevant = window.innerWidth >= 1280 ? pools : [...(opponent?.querySelectorAll('[data-pool-target]') ?? [])];
      const bottom = Math.max(...relevant.map(el => el.getBoundingClientRect().bottom));
      if (Number.isFinite(bottom)) document.body.style.setProperty('--carpet-top', `${Math.max(0, bottom + window.scrollY + 8)}px`);
    };
    update(); window.addEventListener('resize', update);
    const observer = new ResizeObserver(update); document.querySelectorAll('.player-pool').forEach(el => observer.observe(el));
    return () => { observer.disconnect(); window.removeEventListener('resize', update); document.body.style.removeProperty('--carpet-top'); };
  }, []);
  const [quiltColors, setQuiltColors] = useState<QuiltColors>(readQuiltColors);
  useEffect(() => {
    try { localStorage.setItem(QUILT_STORAGE_KEY, JSON.stringify(quiltColors)); }
    catch { /* Preferences still work in memory when storage is unavailable. */ }
  }, [quiltColors]);
  // Inventory hops live here, in the DOM tree, and expire once the hop lands.
  const [flights, setFlights] = useState<InventoryFlight[]>([]);
  const flightId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const requestFlight = useCallback<RequestInventoryFlight>((piece, from) => {
    const id = ++flightId.current;
    setFlights(previous => [...previous, { id, piece, from }]);
    timers.current.push(setTimeout(() => {
      setFlights(previous => previous.filter(flight => flight.id !== id));
    }, 800));
  }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  return (
    <div className="floating-board-area">
    <div className="floating-board-shell">
      <BoardErrorBoundary>
      <Canvas shadows dpr={[1, 1.7]} camera={{ position: [9.2, 10.8, 12], fov: 46 }} gl={{ antialias: true, alpha: true }}>
        <Suspense fallback={null}>
          <CatProbe />
          <InventoryFlightContext.Provider value={requestFlight}>
            <Scene {...props} quiltColors={quiltColors} />
          </InventoryFlightContext.Provider>
        </Suspense>
      </Canvas>
      </BoardErrorBoundary>
      {flights.map(flight => <InventoryJump key={flight.id} piece={flight.piece} from={flight.from} />)}
      <div className="board-hint">Drag to look around</div>
      <div className="board-cell-anchors" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => <span key={i} data-cell={`${Math.floor(i / 6)}-${i % 6}`} />)}
      </div>
      {props.isViewingHistory && <div className="history-3d-badge">Viewing game history · click a square to return</div>}
    </div>
    <fieldset className="quilt-palette">
      <legend>Quilt colors</legend>
      <div className="quilt-palette-controls">
        {quiltColors.map((color, index) => (
          <label key={index} className="quilt-color-control">
            <input type="color" aria-label={`Quilt color ${index + 1}`} value={color}
              onChange={event => {
                const next = event.currentTarget.value;
                setQuiltColors(previous => index === 0 ? [next, previous[1]] : [previous[0], next]);
              }} />
            <span>Fabric {index + 1}</span>
          </label>
        ))}
        <button type="button" className="quilt-reset" onClick={() => setQuiltColors([...DEFAULT_QUILT_COLORS])}>Reset colors</button>
      </div>
    </fieldset>
    </div>
  );
}

useGLTF.preload('/assets/models/boop-kitten.glb');
useGLTF.preload('/assets/models/boop-cat.glb');

/** Pool portraits use the exact board model, rig and idle/blink clips. */
export function AnimatedPieceIcon({ piece }: { piece: PieceData }) {
  return <span className="animated-piece-icon" aria-hidden="true"><Canvas dpr={[1, 1.5]} camera={{ position: [1.3, 1.1, 2], fov: 30 }} gl={{ alpha: true }}>
    <ambientLight intensity={1.5} /><directionalLight position={[3, 5, 4]} intensity={2} />
    <Suspense fallback={null}><group position={[0, -.45, 0]} rotation={[0, SETTLE_HEADING, 0]} scale={piece.type === 'cat' ? 1.1 : 1}><CatModel piece={piece} /></group></Suspense>
  </Canvas></span>;
}

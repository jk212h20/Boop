import { createPortal } from 'react-dom';
import { Component, Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Environment, Html, Lightformer, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Board as BoardType, BoopEffect, Cell, Piece as PieceData, PieceType, PlayerColor } from '../types';
import { GraduatingPiece, FallenPiece } from './Board';
import { ensurePortraits, portraitUrl, subscribePortraits } from '../rendering/portraits';
import { createCatScene, createContactShadowTexture, createRadialAlphaTexture, createFabricTextures, createQuiltPatchGeometry, createQuiltStitches,
  QUILT_STORAGE_KEY, QuiltColors, quiltColor, readQuiltColors } from '../rendering/boardAppearance';
import { BOOP_DELAY_MS, GRADUATION_HIGHLIGHT_MS, PLACEMENT_DROP_MS } from '../animationTiming';
import { prefersReducedMotion } from '../rendering/motion';

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
// Stable identity: react-three-fiber re-applies camera options when the object
// changes, and a re-applied position would throw away the player's orbit.
const BOARD_CAMERA = { position: [9.2, 10.8, 12] as [number, number, number], fov: 46 };
const BOARD_GL = { antialias: true, alpha: true };

interface InventoryFlight { id: number; piece: PieceData }
type RequestInventoryFlight = (piece: PieceData) => void;
const InventoryFlightContext = createContext<RequestInventoryFlight>(() => {});

function CatModel({ piece, ghost = false, clip = 'Sit', seed = 0 }: { piece: PieceData; ghost?: boolean; clip?: string; seed?: number }) {
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
  // Idle life: small procedural head/tail/ear motion layered on top of the clip
  // so eight cats on one board do not breathe and sit in lockstep.
  const rig = useMemo(() => ({
    head: cloned.getObjectByName('head') ?? null,
    tail: cloned.getObjectByName('tail0') ?? null,
    earL: cloned.getObjectByName('ear.L') ?? null,
    earR: cloned.getObjectByName('ear.R') ?? null,
  }), [cloned]);
  const applied = useRef({ head: new THREE.Vector3(), tail: 0, earL: 0, earR: 0 });

  useFrame((_, delta) => {
    if (!mixer) return;
    if (prefersReducedMotion()) return; // no breathing, glances or blinks
    // Take our previous offsets back out so the clip drives from its own pose.
    const a = applied.current;
    if (rig.head) { rig.head.rotation.x -= a.head.x; rig.head.rotation.y -= a.head.y; rig.head.rotation.z -= a.head.z; }
    if (rig.tail) rig.tail.rotation.y -= a.tail;
    if (rig.earL) rig.earL.rotation.z -= a.earL;
    if (rig.earR) rig.earR.rotation.z -= a.earR;
    mixer.update(delta);

    const seconds = performance.now() / 1000;
    const atEase = clip === 'Sit' || clip === 'Stand';
    let headYaw = 0, headPitch = 0, tailYaw = 0, earL = 0, earR = 0;
    if (atEase) {
      const phase = seconds * .55 + seed * 11;
      // Slow drift plus an occasional deliberate glance around the room.
      const glance = Math.sin(seconds * .21 + seed * 23);
      headYaw = Math.sin(phase) * .09 + Math.sign(glance) * Math.pow(Math.abs(glance), 6) * .3;
      headPitch = Math.sin(phase * .7) * .035;
      tailYaw = Math.sin(seconds * 1.25 + seed * 7) * .22;
      const flick = Math.max(0, Math.sin(seconds * 1.7 + seed * 29) - .97) * 22;
      earL = flick * .06; earR = flick * .05;
    }
    if (rig.head) { rig.head.rotation.y += headYaw; rig.head.rotation.x += headPitch; }
    if (rig.tail) rig.tail.rotation.y += tailYaw;
    if (rig.earL) rig.earL.rotation.z += earL;
    if (rig.earR) rig.earR.rotation.z += earR;
    a.head.set(headPitch, headYaw, 0); a.tail = tailYaw; a.earL = earL; a.earR = earR;

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
// A placed piece is dropped straight down onto its square, never walked in.
const DROP_S = PLACEMENT_DROP_MS / 1000;
const DROP_FALL_S = .42;   // everything above this is the fall itself
const DROP_FROM_Y = 2.7;   // how high the piece starts above its cell
const BOOP_DELAY_S = BOOP_DELAY_MS / 1000;
const BOOP_S = .8; // crouch, airborne arc, and the fall onto the carpet
const FLOOR_Y = -1.03;
// Return trip to the inventory portrait: absorb the landing, trot over, look
// up, and only then hand off to the short screen-space hop into the box.
const CARPET_LAND_S = .24;
// A trot on the carpet, paced by distance so a long run does not become a
// sprint. The cat keeps going until it is on the carpet directly under the
// box it belongs in, then hops in from there.
const TROT_SPEED = 3.9; // world units per second
const TROT_MIN_S = .9;
const TROT_MAX_S = 3.6;
// No sit-and-look-up at the end of the run: the trot flows into a crouch and
// a leap that carries the kitten clear out of the frame, and it comes back
// down into its box from above. A stop with no exit read as a pause near the
// top of the screen.
const LEAP_CROUCH_S = .16;
const LEAP_RISE_S = .6;
const LEAP_HEIGHT = 9;   // world units up; clears the canvas top from the carpet
// Safety clamp for layouts where a pool sits above the canvas and its floor
// ray would otherwise run off the far end of the room.
const MAX_RUN = 16;
// Project the actual inventory portrait into this scene; no invented boxes.
function poolDestination(color: PlayerColor, type: PieceType, camera: THREE.Camera, gl: THREE.WebGLRenderer, parent: THREE.Object3D | null) {
  const box = document.querySelector(`[data-pool-target="${color}-${type}"]`);
  const icon = box?.querySelector('.animated-piece-icon');
  if (!box || !icon || !parent) return null;
  const boxRect = box.getBoundingClientRect(), iconRect = icon.getBoundingClientRect();
  const canvas = gl.domElement.getBoundingClientRect();
  const toNdc = (clientX: number, clientY: number) => new THREE.Vector2(
    (clientX - canvas.left) / canvas.width * 2 - 1,
    1 - (clientY - canvas.top) / canvas.height * 2
  );
  const centre = toNdc(iconRect.left + iconRect.width / 2, iconRect.top + iconRect.height / 2);
  // The run finishes on the carpet just below the whole pool panel, not below
  // its icon: the floor point under the icon is still behind the panel's own
  // background, so the kitten would be swallowed by the panel. The gap leaves
  // room for the whole standing cat under the panel, on the visible carpet.
  const foot = toNdc(boxRect.left + boxRect.width / 2, boxRect.bottom + 44);
  const ray = new THREE.Raycaster(); ray.setFromCamera(foot, camera);
  const floor = new THREE.Vector3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR_Y), floor)) return null;
  parent.worldToLocal(floor);
  const landing = floor.clone();
  const radial = Math.hypot(landing.x, landing.z);
  if (radial > MAX_RUN) {
    landing.x *= MAX_RUN / radial;
    landing.z *= MAX_RUN / radial;
  }
  // Jump ends precisely at the portrait's screen center, at board-depth.
  const depth = new THREE.Vector3(0, 0, 0).project(camera).z;
  const portrait = parent.worldToLocal(new THREE.Vector3(centre.x, centre.y, depth).unproject(camera));
  return { landing, portrait };
}
const CROUCH_F = .19, AIR_F = .52; // remaining fraction of the boop is landing
const SETTLE_HEADING = Math.atan2(9.2, 12); // face the default camera (~37°)

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const shortestTurn = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

function CatActor({ piece, row, col, boop, isNew, isGhost, isGraduating, removing, animationKey }: CatActorProps) {
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);
  const { camera, gl } = useThree();
  const born = useRef(performance.now());
  const removalStarted = useRef<number | null>(null);
  const graduationStarted = useRef<number | null>(null);
  const heading = useRef(SETTLE_HEADING);
  const seed = useMemo(() => (((row + 2) * 17 + (col + 3) * 31 + piece.color.length * 7) % 23) / 23, [row, col, piece.color]);
  const offBoard = row < 0 || row > 5 || col < 0 || col > 5;
  const target = at(row, col);
  const origin = boop ? at(boop.fromRow, boop.fromCol) : target;
  // Coordinate values, not freshly allocated boop prop objects, own the clock.
  useEffect(() => { born.current = performance.now(); }, [animationKey, boop?.fromRow, boop?.fromCol, isNew]);
  useEffect(() => {
    removalStarted.current = removing ? performance.now() : null;
  }, [removing, animationKey]);
  // The glow and the rise are one performance: the glow eases in with the
  // highlight (no scale or light pop on its first frame) and stays lit while
  // the kitten ascends, fading only as it leaves.
  useEffect(() => {
    graduationStarted.current = isGraduating ? performance.now() : null;
  }, [isGraduating, animationKey]);

  const [clip, setClip] = useState('Sit');
  const requestFlight = useContext(InventoryFlightContext);
  const flightSent = useRef(false);
  const settleHeading = SETTLE_HEADING + (seed - .5) * .7;
  const scaleBase = piece.type === 'cat' ? .65 : .55;

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    if (prefersReducedMotion()) {
      // No walk, no arc, no tumble: pieces simply are where they are.
      g.rotation.set(0, settleHeading, 0);
      g.position.set(target[0], target[1], target[2]);
      g.scale.setScalar(scaleBase);
      g.visible = !offBoard && !(removing && removalStarted.current !== null);
      setClip('Sit');
      return;
    }
    const elapsed = (performance.now() - born.current) / 1000;
    let x = target[0], y = target[1], z = target[2];
    let desiredHeading = settleHeading;
    let nextClip = 'Sit';
    let squash = 0, stretch = 0, roll = 0;

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
          // The run ends on the carpet directly under this piece's own box, so
          // the final hop is a short jump into the box rather than a long
          // screen-space travel from the middle of the room.
          const stopX = destination.landing.x;
          const stopZ = destination.landing.z;
          const runDistance = Math.hypot(stopX - target[0], stopZ - target[2]);
          const trotSeconds = Math.max(TROT_MIN_S, Math.min(TROT_MAX_S, runDistance / TROT_SPEED));
          const settle = Math.min(1, (t - BOOP_S) / CARPET_LAND_S);
          const trot = Math.min(1, Math.max(0, (t - BOOP_S - CARPET_LAND_S) / trotSeconds));
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
            x = stopX; z = stopZ;
            desiredHeading = SETTLE_HEADING;
            const sinceStop = t - (BOOP_S + CARPET_LAND_S + trotSeconds);
            if (sinceStop < LEAP_CROUCH_S) {
              // Gather itself on the carpet — a beat, not a pause: the leap
              // starts on the next frame.
              y = FLOOR_Y;
              nextClip = 'Land';
              squash = Math.sin((sinceStop / LEAP_CROUCH_S) * Math.PI) * .2;
            } else {
              const p = Math.min(1, (sinceStop - LEAP_CROUCH_S) / LEAP_RISE_S);
              y = FLOOR_Y + LEAP_HEIGHT * p * p;
              nextClip = 'Jump';
              // Hand off only once the leap has actually left the frame, so the
              // piece is never frozen in view waiting for the next step.
              if (p >= 1 && !flightSent.current && g.parent) {
                flightSent.current = true;
                requestFlight(piece);
              }
              g.visible = !flightSent.current;
            }
          }
        }
      }
    } else if (isNew && elapsed < DROP_S) {
      // Straight down onto the square: gravity on the way, a soft absorb on
      // landing, then it sits. No lateral travel, so it always lands where the
      // player clicked.
      x = target[0];
      z = target[2];
      if (elapsed < DROP_FALL_S) {
        const p = elapsed / DROP_FALL_S;
        y = target[1] + DROP_FROM_Y * (1 - p * p);
        nextClip = 'Fall';
        stretch = Math.sin(p * Math.PI) * .5; // slight stretch as it drops
        // A hair of spin so it does not look like a rigid prop on a rail.
        desiredHeading = settleHeading - .35 + .7 * p;
      } else {
        const p = Math.min(1, (elapsed - DROP_FALL_S) / (DROP_S - DROP_FALL_S));
        squash = Math.sin(p * Math.PI) * .2;
        y = target[1] + Math.sin(p * Math.PI) * .045; // small rebound
        nextClip = 'Land';
      }
    } else if (isGraduating) {
      nextClip = 'Celebrate';
    }

    setClip(previous => (previous === nextClip ? previous : nextClip));

    // Ease the heading; never snap.
    heading.current += shortestTurn(heading.current, desiredHeading) * Math.min(1, delta * 12);
    g.position.set(x, y, z);
    g.rotation.y = heading.current;
    g.rotation.z = roll;

    const now = performance.now();
    const glowStart = graduationStarted.current;
    const glowIn = glowStart === null ? 0 : Math.min(1, (now - glowStart) / 220);
    // Milliseconds (performance.now) over a 700ms ascent.
    const rise = removing && removalStarted.current !== null
      ? Math.min(1, (now - removalStarted.current) / 700)
      : 0;
    const breathe = 1 + Math.sin(now / 900 + seed * 20) * .006;
    const squashY = 1 - squash + stretch * .18;
    const squashXZ = 1 + squash - stretch * .12;
    let scale = scaleBase;
    if (isGraduating) {
      // Amplitude ramps in and then eases out with the ascent, so the pulse
      // never jumps on or fights the rise.
      const pulse = Math.sin(now / 90) * .05 * glowIn * (1 - rise * .75);
      scale *= 1 + pulse;
    }
    if (removing && removalStarted.current !== null) {
      g.position.y = target[1] + 6 * Math.pow(rise, 1.3);
    }
    if (glow.current) glow.current.intensity = isGraduating ? 2.2 * glowIn * (1 - rise) : 0;
    g.scale.set(scale * breathe * squashXZ, scale / breathe * squashY, scale * breathe * squashXZ);
  });

  return (
    <><group ref={group} position={target} renderOrder={isGhost ? -1 : 1}
      userData={{ catProbe: isGhost ? 'ghost' : `${piece.color}-${piece.type}-${row}-${col}` }}>
      <CatModel piece={piece} ghost={isGhost} clip={isGhost ? 'Sit' : clip} seed={seed} />
      {isGraduating && (
        <pointLight ref={glow} color="#ffd76a" intensity={0} distance={2.4} position={[0, 1.25, 0]} />
      )}
      {isGhost && <Html center position={[0, 2.15, 0]} style={{ pointerEvents: 'none' }}>
        <span className="kitten-preview-label">Preview</span>
      </Html>}
    </group>
    </>
  );
}

/** A screen-space arrival crosses canvas boundaries on stacked phone layouts,
 * and the pool card is opaque, so the last leg is DOM: the piece appears above
 * the top of the viewport over its own box and falls into the portrait. */
function InventoryJump({piece}: {piece: PieceData}) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const icon = document.querySelector(`[data-pool-target="${piece.color}-${piece.type}"] .animated-piece-icon`);
    if (!icon || !element.current) return;
    const target = icon.getBoundingClientRect();
    const x = target.left;
    // Start fully above the viewport so the piece re-enters from the top of
    // the screen, then accelerate downwards under gravity into the box.
    const animation = element.current.animate([
      { transform: `translate(${x}px, ${-target.height * 1.4}px)`, opacity: 0 },
      { transform: `translate(${x}px, ${-target.height * 1.4}px)`, opacity: 1, offset: .08 },
      { transform: `translate(${x}px, ${target.top - 10}px)`, offset: .82 },
      { transform: `translate(${x}px, ${target.top}px)`, opacity: 1 }
    ], {duration: 620, easing: 'cubic-bezier(.42,0,.94,.55)', fill: 'forwards'});
    return () => animation.cancel();
  }, [piece.color, piece.type]);
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
  return <group ref={group} visible={false} userData={{ catProbe: `arrival-${color}-${index}` }}><CatModel piece={{color, type: 'cat'}} clip={clip} seed={index * .37} /></group>;
}

const QUILT_PRESETS: { name: string; colors: QuiltColors }[] = [
  { name: 'Sage linen', colors: ['#b7c4c7', '#5f7d88'] },
  { name: 'Bedtime', colors: ['#dfe3ef', '#4f5a86'] },
  { name: 'Peach tea', colors: ['#f6ded0', '#c0756a'] },
  { name: 'Meadow', colors: ['#e4ecd9', '#6f8a5e'] },
  { name: 'Overcast', colors: ['#cfd6dc', '#7a8794'] },
];

/** The quilt palette lives behind a button: a named preset reads better than
 * unnamed swatches, and it keeps the board area calm. */
function BedroomPalette({ colors, onChange }: { colors: QuiltColors; onChange: (next: QuiltColors) => void }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return (
    <div className="bedroom-palette" ref={panel}>
      <button type="button" className="bedroom-palette-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <span className="bedroom-swatch" style={{ background: colors[0] }} />
        <span className="bedroom-swatch" style={{ background: colors[1] }} />
        Bedroom
      </button>
      {open && (
        <div className="bedroom-palette-panel" role="dialog" aria-label="Quilt palette">
          <p className="bedroom-palette-title">Quilt colors</p>
          <div className="bedroom-presets">
            {QUILT_PRESETS.map(preset => {
              const active = preset.colors[0] === colors[0] && preset.colors[1] === colors[1];
              return <button key={preset.name} type="button" aria-pressed={active}
                className={`bedroom-preset${active ? ' is-active' : ''}`}
                onClick={() => onChange([...preset.colors] as QuiltColors)}>
                <span className="bedroom-swatch" style={{ background: preset.colors[0] }} />
                <span className="bedroom-swatch" style={{ background: preset.colors[1] }} />
                {preset.name}
              </button>;
            })}
          </div>
          <div className="bedroom-custom">
            {colors.map((color, index) => (
              <label key={index} className="quilt-color-control">
                <input type="color" aria-label={`Fabric ${index + 1}`} value={color}
                  onChange={event => {
                    const next = event.currentTarget.value;
                    onChange(index === 0 ? [next, colors[1]] : [colors[0], next]);
                  }} />
                <span>Fabric {index + 1}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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

/** The quilt gives a little under a freshly dropped piece: a short, soft radial
 * wave that lifts the fabric and dies away. Purely visual. */
const RIPPLE_S = .85;
function SheetRipple({ row, col, colors }: { row: number; col: number; colors: QuiltColors }) {
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => new THREE.PlaneGeometry(1.72, 1.72, 40, 40).rotateX(-Math.PI / 2), []);
  const rest = useMemo(() => Float32Array.from(geometry.attributes.position.array as Float32Array), [geometry]);
  const alpha = useMemo(() => createRadialAlphaTexture(), []);
  const born = useRef(performance.now());
  useEffect(() => () => { geometry.dispose(); alpha.dispose(); }, [geometry, alpha]);
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const t = (performance.now() - born.current) / 1000 - DROP_FALL_S;
    if (t < 0 || t > RIPPLE_S) { m.visible = false; return; }
    m.visible = true;
    const p = t / RIPPLE_S;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3], z = rest[i * 3 + 2];
      const d = Math.hypot(x, z);
      const falloff = Math.exp(-d * d * 1.7);
      // Two crests travelling outward, damped as they go.
      const wave = Math.sin(d * 13 - p * 15) * falloff * .05 * (1 - p * .85);
      position.setY(i, wave);
    }
    position.needsUpdate = true;
    (m.material as THREE.MeshStandardMaterial).opacity = Math.min(1, (1 - p) * 2.2) * .92;
  });
  const [x, , z] = at(row, col);
  return (
    <mesh ref={mesh} geometry={geometry} position={[x, .468, z]} visible={false} raycast={() => {}}>
      <meshStandardMaterial color={colors[(row + col) % 2]} alphaMap={alpha} transparent opacity={0}
        depthWrite={false} roughness={.98} />
    </mesh>
  );
}

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
      {/* Only an actual last move / history highlight gets a marker. Empty
          playable squares stay calm: no ring on every possible square. */}
      {active && (
        <>
          <mesh position={[0, .105, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <ringGeometry args={[.33, .365, 40]} />
            <meshBasicMaterial color="#f0b349" transparent opacity={.6} depthWrite={false} />
          </mesh>
          <mesh position={[.36, .105, .36]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
            <circleGeometry args={[.055, 16]} />
            <meshBasicMaterial color="#f0b349" transparent opacity={.85} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Dust kicked up where a piece was pushed. Purely cosmetic, starts with the
 * boop itself, and never touches board state. */
function BoopPuff({ row, col }: { row: number; col: number }) {
  const group = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const cloud = useRef<THREE.Points>(null);
  const born = useRef(performance.now());
  const dirs = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2 + Math.random() * .3;
    return { x: Math.cos(angle), z: Math.sin(angle), lift: .3 + Math.random() * .5 };
  }), []);
  const positions = useMemo(() => new Float32Array(dirs.length * 3), [dirs]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = (performance.now() - born.current) / 1000 - BOOP_DELAY_S;
    if (t < 0 || t > .62) { g.visible = false; return; }
    g.visible = true;
    const p = t / .62;
    if (ring.current) {
      // A dust cloud, not a target reticle: it only lives for the first quarter
      // of the puff and never forms a hard warm ring.
      const scale = .45 + p * 1.1;
      ring.current.scale.set(scale, scale, 1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(0, .42 - p * 1.6);
    }
    if (cloud.current) {
      dirs.forEach((dir, i) => {
        positions[i * 3] = dir.x * p * 1.4;
        positions[i * 3 + 1] = Math.sin(p * Math.PI * .85) * dir.lift * 1.4;
        positions[i * 3 + 2] = dir.z * p * 1.4;
      });
      cloud.current.geometry.attributes.position.needsUpdate = true;
      (cloud.current.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - p * 1.1);
    }
  });
  const [x, y, z] = at(row, col);
  return (
    <group ref={group} position={[x, y - .02, z]} visible={false}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <circleGeometry args={[.34, 28]} />
        <meshBasicMaterial color="#cfc3ae" transparent opacity={0} depthWrite={false} />
      </mesh>
      <points ref={cloud} raycast={() => {}}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ded2bd" size={.12} transparent opacity={0} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  );
}

/** Graduation payoff: a gold ring and a rising sparkle burst over each kitten
 * that just lined up. */
function GraduationSparkles({ row, col }: { row: number; col: number }) {
  const group = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const cloud = useRef<THREE.Points>(null);
  const born = useRef(performance.now());
  const dirs = useMemo(() => Array.from({ length: 26 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = .1 + Math.random() * .35;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, rise: .5 + Math.random() * .9, spin: .5 + Math.random() };
  }), []);
  const positions = useMemo(() => new Float32Array(dirs.length * 3), [dirs]);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = (performance.now() - born.current) / 1000;
    if (t > GRADUATION_HIGHLIGHT_MS / 1000) { g.visible = false; return; }
    const p = t / (GRADUATION_HIGHLIGHT_MS / 1000);
    if (halo.current) {
      const scale = .3 + p * 1.5;
      halo.current.scale.set(scale, scale, 1);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * .8;
    }
    if (cloud.current) {
      dirs.forEach((dir, i) => {
        positions[i * 3] = dir.x * (1 + p * dir.spin);
        positions[i * 3 + 1] = dir.rise * p * 1.4 - p * p * .25;
        positions[i * 3 + 2] = dir.z * (1 + p * dir.spin);
      });
      cloud.current.geometry.attributes.position.needsUpdate = true;
      (cloud.current.material as THREE.PointsMaterial).opacity = Math.sin(p * Math.PI) * 1.1;
    }
  });
  const [x, y, z] = at(row, col);
  return (
    <group ref={group} position={[x, y + .06, z]}>
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
        <ringGeometry args={[.2, .26, 36]} />
        <meshBasicMaterial color="#ffd76a" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <points ref={cloud} raycast={() => {}}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ffe9a8" size={.085} transparent opacity={0} depthWrite={false}
          blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
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
    (window as unknown as { __boardView?: () => { azimuth: number; polar: number; distance: number } }).__boardView = () => {
      const offset = camera.position.clone().sub(new THREE.Vector3(0, .18, 0));
      return { azimuth: +Math.atan2(offset.x, offset.z).toFixed(3),
        polar: +Math.acos(offset.y / (offset.length() || 1)).toFixed(3),
        distance: +offset.length().toFixed(2) };
    };
    (window as unknown as { __cellScreen?: (row: number, col: number) => { x: number; y: number } }).__cellScreen = (row, col) => {
      const rect = gl.domElement.getBoundingClientRect();
      const v = new THREE.Vector3((col - 2.5) * 1.06, .42, (row - 2.5) * 1.06).project(camera);
      return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
    };
    return () => {
      const w = window as unknown as { __catProbe?: unknown; __cellScreen?: unknown; __boardView?: unknown };
      delete w.__catProbe; delete w.__cellScreen; delete w.__boardView;
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
  // A neutral medium grey frame: it separates the bed from the room without
  // competing with the quilt or the team colors the pieces are read by.
  const wood = '#565b5e';
  const woodLight = '#6a7074';
  const woodDark = '#3f4447';

  // A drape hangs straight down from the quilt edge. These used to be rotated
  // a few degrees outward, which leaned the left and right panels and opened a
  // visible seam at all four corners. The end panels now run the full width and
  // the side panels tuck into them, so every edge is flush and square.
  const half = 3.585;              // panel centre, just outside the quilt edge
  const thickness = .13;
  const endLength = half * 2 + thickness;         // reaches the side's outer face
  const sideLength = half * 2 - thickness + .04;  // tucks into the end panels
  // Outer face of the bedspread: the shared edge the rails and end boards meet
  // so every corner of the bed is snug when seen from above.
  const fabricHalf = half + thickness / 2;        // 3.65
  const fabricWidth = fabricHalf * 2;             // 7.30
  const drapes: { key: string; at: [number, number, number]; box: [number, number, number]; hem: [number, number, number] }[] = [
    { key: 'near', at: [0, .36, half], box: [endLength, .66, thickness], hem: [endLength, .1, thickness + .04] },
    { key: 'far', at: [0, .36, -half], box: [endLength, .66, thickness], hem: [endLength, .1, thickness + .04] },
    { key: 'right', at: [half, .36, 0], box: [thickness, .66, sideLength], hem: [thickness + .04, .1, sideLength] },
    { key: 'left', at: [-half, .36, 0], box: [thickness, .66, sideLength], hem: [thickness + .04, .1, sideLength] },
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
        <group key={drape.key} position={drape.at}>
          <mesh position={[0, -.33, 0]} castShadow receiveShadow>
            <boxGeometry args={drape.box} />
            <meshStandardMaterial color={quiltShade} map={fabric.map} bumpMap={fabric.bumpMap}
              bumpScale={.012} roughness={.99} />
          </mesh>
          <mesh position={[0, -.70, 0]} castShadow>
            <boxGeometry args={drape.hem} />
            <meshStandardMaterial color={trim} roughness={.95} />
          </mesh>
        </group>
      ))}

      {/* Headboard: flush against the bedspread's back face and as wide as the
          bed. Narrower, set-back rails left a wedge of background in each far
          corner when the bed was viewed from above. */}
      {[-1, 1].map(side => (
        <group key={`post-${side}`} position={[side * (fabricHalf - .16), 0, -(fabricHalf + .16)]}>
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
      <RoundedBox args={[fabricWidth, .28, .2]} radius={.09} position={[0, 1.0, -(fabricHalf + .09)]} castShadow>
        <meshStandardMaterial color={woodLight} roughness={.55} />
      </RoundedBox>
      <RoundedBox args={[fabricWidth - .3, .62, .16]} radius={.12} position={[0, .56, -(fabricHalf + .08)]} castShadow receiveShadow>
        <meshStandardMaterial color={cushion} map={fabric.map} bumpMap={fabric.bumpMap}
          bumpScale={.02} roughness={.95} />
      </RoundedBox>
      {/* Square ends on the rails that have to meet the bedspread at a right
          angle: a rounded box curves away from the fabric corner and leaves a
          wedge of background when the bed is seen from above. */}
      <mesh position={[0, .18, -(fabricHalf + .09)]} castShadow>
        <boxGeometry args={[fabricWidth, .2, .2]} />
        <meshStandardMaterial color={wood} roughness={.6} />
      </mesh>
      {/* Two pillows propped against the headboard, behind the playable row. */}
      {[-1.62, 1.62].map(x => (
        <group key={`pillow-${x}`} position={[x, .58, -(fabricHalf - .19)]} rotation={[-.28, x > 0 ? -.06 : .06, 0]}>
          <RoundedBox args={[2.6, .78, .52]} radius={.34} smoothness={5} castShadow receiveShadow>
            <meshStandardMaterial color={new THREE.Color(quiltColors[0]).lerp(new THREE.Color('#ffffff'), .55)}
              map={fabric.map} bumpMap={fabric.bumpMap} bumpScale={.02} roughness={.97} />
          </RoundedBox>
        </group>
      ))}

      {/* Low footboard: below quilt level, so it never hides the near row. Its
          width and depth match the bedspread exactly, so its ends are flush
          right angles against the fabric instead of stepping past it. */}
      <mesh position={[0, -.02, fabricHalf + .09]} castShadow receiveShadow>
        <boxGeometry args={[fabricWidth, .5, .2]} />
        <meshStandardMaterial color={woodLight} roughness={.6} />
      </mesh>
    </group>
  );
}

// Fixed viewing direction and a distance that fills the shell. The board is a
// fixed-size object in a fixed shell; letting the camera drift made it look
// small and dim, so zoom is gone and framing is derived from the aspect ratio.
const BOARD_VIEW_DIR = new THREE.Vector3(9.2, 10.8, 12).normalize();
const BOARD_DISTANCE = 12.6;

/** The orbit the player chose, kept in the module and in storage so a re-mounted
 * canvas (a new model loading, a resize, a remount of the board) comes back to
 * the same angle. Without this the view snapped back to the default whenever
 * the 3D scene was rebuilt — most visibly when a three-in-a-row started the
 * graduation animation. Only the very first visit uses the default view. */
const BOARD_VIEW_STORAGE_KEY = 'boop-board-view';
interface BoardView { azimuth: number; polar: number; distance: number }
let savedBoardView: BoardView | null = null;

function readBoardView(): BoardView | null {
  if (savedBoardView) return savedBoardView;
  try {
    const raw = localStorage.getItem(BOARD_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BoardView>;
    if (typeof parsed.azimuth !== 'number' || typeof parsed.polar !== 'number' || typeof parsed.distance !== 'number') return null;
    if (!Number.isFinite(parsed.azimuth) || !Number.isFinite(parsed.polar) || !Number.isFinite(parsed.distance)) return null;
    savedBoardView = { azimuth: parsed.azimuth, polar: parsed.polar, distance: parsed.distance };
    return savedBoardView;
  } catch {
    return null;
  }
}

function writeBoardView(view: BoardView) {
  savedBoardView = view;
  try { localStorage.setItem(BOARD_VIEW_STORAGE_KEY, JSON.stringify(view)); } catch { /* keep it in memory */ }
}

/** Warm the shader cache before the first piece is placed, so the first
 * placement does not hitch while materials compile. */
function Precompile() {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  useEffect(() => {
    const handle = requestAnimationFrame(() => { try { gl.compile(scene, camera); } catch { /* not fatal */ } });
    return () => cancelAnimationFrame(handle);
  }, [gl, scene, camera]);
  return null;
}

function FrameBoard() {
  const camera = useThree(state => state.camera);
  const size = useThree(state => state.size);
  const controls = useThree(state => state.controls) as
    | { update?: () => void; target?: THREE.Vector3; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void }
    | null;
  // Read through a ref: a re-created controls instance (Suspense re-entry when
  // a new model loads mid-game) must not re-run the framing effect and snap the
  // view back.
  const controlsRef = useRef(controls);
  controlsRef.current = controls;
  const applied = useRef(0);

  // Remember the orbit the player settles on. Orbit controls keep easing after
  // the pointer is released, so the settled value is read from 'change' (and the
  // storage write is debounced past the damping tail) rather than at 'end'.
  useEffect(() => {
    const active = controlsRef.current;
    if (!active?.addEventListener) return;
    let settle: ReturnType<typeof setTimeout> | null = null;
    const remember = () => {
      const target = active.target ?? new THREE.Vector3(0, .18, 0);
      const offset = camera.position.clone().sub(target);
      const distance = offset.length();
      if (distance < 1e-3) return;
      const view: BoardView = {
        azimuth: Math.atan2(offset.x, offset.z),
        polar: Math.acos(THREE.MathUtils.clamp(offset.y / distance, -1, 1)),
        distance,
      };
      savedBoardView = view; // in-memory immediately: a remount is instant
      if (settle) clearTimeout(settle);
      settle = setTimeout(() => writeBoardView(view), 250);
    };
    active.addEventListener('change', remember);
    return () => {
      active.removeEventListener?.('change', remember);
      if (settle) clearTimeout(settle);
    };
  }, [controls, camera]);

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    // The shell is square or wider, and the vertical field of view is fixed, so
    // one distance frames the bed everywhere. Only a genuinely portrait shell
    // needs to stand further back.
    const distance = BOARD_DISTANCE * (aspect < 1 ? 1 / aspect : 1);
    // Re-frame only when the required distance really changed. A scrollbar
    // appearing, or any other few-pixel layout shift on the opponent's turn,
    // must not pull the camera back to the framed angle the player left.
    if (Math.abs(distance - applied.current) < .6) return;
    applied.current = distance;
    const active = controlsRef.current;
    const target = active?.target ?? new THREE.Vector3(0, .18, 0);
    // A rebuilt canvas starts from the default camera position, so restore the
    // player's orbit explicitly instead of trusting whatever it was given.
    const saved = readBoardView();
    const direction = saved
      ? new THREE.Vector3().setFromSphericalCoords(1, saved.polar, saved.azimuth)
      : camera.position.clone().sub(target);
    // Keep whatever orbit the player has chosen; only the radius is ours.
    if (direction.lengthSq() < 1e-6) direction.copy(BOARD_VIEW_DIR);
    camera.position.copy(target).addScaledVector(direction.normalize(), distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    active?.update?.();
  }, [camera, size.width, size.height]);
  return null;
}

/** The room around the bed: a woven rug on the floor, a soft contact shadow,
 * and a little bedside furniture so the bed reads as furniture rather than a
 * floating slab. Everything here sits outside the playable quilt. */
function Room({ fabric, quiltColors }: { fabric: QuiltResources; quiltColors: QuiltColors }) {
  const shadow = useMemo(() => createContactShadowTexture(), []);
  useEffect(() => () => shadow.dispose(), [shadow]);
  const wood = '#6d4527';
  const woodLight = '#96633c';
  const slate = new THREE.Color('#33464f');

  return (
    <group>
      {/* Rug. Its top is exactly the floor the cats land on. */}
      <mesh position={[0, FLOOR_Y - .012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6.6, 64]} />
        <meshStandardMaterial color={slate} map={fabric.map} bumpMap={fabric.bumpMap}
          bumpScale={.02} roughness={.99} />
      </mesh>
      <mesh position={[0, FLOOR_Y - .006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.35, 6.6, 64]} />
        <meshStandardMaterial color="#20313a" roughness={.98} />
      </mesh>
      <mesh position={[0, FLOOR_Y - .001, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[10.4, 10.4]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} opacity={.85} />
      </mesh>

      {/* Bedside table, left of the headboard. */}
      <group position={[4.72, 0, -1.15]}>
        <mesh position={[0, -.52, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[.62, .58, .1, 24]} />
          <meshStandardMaterial color={woodLight} roughness={.55} />
        </mesh>
        <mesh position={[0, -.78, 0]} castShadow>
          <cylinderGeometry args={[.09, .09, .44, 12]} />
          <meshStandardMaterial color={wood} roughness={.62} />
        </mesh>
        <mesh position={[0, -1.0, 0]} castShadow>
          <cylinderGeometry args={[.3, .3, .05, 20]} />
          <meshStandardMaterial color={wood} roughness={.62} />
        </mesh>
        {/* Mug and a small book. */}
        <mesh position={[.2, -.43, .08]} castShadow>
          <cylinderGeometry args={[.11, .1, .17, 18]} />
          <meshStandardMaterial color={new THREE.Color(quiltColors[1]).lerp(new THREE.Color('#ffffff'), .35)} roughness={.6} />
        </mesh>
        <mesh position={[-.19, -.455, -.05]} rotation={[0, .34, 0]} castShadow>
          <boxGeometry args={[.3, .05, .22]} />
          <meshStandardMaterial color="#b4553f" roughness={.8} />
        </mesh>
        <mesh position={[-.19, -.4, -.05]} rotation={[0, .34, 0]} castShadow>
          <boxGeometry args={[.28, .045, .2]} />
          <meshStandardMaterial color="#e8dcc4" roughness={.9} />
        </mesh>
      </group>

      {/* A toy mouse on the rug at the foot of the bed. */}
      <group position={[2.5, FLOOR_Y + .05, 3.9]} rotation={[0, -.6, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[.12, 16, 12]} />
          <meshStandardMaterial color="#9aa6ad" roughness={.9} />
        </mesh>
        <mesh position={[.12, .01, 0]} castShadow>
          <sphereGeometry args={[.055, 12, 10]} />
          <meshStandardMaterial color="#7f8b92" roughness={.9} />
        </mesh>
        <mesh position={[-.14, .01, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[.012, .006, .2, 6]} />
          <meshStandardMaterial color="#c8b6a0" roughness={.9} />
        </mesh>
      </group>
    </group>
  );
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
      <ambientLight intensity={1.5} />
      {/* One shadow-casting key light, scoped to the bed so the map stays crisp. */}
      <directionalLight position={[-5, 9, 4]} intensity={2.1} color="#fff6e8" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-.0006} shadow-normalBias={.02}
        shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7}
        shadow-camera-bottom={-7} shadow-camera-near={.5} shadow-camera-far={34} />
      <directionalLight position={[6, 4, -5]} intensity={1.5} color="#eef4ff" />
      <Room fabric={fabric} quiltColors={props.quiltColors} />
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
          {props.board.map((line, row) => line.map((piece, col) => {
            if (!piece) return null;
            // The glow begins with the highlight and stays lit through the
            // ascent; only the removal phase adds the rise.
            const graduating = props.graduatingPieces.some(g => g.row === row && g.col === col);
            return <CatActor key={`${row}-${col}-${piece.color}-${piece.type}`} piece={piece} row={row} col={col}
              boop={boopTo(row, col)} isNew={props.lastMove?.row === row && props.lastMove?.col === col && !boopTo(row, col)}
              isGraduating={graduating && (props.graduationPhase === 'highlighting' || props.graduationPhase === 'removing')}
              removing={graduating && props.graduationPhase === 'removing'}
              animationKey={props.animationKey} />;
          }))}
          {hover && props.isMyTurn && !props.isViewingHistory && props.myColor && props.selectedPieceType && !props.board[hover.row][hover.col] && (
            <CatActor piece={{ color: props.myColor, type: props.selectedPieceType }} row={hover.row} col={hover.col}
              isGhost animationKey={props.animationKey} />
          )}
          {props.lastMove && !props.isViewingHistory && (
            <SheetRipple key={`ripple-${props.animationKey}`} row={props.lastMove.row} col={props.lastMove.col}
              colors={props.quiltColors} />
          )}
          {props.animationKey > 0 && props.boopedPieces.map((boop, index) => (
            <BoopPuff key={`puff-${props.animationKey}-${index}`} row={boop.from.row} col={boop.from.col} />
          ))}
          {props.graduationPhase === 'highlighting' && props.graduatingPieces.map((piece, index) => (
            <GraduationSparkles key={`sparkle-${props.animationKey}-${index}`} row={piece.row} col={piece.col} />
          ))}
          {props.graduationPhase === 'removing' && props.graduatingPieces.map((piece, index) => (
            <ReserveArrival key={`arrival-${props.animationKey}-${index}`} color={piece.piece.color} index={index} />
          ))}
          {/* A returning cat outlives the move that booped it: its key and its
              animation clock are the piece's own id, so a fast opponent reply
              can never restart or cut short the walk home. */}
          {props.fallenPieces.map((fallen, i) => {
            const tripKey = fallen.id ?? i;
            return <CatActor key={`fallen-${tripKey}`} piece={fallen.piece} row={fallen.gutterRow} col={fallen.gutterCol}
              boop={{ fromRow: fallen.fromRow, fromCol: fallen.fromCol }} animationKey={tripKey} />;
          })}
        </group>
      </group>
      {/* The page-wide carpet is behind the transparent canvas, without a
          second floor surface creating a rectangular visual division. */}
      {/* Built in-memory from lightformers: no runtime fetch to a CDN, so a
          flaky network can never leave the board unlit or blank. */}
      <Environment resolution={64} environmentIntensity={.8}>
        <Lightformer intensity={2.2} position={[0, 8, 4]} scale={[12, 6, 1]} rotation={[-Math.PI / 2, 0, 0]} />
        <Lightformer intensity={1.1} position={[-8, 3, 2]} scale={[8, 4, 1]} rotation={[0, Math.PI / 2, 0]} color="#ffe6c9" />
        <Lightformer intensity={.8} position={[8, 2, -3]} scale={[8, 4, 1]} rotation={[0, -Math.PI / 2, 0]} color="#d6e6ff" />
      </Environment>
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
  const shellRef = useRef<HTMLDivElement>(null);
  // A short camera-shake on impact, tied to the boop itself.
  useEffect(() => {
    if (prefersReducedMotion() || props.boopedPieces.length === 0) return;
    let knock: ReturnType<typeof setTimeout> | undefined;
    const start = setTimeout(() => {
      const shell = shellRef.current;
      if (!shell) return;
      shell.classList.add('board-shake');
      knock = setTimeout(() => shell.classList.remove('board-shake'), 240);
    }, BOOP_DELAY_MS);
    return () => {
      clearTimeout(start);
      if (knock) clearTimeout(knock);
      shellRef.current?.classList.remove('board-shake');
    };
  }, [props.animationKey, props.boopedPieces.length]);
  const [quiltColors, setQuiltColors] = useState<QuiltColors>(readQuiltColors);
  useEffect(() => {
    try { localStorage.setItem(QUILT_STORAGE_KEY, JSON.stringify(quiltColors)); }
    catch { /* Preferences still work in memory when storage is unavailable. */ }
  }, [quiltColors]);
  // Inventory hops live here, in the DOM tree, and expire once the hop lands.
  const [flights, setFlights] = useState<InventoryFlight[]>([]);
  const flightId = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const requestFlight = useCallback<RequestInventoryFlight>((piece) => {
    const id = ++flightId.current;
    setFlights(previous => [...previous, { id, piece }]);
    timers.current.push(setTimeout(() => {
      setFlights(previous => previous.filter(flight => flight.id !== id));
    }, 800));
  }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  return (
    <div className="floating-board-area">
    <div className="floating-board-shell" ref={shellRef}>
      <BoardErrorBoundary>
      <Canvas shadows dpr={[1, 1.7]} camera={BOARD_CAMERA} gl={BOARD_GL}>
        <Suspense fallback={null}>
          <CatProbe />
          <Precompile />
          <InventoryFlightContext.Provider value={requestFlight}>
            <Scene {...props} quiltColors={quiltColors} />
          </InventoryFlightContext.Provider>
        </Suspense>
      </Canvas>
      </BoardErrorBoundary>
      {flights.map(flight => <InventoryJump key={flight.id} piece={flight.piece} />)}
      <div className="board-hint">Drag to look around</div>
      <div className="board-cell-anchors" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => <span key={i} data-cell={`${Math.floor(i / 6)}-${i % 6}`} />)}
      </div>
      {props.isViewingHistory && <div className="history-3d-badge">Viewing game history · click a square to return</div>}
    </div>
    <BedroomPalette colors={quiltColors} onChange={setQuiltColors} />
    </div>
  );
}

useGLTF.preload('/assets/models/boop-kitten.glb');
useGLTF.preload('/assets/models/boop-cat.glb');

/** Pool portraits are the same rig, rendered once and cached as an image, so
 * the page keeps a single WebGL context instead of one per portrait. */
export function AnimatedPieceIcon({ piece }: { piece: PieceData }) {
  const [, bump] = useState(0);
  useEffect(() => {
    void ensurePortraits().then(() => bump(value => value + 1));
    return subscribePortraits(() => bump(value => value + 1));
  }, []);
  const url = portraitUrl(piece.color, piece.type);
  return <span className="animated-piece-icon" aria-hidden="true">
    {url ? <img src={url} alt="" draggable={false} /> : null}
  </span>;
}

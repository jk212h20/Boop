import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
const BOOP_S = .8; // hop, then floor landing and scamper within the shared timing budget
const FLOOR_Y = -1.03;
const boxAt = (color: PlayerColor): [number, number, number] => [color === 'orange' ? -4.2 : 4.2, FLOOR_Y, 3.4];
const CROUCH_F = .19, AIR_F = .52; // remaining fraction of the boop is landing
const SETTLE_HEADING = Math.atan2(9.2, 12); // face the default camera (~37°)

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const shortestTurn = (from: number, to: number) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

function CatActor({ piece, row, col, boop, isNew, isGhost, isGraduating, removing, animationKey }: CatActorProps) {
  const group = useRef<THREE.Group>(null);
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
          const destination = boxAt(piece.color);
          const run = Math.min(1, (t - BOOP_S) / 1.3);
          x = target[0] + (destination[0] - target[0]) * run;
          z = target[2] + (destination[2] - target[2]) * run;
          y = FLOOR_Y + Math.abs(Math.sin((t - BOOP_S) * 22)) * .045 * (1 - run);
          desiredHeading = Math.atan2(destination[0] - target[0], destination[2] - target[2]);
          nextClip = run < 1 ? 'Walk' : 'Sit';
          if (run > .88) y -= (run - .88) / .12 * .35;
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
    <group ref={group} position={target} renderOrder={isGhost ? -1 : 1}
      userData={{ catProbe: isGhost ? 'ghost' : `${piece.color}-${piece.type}-${row}-${col}` }}>
      <CatModel piece={piece} ghost={isGhost} clip={isGhost ? 'Sit' : clip} />
      {isGraduating && (
        <pointLight color="#ffd76a" intensity={2.2} distance={2.4} position={[0, 1.25, 0]} />
      )}
      {isGhost && <Html center position={[0, 2.15, 0]} style={{ pointerEvents: 'none' }}>
        <span className="kitten-preview-label">Preview</span>
      </Html>}
    </group>
  );
}

/** Graduation payoff follows the ascent; arrivals are real animated cats,
 * not screen-space icons. A single-piece graduation receives one cat. */
function ReserveArrival({ color, index }: { color: PlayerColor; index: number }) {
  const group = useRef<THREE.Group>(null);
  const started = useRef(performance.now());
  const [clip, setClip] = useState('Jump');
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = (performance.now() - started.current) / 1000 - .7 - index * .12;
    g.visible = t >= 0 && t < 1.15;
    if (t < 0) return;
    const [bx, by, bz] = boxAt(color);
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
    (window as unknown as { __catProbe?: () => { cat: string; x: number; y: number; z: number; ry: number }[] }).__catProbe = () => {
      const out: { cat: string; x: number; y: number; z: number; ry: number }[] = [];
      scene.traverse(o => {
        const tag = o.userData?.catProbe;
        if (typeof tag === 'string' && o.parent) {
          out.push({ cat: tag, x: +o.position.x.toFixed(3), y: +o.position.y.toFixed(3),
            z: +o.position.z.toFixed(3), ry: +o.rotation.y.toFixed(3) });
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
      <fog attach="fog" args={['#17222d', 15, 25]} />
      <ambientLight intensity={2.4} />
      <directionalLight position={[-5, 9, 4]} intensity={2.0} color="#ffffff" />
      <directionalLight position={[6, 4, -5]} intensity={1.8} color="#ffffff" />
      <group>
        <group rotation={[0, -.08, 0]}>
          <RoundedBox args={[7.15, .32, 7.15]} radius={.35} smoothness={5} position={[0, -.17, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#714020" roughness={.66} metalness={.03} />
          </RoundedBox>
          <RoundedBox args={[6.75, .24, 6.75]} radius={.10} smoothness={5} position={[0, .17, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={new THREE.Color(props.quiltColors[0]).multiplyScalar(.78)}
              map={fabric.map} bumpMap={fabric.bumpMap} bumpScale={.012} roughness={.98} />
          </RoundedBox>
          {/* Upholstered mattress, oak rails and four grounded legs. */}
          {[-3.42, 3.42].map(x => <RoundedBox key={`rail-${x}`} args={[.18, .46, 7.1]} radius={.07} position={[x, -.10, 0]} castShadow><meshStandardMaterial color="#b78557" roughness={.7} /></RoundedBox>)}
          {[-3.2, 3.2].flatMap(x => [-3.2, 3.2].map(z => <RoundedBox key={`${x}-${z}`} args={[.3, .68, .3]} radius={.06} position={[x, -.67, z]} castShadow><meshStandardMaterial color="#805332" roughness={.8} /></RoundedBox>))}
          <RoundedBox args={[7.15, 1.25, .22]} radius={.1} position={[0, .30, -3.65]} castShadow><meshStandardMaterial color="#b78557" roughness={.7} /></RoundedBox>
          <RoundedBox args={[6.7, .64, .12]} radius={.08} position={[0, .47, -3.49]}><meshStandardMaterial color="#e6d7bf" roughness={1} /></RoundedBox>
          {(['orange', 'gray'] as PlayerColor[]).map(color => {
            const [x, y, z] = boxAt(color);
            return <group key={color} position={[x, y, z]}>
              <RoundedBox args={[1.35, .12, 1.25]} radius={.05} position={[0, -.06, 0]} receiveShadow><meshStandardMaterial color="#c99b68" /></RoundedBox>
              {[-.66, .66].map(side => <RoundedBox key={side} args={[.10, .48, 1.25]} radius={.025} position={[side, .18, 0]}><meshStandardMaterial color="#c99b68" /></RoundedBox>)}
              <RoundedBox args={[1.35, .48, .1]} radius={.025} position={[0, .18, .6]}><meshStandardMaterial color="#bd8c59" /></RoundedBox>
              <Html center position={[0, .25, .68]} style={{pointerEvents: 'none'}}><span className={`reserve-box-label reserve-box-${color}`}>{color === 'orange' ? 'Orange' : 'Gray'} box</span></Html>
            </group>;
          })}
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
      {/* Continuous floor: its edges lie outside the viewport, never crop the bed. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.08, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#d9e4d8" map={fabric.map} bumpMap={fabric.bumpMap} bumpScale={.012} roughness={1} />
      </mesh>
      <Environment preset="apartment" environmentIntensity={.7} />
      <OrbitControls makeDefault enablePan={false} minDistance={10} maxDistance={26}
        minPolarAngle={.52} maxPolarAngle={1.16} minAzimuthAngle={-.75} maxAzimuthAngle={.75}
        target={[0, .2, 0]} />
    </>
  );
}

export function FloatingBoard3D(props: FloatingBoard3DProps) {
  const [quiltColors, setQuiltColors] = useState<QuiltColors>(readQuiltColors);
  useEffect(() => {
    try { localStorage.setItem(QUILT_STORAGE_KEY, JSON.stringify(quiltColors)); }
    catch { /* Preferences still work in memory when storage is unavailable. */ }
  }, [quiltColors]);
  return (
    <div className="floating-board-area">
    <div className="floating-board-shell">
      <Canvas shadows dpr={[1, 1.7]} camera={{ position: [9.2, 10.8, 12], fov: 46 }} gl={{ antialias: true, alpha: true }}>
        <Suspense fallback={null}><CatProbe /><Scene {...props} quiltColors={quiltColors} /></Suspense>
      </Canvas>
      <div className="board-hint">Drag to look around · scroll to zoom</div>
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

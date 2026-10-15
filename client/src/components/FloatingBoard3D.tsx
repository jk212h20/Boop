import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Float, Html, OrbitControls, RoundedBox, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Board as BoardType, BoopEffect, Cell, Piece as PieceData, PieceType, PlayerColor } from '../types';
import { GraduatingPiece, FallenPiece } from './Board';
import { createCatScene, createFabricTextures, createQuiltPatchGeometry, createQuiltStitches,
  DEFAULT_QUILT_COLORS, QUILT_STORAGE_KEY, QuiltColors, quiltColor, readQuiltColors } from '../rendering/boardAppearance';

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

function CatModel({ piece, ghost = false }: { piece: PieceData; ghost?: boolean }) {
  const { scene, animations } = useGLTF(`/assets/models/boop-${piece.type}.glb`);
  const cloned = useMemo(() => createCatScene(scene, piece.color, ghost), [scene, piece.color, ghost]);
  const mixer = useMemo(() => {
    if (ghost) return null;
    const sit = THREE.AnimationClip.findByName(animations, 'Sit');
    if (!sit) return null;
    const m = new THREE.AnimationMixer(cloned);
    m.clipAction(sit).play();
    return m;
  }, [cloned, animations, ghost]);
  const blink = useMemo(() => (mixer ? THREE.AnimationClip.findByName(animations, 'Blink') ?? null : null), [mixer, animations]);
  const nextBlink = useRef(2 + Math.random() * 4);
  const blinkAction = useRef<THREE.AnimationAction | null>(null);
  useEffect(() => () => { mixer?.stopAllAction(); }, [mixer]);
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
  landed?: boolean;
  animationKey: number;
}

function CatActor({ piece, row, col, boop, isNew, isGhost, isGraduating, removing, landed, animationKey }: CatActorProps) {
  const group = useRef<THREE.Group>(null);
  const born = useRef(performance.now());
  const removalStarted = useRef<number | null>(null);
  const seed = useMemo(() => ((row + 2) * 17 + (col + 3) * 31 + piece.color.length * 7) % 23, [row, col, piece.color]);
  const target = at(row, col);
  const origin = boop ? at(boop.fromRow, boop.fromCol) : target;

  // Coordinate values, not freshly allocated boop prop objects, own the clock.
  useEffect(() => { born.current = performance.now(); }, [animationKey, boop?.fromRow, boop?.fromCol, isNew]);
  useEffect(() => {
    removalStarted.current = removing ? performance.now() : null;
  }, [removing, animationKey]);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const elapsed = (performance.now() - born.current) / 1000;
    const delay = boop ? .5 : 0;
    const p = boop ? THREE.MathUtils.smoothstep((elapsed - delay) / .52, 0, 1) : 1;
    g.position.x = THREE.MathUtils.lerp(origin[0], target[0], p);
    g.position.z = THREE.MathUtils.lerp(origin[2], target[2], p);
    const idle = Math.sin(clock.elapsedTime * (1.45 + seed * .008) + seed) * .025;
    const hop = boop && elapsed > delay && p < 1 ? Math.sin(p * Math.PI) * .9 : 0;
    const drop = isNew && elapsed < .45 ? Math.max(0, (1 - elapsed / .45) * 2.3) : 0;
    g.position.y = target[1] + idle + hop + drop;
    g.rotation.y = Math.sin(clock.elapsedTime * .42 + seed) * .045;
    g.rotation.z = boop && p < 1 ? Math.sin(p * Math.PI) * -.12 : 0;
    const breathe = 1 + Math.sin(clock.elapsedTime * 1.7 + seed) * .012;
    const landingSquash = landed && elapsed > delay + .4 && elapsed < delay + .68
      ? Math.sin(((elapsed - delay - .4) / .28) * Math.PI) * .12
      : 0;
    let scale = piece.type === 'cat' ? .58 : .55;
    if (isGraduating) scale *= 1 + Math.sin(clock.elapsedTime * 10) * .06;
    if (removing && removalStarted.current !== null) {
      const removalElapsed = (performance.now() - removalStarted.current) / 1000;
      scale *= Math.max(0, 1 - removalElapsed / .65);
    }
    g.scale.set(scale * breathe * (1 + landingSquash), scale / breathe * (1 - landingSquash), scale * breathe * (1 + landingSquash));
  });

  return (
    <group ref={group} position={target} renderOrder={isGhost ? -1 : 1}>
      <group rotation={[0, 0, 0]}>
        <CatModel piece={piece} ghost={isGhost} />
      </group>
      {isGraduating && (
        <pointLight color="#ffd76a" intensity={2.2} distance={2.4} position={[0, 1.25, 0]} />
      )}
      {isGhost && <Html center position={[0, 2.15, 0]} style={{ pointerEvents: 'none' }}>
        <span className="kitten-preview-label">Preview</span>
      </Html>}
    </group>
  );
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
      <ambientLight intensity={1.15} />
      <directionalLight position={[-5, 9, 4]} intensity={2.3} color="#fff0d4" castShadow shadow-intensity={.5} shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[6, 4, -5]} intensity={1.1} color="#96d9ff" />
      <Float speed={1.15} rotationIntensity={.055} floatIntensity={.22} floatingRange={[-.12, .12]}>
        <group rotation={[0, -.08, 0]}>
          <RoundedBox args={[7.55, .42, 7.55]} radius={.35} smoothness={5} position={[0, -.17, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#714020" roughness={.66} metalness={.03} />
          </RoundedBox>
          <RoundedBox args={[6.75, .24, 6.75]} radius={.10} smoothness={5} position={[0, .17, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={new THREE.Color(props.quiltColors[0]).multiplyScalar(.78)}
              map={fabric.map} bumpMap={fabric.bumpMap} bumpScale={.012} roughness={.98} />
          </RoundedBox>
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
              boop={boopTo(row, col)} landed={!!boopTo(row, col)} isNew={props.lastMove?.row === row && props.lastMove?.col === col && !boopTo(row, col)}
              isGraduating={props.graduatingPieces.some(g => g.row === row && g.col === col) && props.graduationPhase === 'highlighting'}
              removing={props.graduatingPieces.some(g => g.row === row && g.col === col) && props.graduationPhase === 'removing'}
              animationKey={props.animationKey} />
          )))}
          {hover && props.isMyTurn && !props.isViewingHistory && props.myColor && props.selectedPieceType && !props.board[hover.row][hover.col] && (
            <CatActor piece={{ color: props.myColor, type: props.selectedPieceType }} row={hover.row} col={hover.col}
              isGhost animationKey={props.animationKey} />
          )}
          {props.fallenPieces.map((fallen, i) => (
            <CatActor key={`fallen-${i}-${props.animationKey}`} piece={fallen.piece} row={fallen.gutterRow} col={fallen.gutterCol}
              boop={{ fromRow: fallen.fromRow, fromCol: fallen.fromCol }} landed animationKey={props.animationKey} />
          ))}
        </group>
      </Float>
      <ContactShadows position={[0, -1.03, 0]} opacity={.14} scale={13} blur={2.7} far={5} color="#396b69" />
      <Environment preset="apartment" environmentIntensity={.32} />
      <OrbitControls makeDefault enablePan={false} minDistance={8.5} maxDistance={14}
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
      <Canvas shadows dpr={[1, 1.7]} camera={{ position: [9.2, 10.8, 12], fov: 38 }} gl={{ antialias: true, alpha: true }}>
        <Suspense fallback={null}><Scene {...props} quiltColors={quiltColors} /></Suspense>
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

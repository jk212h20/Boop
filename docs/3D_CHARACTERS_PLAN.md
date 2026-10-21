# 3D characters, motion, and bed — plan

Status: Phases 1–3 done (2026-10-20). Bed restyle shipped; see the addendum.
Owner: `tools/blender/` (assets) and
`client/src/components/FloatingBoard3D.tsx` (runtime behavior).

## Shipped so far

- Kitten and cat are separate body plans (not scaled copies): the kitten is a
  chubby baby (shoulder .40, huge head, stubby thick legs, short curled tail);
  the cat is a slender adult (shoulder .60, smaller head ratio, long legs,
  long tapering tail). Limb/tail blob chains subdivide adaptively so nothing
  renders as detached beads.
- The placement ghost is a pale translucent wash of the player's own team
  colors (shader-mixed from the mask), not a neutral gray.
- Motion is cat-like and verified with a live scene probe
  (`window.__catProbe()` in dev): new pieces WALK in along a gentle arc
  (`Walk` clip) and sit facing the camera; booped pieces crouch in place,
  leap a parabolic arc with squash-and-stretch (`Crouch`/`Jump`/`Land`),
  facing their travel direction; pieces pushed off the bed tumble (`Fall`)
  into the gutter. Timing lives in `animationTiming.ts`
  (`WALK_IN_MS`, `BOOP_DURATION_MS = 800`).

## Is Blender the right tool?

Yes, for authoring. Blender builds the mesh, armature, skin weights, color masks
and clips, and exports glTF that three.js reads natively. The build stays a
headless, reproducible Python script, so a change is reviewed as code instead of
as an opaque binary edit. The motion that depends on game state stays in code:
where to jump, how high the arc goes, where the circle is centered and which way
the cat ends up facing. Blender supplies body poses and loops, and the client
blends them.

## Phase 1 — characters (assets)

- One smooth, cartoon-proportioned body per stage. It is built from metaballs,
  then remeshed and decimated to about 8k triangles. Glossy cartoon eyes with
  glints, a pink nose, a small "w" mouth, ears with pink inner ears, and whiskers.
- Kitten: big head, short stubby legs, short body. Cat: longer body and legs,
  relatively smaller head.
- Armature: root, hips, spine, chest, neck, head, ears, eyes (for blinking), a
  five-bone tail, two-bone legs (four of them). Skin weights are computed
  automatically; the accessories are bound rigidly to their bones.
- Team color is applied at runtime. Vertex-color masks (R = cream belly, muzzle
  and paws; G = tabby stripes) are mixed with the team's fur, light and stripe
  colors. Geometry is cached per team and stage.
- Clips, all in place. Root motion is added in code.
  - Stand
  - Walk (loop, used for circling)
  - SitDown
  - Sit (settled loop: breathing, tail swish, ear twitch)
  - Crouch
  - Jump (airborne)
  - Land
  - Fall (flail)
  - Celebrate
  - Blink (eye bones only, layered)
  - Look (head turn)
- Validation: render EEVEE preview stills of each clip for both stages and look
  at them, then check the export through the browser test.

## Phase 2 — runtime integration

- Clone the scene with `SkeletonUtils.clone`. Create an AnimationMixer per piece.
  Blink is layered on top of the base clip.
- Placement: drop in, land, then walk one to one-and-a-half small circles in the
  cell and sit down facing roughly toward the camera.
- Boop: crouch, jump along a parabolic arc to the target cell, land, then
  circle and sit. `BOOP_DURATION_MS` goes up to about 700, and the queue timing
  in `animationTiming.ts` stays shared.
- Off the bed: crouch, leap over the edge, land on the floor or rug, scamper a
  few steps and fade. Fallen pieces stay alive until the leap finishes.
- Graduation: celebrate hop with a sparkle, then removal.
- Respect `prefers-reduced-motion`: snap moves and skip circling.

## Phase 3 — bed restyle

- Wooden bed frame with a low headboard at the far side, a rounded mattress,
  and a quilt that drapes over the edges with a hem. The quilt patches stay the
  playable cells.
- Round rug and floor under the bed, which the off-bed jumps land on. Float is
  reduced or removed, since the bed now sits on the floor.

## Phase 4 — extras (suggested)

- Head tracking toward the hovered or newly placed piece, and startle
  reactions from the neighbors of a boop.
- Landing dust puff and a "boop!" pop label.
- Hover preview arrows showing which pieces would be pushed.
- Optional WebAudio meows and thumps with a mute toggle.
- Camera-reset button.

## Layout (carried over)

The pools layout from the previous thread is finished and verified by the
breakpoint browser test (`client/tests/boardAppearance.browser.cjs`). Every
breakpoint must be checked visually before committing.

## Phase 3 shipped (2026-10-20)

- Turned legs, a rail box, a piped rail edge, a soft mattress, a quilt that
  overhangs the mattress and hangs over the rails on all four sides with a
  darker hem band, an upholstered headboard between two posts, and a low
  footboard.
- The camera no longer zooms: `FrameBoard` derives one distance per aspect ratio
  so the bed always fills its shell (about 85–90% at desktop), and the fog that
  dimmed the far corners is gone. Scrolling cannot make the board small and dim.
- The return-to-inventory trip is no longer a single 1.3 s blur to the far
  corner: land, trot (1.55 s, stride bob), look up, then hand off to the
  screen-space hop. The trot stops ~4.7 units from the bed centre and pulls
  toward the camera, so the cat measures ~50 px/unit against ~55 px/unit at rest
  instead of shrinking to a speck. `FALLEN_RETURN_EXTRA_MS` extends only the
  off-board animation budget.

## Bug: the page went blank when a booped cat reached the box (2026-10-20)

`InventoryJump` was rendered inside `CatActor`, which lives in the
react-three-fiber tree. Its `createPortal` therefore reconciled through R3F,
which threw `R3F: Canvas is not part of the THREE namespace` as soon as the hop
mounted. React unmounted the whole root: a blank page. The hop is now requested
through `InventoryFlightContext` and rendered by `FloatingBoard3D`, which owns
the DOM `<Canvas>`. A `BoardErrorBoundary` keeps any future 3D failure contained
to the board. `tools/audit/boop-return-regression.cjs` runs the real board and
asserts the page survives, the hop appears, and the cat does not shrink away.

## Graphics pass (2026-10-20, second commit)

- **Shadows:** the key light casts into a 2048 map bounded to the bed; the rug
  receives it, so cats and furniture sit on surfaces instead of floating.
- **No runtime CDN:** `Environment` is built from `<Lightformer>`s, so a failed
  network fetch can no longer leave the board unlit.
- **Quilt contrast:** defaults moved from two similar greys to
  `#b7c4c7` / `#5f7d88`. Anyone still on the old defaults is migrated; an
  explicit choice is never overwritten.
- **Room:** woven rug at the cats' floor height, radial contact occlusion, a
  round bedside table with a mug and books, a toy mouse, and two pillows
  propped behind row 0.
- **Readability:** playable cells advertise themselves with a soft ring, and
  the last move keeps a warm ring plus a corner pip.
- **Motion:** the walk-in bob is locked to the path (stride matches distance)
  with a body roll; idle cats get procedural head glances, a tail swish and ear
  flicks from their own seed, layered on the Sit clip without fighting it.
- **Feedback:** a dust puff at the booped square, a 220ms board shake on impact,
  and a gold halo plus rising sparkles over graduating kittens.
- **Cost:** pool portraits are rendered once from the real rig and cached as
  images, taking the page from five WebGL contexts (six during a return hop) to
  one; shaders are precompiled before the first placement.
- **Accessibility:** `prefers-reduced-motion` now snaps pieces to their cells,
  hides return trips, and disables shake, sparkles and idle motion.
- **Palette UI:** named presets behind a "Bedroom" popover replace two unnamed
  swatches.

## Placement: straight drop plus sheet ripple (2026-10-20)

- A placed piece no longer walks in from outside the quilt. It drops vertically
  onto the clicked square over `DROP_FALL_S` (0.42s), stretches slightly, lands
  with a squash and a small rebound, then sits. `PLACEMENT_DROP_MS = 700` is the
  whole placement budget; the boop delay (500ms) still starts after the landing.
- `SheetRipple` renders once per placement: a 40×40 plane over the landing cell,
  displaced by two damped outward wave crests and faded with a radial alpha map.
  It runs 0.85s from the moment of impact. Its base sits above the lofted patch
  top (y .468), otherwise the quilt hides it.

## The view belongs to the player (2026-10-20)

`FrameBoard` used to rewrite the camera direction to `BOARD_VIEW_DIR` whenever
the board's size changed, so a layout shift on the opponent's turn (or a
Suspense re-entry while a model loads) snapped the orbit back to the default.
It now:

- only ever adjusts the **radius**, along whatever direction the player is
  looking from;
- skips the update entirely when the required distance moves by less than 0.6,
  so a scrollbar appearing is not a camera event at all;
- reads OrbitControls through a ref, so a re-created controls instance cannot
  re-trigger framing.

The Canvas camera/gl options are module constants too, because react-three-fiber
re-applies camera options when that object changes identity.
`tools/audit/camera-view-regression.cjs` drags the board, then asserts the orbit
survives a layout shift, a placement plus the computer's reply, and a breakpoint
change.

## The television corner, a royal blue rug, and kitten-sized portraits (2026-10-21)

- The screen is plain dark glass: an earlier diagonal highlight rectangle read
  as a sticker rather than a reflection and was removed.
- **Second table.** A mirrored drum table at `[-4.95, FLOOR_Y - .012, -1.15]`
  carries an old box television: a walnut cabinet, a plain dark tube, two
  pointer dials, a power lamp, speaker slots, and rabbit ears
  (a mount on the lid plus two splayed rods with ball tips). The set is turned
  `.55` rad on its table so its screen faces the bed and the player.
- **The cord.** A single `TubeGeometry` over `TV_CORD_POINTS`. It enters the
  cabinet's back panel, swings out behind the set, lies on the table top behind
  it, spills over the back rim, drops down the far side of the drum to the floor
  and runs away under the bed. It is drawn in room space, not inside the rotated
  set, because the run ends nowhere near the set's axes. Behind the set, not
  across its front: the earlier route rounded the near corner and crossed the
  table where the player could see it, which read as clutter rather than as a
  cable. `window.__cordProbe()` samples the same curve, and the browser test
  measures that path against the table, the set and the bed's hem, because a
  cord hidden behind the set cannot be judged from pixels. The points are chosen
  so the tube clears the cabinet's back face (the only thing it enters is the
  panel it plugs into), stays above the table top while it is over it and
  outside the rim once it drops, and passes under the bed's hem rather than
  through it; the spline was tuned so it does not undershoot into the rug.
- **Rules explainer.** The screen is a click target with a pointer cursor and
  `userData.roomProp = 'tv'`. Clicking it opens `.rules-video`, a 16:9 popup
  player (`role="dialog"`, focus on the close button, Escape and backdrop both
  close). It plays `client/public/video/boop-rules.mp4` (1920x1080, 4:16).
  `RULES_VIDEO_SRC` is the constant that names it; set it to `null` and the
  panel falls back to a placeholder card instead of a broken video.
- **Royal blue rug.** Pile `#3f57d8` with a `#16204d` rim, replacing graphite
  `#5d6469` / `#20282c`. The weave map multiplies over the base, so the base is
  more saturated than the blue that lands on screen; measured on-screen pile is
  around `rgb(80, 95, 195)` in light and `rgb(28, 39, 93)` in shadow.
- **Portraits.** The inventory portraits now frame the model rather than a fixed
  camera position, crop to the animal's own pixels (supersampled 2×, then
  re-drawn into 192×216 with a 6% margin) and put both types on one baseline.
  The kitten is drawn at its true height relative to the cat, less another 8%,
  so it occupies ~0.55 of the portrait against the cat's ~0.88 instead of being
  stretched to fill the box and reading as a full-grown cat.

Regressions: `client/tests/boardAppearance.browser.cjs` measures the portraits'
alpha bounds (no edge contact, kitten under 85% of the cat), clicks the
television's projected screen point and closes the popup both ways, samples the
rendered rug for royal blue, and samples the cord's table run for the grey
cable. `window.__project` and `window.__roomProbe` expose world→page projection
and the tagged clickable props, so the test never guesses pixel coordinates.

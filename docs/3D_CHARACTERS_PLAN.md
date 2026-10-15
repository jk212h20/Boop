# 3D characters, motion, and bed — plan

Status: Phases 1–2 done (2026-10-15). Phase 3 (bed restyle) is next.
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

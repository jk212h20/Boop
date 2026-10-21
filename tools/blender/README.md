# Boop 3D character assets

`build_cat_models.py` is the authoritative Blender source for the game's two
web models:

- `client/public/assets/models/boop-kitten.glb`
- `client/public/assets/models/boop-cat.glb`

Rebuild with Blender 5.2 or later (headless, reproducible):

```bash
blender --background --factory-startup --python tools/blender/build_cat_models.py
```

`preview_cat.py` renders EEVEE stills of every clip for visual review:

```bash
blender --background tools/blender/out/boop-kitten.blend --python tools/blender/preview_cat.py -- kitten
# writes /tmp/boop-preview/kitten-<Clip>-{front,side}.png plus rest turnarounds
```

## What is in each GLB

- One smooth metaball-derived cartoon body (~8–11k triangles), glossy cartoon
  eyes with glints, pink nose, "w" mouth, whiskers, ears with pink inner ears.
- A quadruped armature (root, hips, spine, chest, neck, head, ears, eyes, a
  five-bone tail, two-bone legs) skinned with automatic weights; the
  accessories are rigidly bound to single bones.
- Clips: `Stand`, `Walk`, `Sit`, `Crouch`, `Jump`, `Land`, `Fall`,
  `Celebrate`, `Dance`, `Curious`, `Sleepy`, `Blink`. All are in-place; the client adds root motion.
- A `Mask` vertex-color attribute (R = white tuxedo split/belly/muzzle/paws, G = reserved). Team colors are mixed in the client shader
  (`boardAppearance.ts`), so one GLB serves both players.
- Adults alone wear rounded dark lenses with team-accent frames/arms; kittens have open cartoon eyes and no glasses.
- Models face -Y in Blender, which becomes +Z after glTF Y-up export —
  toward the default camera.

See `docs/3D_CHARACTERS_PLAN.md` for the runtime behavior plan (circling,
boop jumps, bed restyle).

## Animation QA (2026-10-21)

Grounded tail skin is sampled at every frame of Sit, Stand, Curious, Sleepy,
Walk, Crouch, Land and Dance for both models by `test_animation_floor.py`.
Run the authoring build and this check through Visual’s exception-safe Blender
runner. Clips have dense loop sampling; Blink animates only eye scales. The
client uses unwarped crossfades, one-shot held action poses, staggered curious /
sleepy idles, and a victory dance for winning adult rows (all adults for eight-cat
wins). Board pieces finish their placement/boop before dancing.

Browser regressions `client/tests/animation.browser.cjs` and
`client/tests/inventoryReturn.browser.cjs` use the devports-verified
`BOOP_TEST_URL`. Dev-only `?preview3d&win` and `?preview3d&return` fixtures cover
victory and off-bed return. Victory status is out of flow; on narrow screens it
replaces the header content visually rather than overlapping it. A returned
piece’s viewport overlay lands with exactly the destination portrait’s position
and dimensions before disappearing. The final hop uses the shared cached model
portrait, not a second live WebGL context; it is a cosmetic handoff, not an
independent full-rig jump rendered within the pool.

Graduation arrivals use the same exact portrait-bound handoff after their landing,
rather than shrinking away beside the inventory image.

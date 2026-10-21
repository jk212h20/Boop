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

### Tail and accessory correction (2026-10-21)

Tail centerlines use Catmull-Rom interpolation before metaball meshing, with a
slower, lower-amplitude traveling sway rather than a large root swing. Ground
clearance remains covered by the full-loop skin test. Runtime vertex colors are
explicitly disabled on non-fur materials: the joined GLB's zero-valued fur Mask
was multiplying eye and glasses materials to black. Adult frame color is the
team fur accent (orange `#ed6b25` for orange), while kittens contain no glasses
primitives. An appearance regression checks this accessory-mask isolation.

### Articulated feet and whiskers (2026-10-21)

Legs now use individual rounded upper/lower segments, explicitly bound to their
own bones; paws are separate rounded white meshes with underside pads. Torso
skin excludes limb weights, eliminating the heat-weighted central web exposed
by raised dance paws. IK keeps sole orientation horizontal instead of pitching
feet with the shins. `review_feet.py` renders low-angle and underside views of
both models in Sit, Walk, Dance, Jump, Land and Crouch. Whiskers use near-black
material and a thin 0.008-head-radius curve bevel.

Foot review outcome: repaired seated/dancing close-ups show no detached paws or
stretched membranes. Rounded articulated joints retain visible cartoon seams;
they are not a seamless organic limb sculpt. Whiskers use an almost-black matte
material to avoid gray specular glare, with the same fine strand radius.

### Socks and walk home (2026-10-21)

Both kitten and adult have two asymmetrical team-color paw/leg patches while
retaining white socks. Patch masks are authored in each rigid mesh's local
coordinates. Runtime recognizes Blender-suffixed Fur material names so joined
accessory fur retains the same team-color shader.

Walk is a dense 36-frame four-beat cycle (hind-left, front-left, hind-right,
front-right), with a 65% planted stance and a short eased toe-clearance swing.
The torso bob is minimal. The cosmetic walk-home path uses smooth acceleration /
deceleration; mixer cadence tracks path velocity with a bounded speed. The
return budget is 12 seconds to preserve longer walks without removing the cat
mid-trip; next turns remain independent. `client/tests/walk.browser.cjs` records
45 encoded browser screenshots and advancing root transforms for visual review.

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
  `Celebrate`, `Blink`. All are in-place; the client adds root motion.
- A `Mask` vertex-color attribute (R = cream belly/muzzle/paws, G = tabby
  stripes). Team colors are mixed in the client shader
  (`boardAppearance.ts`), so one GLB serves both players.
- Models face -Y in Blender, which becomes +Z after glTF Y-up export —
  toward the default camera.

See `docs/3D_CHARACTERS_PLAN.md` for the runtime behavior plan (circling,
boop jumps, bed restyle).

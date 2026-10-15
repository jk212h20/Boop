# Boop 3D character assets

`build_kitten_models.py` is the authoritative Blender source for the game's two
web models:

- `client/public/assets/models/boop-kitten.glb`
- `client/public/assets/models/boop-cat.glb`

Rebuild with Blender 5.2 or later:

```bash
blender --background --factory-startup --python tools/blender/build_kitten_models.py
```

The GLBs deliberately use neutral named materials. `FloatingBoard3D.tsx`
recolors cloned materials for each team at runtime and drives idle breathing,
placement drops, directional hop arcs, landing squash, graduation glow, and
board floating in direct response to game state.

"""Render preview stills of every clip in the Boop cat .blend work files.

Run headlessly after build_cat_models.py:
  blender --background tools/blender/out/boop-kitten.blend --python tools/blender/preview_cat.py -- kitten

Writes /tmp/boop-preview/<stage>-<clip>-<view>.png (front three-quarter and
side views at the clip's midpoint) plus a rest-pose turnaround.
"""
from pathlib import Path
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["kitten"]
STAGE = argv[0]
OUT = Path("/tmp/boop-preview")
OUT.mkdir(exist_ok=True)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = 32
scene.render.resolution_x = 480
scene.render.resolution_y = 480
scene.render.fps = 30

# Soft studio backdrop.
world = bpy.data.worlds.new("PreviewWorld")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.83, 0.87, 0.90, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 1.0
scene.world = world

# Ground plane.
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -0.01))
ground = bpy.context.object
gm = bpy.data.materials.new("Ground")
gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.92, 0.89, 0.84, 1)
ground.data.materials.append(gm)

for name, loc, energy in (("key", (2.5, -3.5, 4.0), 900), ("fill", (-3.5, -1.5, 2.5), 300),
                          ("rim", (0, 4.0, 3.0), 500)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.size = 3.0
    rot = Vector((0, 0, 0)) - Vector(loc)
    light.rotation_euler = rot.to_track_quat("-Z", "Y").to_euler()

arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
cat = next(o for o in bpy.data.objects if o.type == "MESH")
center = Vector((0, 0, 0.6))

# Show team coloring in previews by tinting the white fur material.
fur = next((m for m in cat.data.materials if m and m.name == "Fur"), None)
if fur:
    bsdf = fur.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.90, 0.55, 0.20, 1)

cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def shoot(angle_deg, path, distance=3.4, elevation=12):
    a = math.radians(angle_deg)
    loc = center + Vector((math.sin(a) * distance, -math.cos(a) * distance, math.tan(math.radians(elevation)) * distance))
    cam.location = loc
    cam.rotation_euler = (center - loc).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


# Rest pose turnaround.
for angle in (0, 35, 90, 180):
    shoot(angle, OUT / f"{STAGE}-rest-{angle}.png")

# Mid-frame of every action.
for action in sorted(bpy.data.actions, key=lambda a: a.name):
    ad = arm.animation_data
    ad.action = action
    try:
        ad.action_slot = action.slots[0]
    except (IndexError, AttributeError):
        pass
    f0, f1 = action.frame_range
    mid = (f0 + f1) / 2
    scene.frame_set(int(mid))
    shoot(35, OUT / f"{STAGE}-{action.name}-front.png")
    shoot(90, OUT / f"{STAGE}-{action.name}-side.png")
    print("rendered", action.name, flush=True)

arm.animation_data.action = None
print("previews done", flush=True)

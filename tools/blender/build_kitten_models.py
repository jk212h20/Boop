"""Build the reusable Boop kitten and grown-cat GLB models in Blender.

Run headlessly; outputs are web-ready GLB files consumed by React Three Fiber.
The two neutral models are recolored per team at runtime. Animation remains in
code so game events can blend immediately into directional hops.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "client" / "public" / "assets" / "models"
OUT.mkdir(parents=True, exist_ok=True)


def mat(name, color, rough=.72):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return m


def smooth(obj, bevel=.025):
    for p in getattr(obj.data, "polygons", []):
        p.use_smooth = True
    if bevel:
        mod = obj.modifiers.new("soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return obj


def sphere(name, loc, scale, material, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    o.data.materials.append(material)
    o.parent = parent
    return smooth(o)


def cone(name, loc, radius, depth, material, parent, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=radius, radius2=.015,
                                    depth=depth, location=loc, rotation=rotation)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(material)
    o.parent = parent
    return smooth(o)


def tube(name, points, bevel, material, parent):
    c = bpy.data.curves.new(name, "CURVE")
    c.dimensions = "3D"
    c.bevel_depth = bevel
    c.bevel_resolution = 3
    spl = c.splines.new("BEZIER")
    spl.bezier_points.add(len(points)-1)
    for bp, co in zip(spl.bezier_points, points):
        bp.co = co
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(material)
    o.parent = parent
    return o


def build(stage):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.curves):
        for block in list(datablocks):
            datablocks.remove(block)

    fur = mat("Fur", (.68, .68, .68))
    light = mat("Muzzle", (.94, .83, .70))
    stripe = mat("Markings", (.17, .14, .16))
    iris = mat("Eyes", (.25, .68, .45), .3)
    pupil = mat("Pupils", (.025, .02, .03), .28)
    pink = mat("NoseAndEars", (.95, .38, .44))
    white = mat("EyeGlints", (1, 1, 1), .25)

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root = bpy.context.object
    root.name = "BoopCatRoot"
    adult = stage == "cat"
    s = 1.06 if adult else .91

    sphere("Body", (0, .02, .64*s), ((.52 if adult else .49)*s, .40*s, (.62 if adult else .55)*s), fur, root)
    for x in (-.35, .35):
        sphere("Haunch", (x*s, .08*s, .35*s), (.31*s, .32*s, .30*s), fur, root)
    for x in (-.19, .19):
        sphere("FrontPaw", (x*s, -.34*s, .16*s), (.18*s, .25*s, .13*s), light, root)
        sphere("Toe", (x*s, -.53*s, .14*s), (.14*s, .12*s, .075*s), fur, root)

    hz = (1.10 if adult else 1.03)*s
    sphere("Head", (0, -.04*s, hz), ((.48 if adult else .52)*s, .43*s, (.44 if adult else .48)*s), fur, root)
    spread = .32 if adult else .34
    for sign in (-1, 1):
        cone("Ear", (sign*spread*s, -.01*s, hz+.43*s), .23*s, .50*s, fur, root,
             (0, math.radians(sign*6), math.radians(-sign*4)))
        cone("InnerEar", (sign*spread*s, -.25*s, hz+.42*s), .115*s, .30*s, pink, root,
             (math.radians(10), math.radians(sign*5), math.radians(-sign*4)))
        sphere("Muzzle", (sign*.13*s, -.405*s, hz-.08*s), (.18*s, .10*s, .14*s), light, root)
        sphere("Eye", (sign*.19*s, -.425*s, hz+.105*s), (.105*s, .042*s, .115*s), iris, root)
        sphere("Pupil", (sign*.19*s, -.468*s, hz+.105*s), (.035*s, .018*s, .073*s), pupil, root)
        sphere("Glint", ((sign*.19-.025)*s, -.489*s, hz+.15*s), (.018*s, .009*s, .021*s), white, root)
        for dz in (-.055, .025):
            tube("Whisker", [Vector((sign*.16*s, -.50*s, hz+dz*s)),
                              Vector((sign*.37*s, -.57*s, hz+(dz+.02)*s)),
                              Vector((sign*.54*s, -.53*s, hz+(dz+.07)*s))], .009*s, light, root)
    sphere("Nose", (0, -.522*s, hz-.035*s), (.075*s, .045*s, .055*s), pink, root)

    for x, z in ((0, .22), (-.13, .15), (.13, .15)):
        cone("Stripe", (x*s, -.438*s, hz+z*s), .043*s, .17*s, stripe, root, (math.radians(90), 0, 0))

    if adult:
        for sign in (-1, 1):
            tube("Brow", [Vector((sign*.10*s, -.47*s, hz+.27*s)),
                          Vector((sign*.20*s, -.48*s, hz+.31*s)),
                          Vector((sign*.30*s, -.46*s, hz+.25*s))], .018*s, stripe, root)

    side = -1
    tube("Tail", [Vector((side*.35*s, .22*s, .40*s)), Vector((side*.68*s, .22*s, .52*s)),
                  Vector((side*.78*s, -.02*s, .87*s)), Vector((side*.61*s, -.15*s, 1.08*s))],
         .095*s, fur, root)

    bpy.context.view_layer.objects.active = root
    root.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / f"boop-{stage}.blend"))
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"boop-{stage}.glb"), export_format="GLB",
                              use_selection=False, export_apply=True,
                              export_materials="EXPORT", export_yup=True)
    print(f"exported {stage}", flush=True)


for kind in ("kitten", "cat"):
    build(kind)

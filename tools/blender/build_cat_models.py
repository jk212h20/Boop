"""Build rigged, skinned, animated Boop cat and kitten GLB models.

Run headlessly:
  blender --background --factory-startup --python tools/blender/build_cat_models.py

Outputs:
  client/public/assets/models/boop-kitten.glb
  client/public/assets/models/boop-cat.glb
  tools/blender/out/boop-<stage>.blend   (work file for previews)

The models are built from metaballs (one smooth cartoon body), rigged with a
quadruped armature (standing rest pose), skinned with automatic weights, and
keyed with the game clips: Stand, Walk, Sit, Crouch, Jump, Land, Fall,
Celebrate, Blink. Team coloring happens at runtime via the `Mask` vertex-color
attribute (R = cream belly/muzzle/paws, G = tabby stripes).

Convention: ground at z=0, the cat faces -Y. glTF export (Y up) turns this
into facing +Z, toward the default camera.
"""
from pathlib import Path
import math

import bpy
from mathutils import Euler, Quaternion, Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "client" / "public" / "assets" / "models"
OUT.mkdir(parents=True, exist_ok=True)
WORK = Path(__file__).resolve().parent / "out"
WORK.mkdir(parents=True, exist_ok=True)

FPS = 30
TARGET_TRIS = 11000

# Fully explicit body plans per stage — the two stages are NOT scaled copies.
# Kitten: chubby baby (short legs, round fat body, huge head, stubby curled
# tail, thick limbs). Cat: slender adult (long legs, elongated torso, smaller
# head ratio, long neck, long tapering tail).
STAGES = ("kitten", "cat")


def _layout(p):
    """Assemble the layout dict from a stage's named proportions.

    Ground z=0, facing -Y. `shoulder` is the standing shoulder height.
    """
    V = lambda x, y, z: Vector((x, y, z))
    r = p["radii"]
    L = {
        "rump": V(0, p["rump_y"], p["rump_z"]),
        "chest": V(0, p["chest_y"], p["chest_z"]),
        "neck_end": V(0, *p["neck_end"]),
        "head_top": V(0, *p["head_top"]),
        "head_c": V(0, *p["head_c"]),
        "ear_base": [None, None],
        "torso": [V(0, *t) for t in p["torso"]],
        "torso_ratio": p["torso_ratio"],
        "haunch": [None, None],
        "neck_chain": [[V(0, *c) for c in p["neck_chain"]], [R_ for R_ in p["neck_radii"]]],
        "cheeks": [None, None],
        "chin": V(0, *p["chin"]),
        "muzzle": [None, None],
        "tail": [V(0, *t) for t in p["tail"]],
        "radii": dict(r_body=r["r_body"], head_r=r["head_r"], leg=r["leg"], paw=r["paw"],
                      tail=list(r["tail"])),
    }
    L["front"] = {}
    L["hind"] = {}
    for side, i in ((-1, 0), (1, 1)):
        L["ear_base"][i] = V(side * p["ear_dx"], p["ear_base"][1], p["ear_base"][2])
        L["haunch"][i] = V(side * p["haunch"][0], p["haunch"][1], p["haunch"][2])
        L["cheeks"][i] = V(side * p["cheek_dx"], p["cheek_y"], p["cheek_z"])
        L["muzzle"][i] = V(side * p["muzzle_dx"], p["muzzle_y"], p["muzzle_z"])
        sh, kn, wr, pw = p["front_leg"]
        L["front"]["RL"[i > 0]] = (V(side * sh[0], sh[1], sh[2]), V(side * kn[0], kn[1], kn[2]),
                                   V(side * wr[0], wr[1], wr[2]), V(side * pw[0], pw[1], pw[2]))
        hp, kn2, hk, toe = p["hind_leg"]
        L["hind"]["RL"[i > 0]] = (V(side * hp[0], hp[1], hp[2]), V(side * kn2[0], kn2[1], kn2[2]),
                                  V(side * hk[0], hk[1], hk[2]), V(side * toe[0], toe[1], toe[2]))
    L["H"] = L["chest"].z
    L["B"] = L["rump"].y - L["chest"].y
    return L


LAYOUTS = {
    # -- Kitten: round and chubby -----------------------------------------
    "kitten": _layout(dict(
        rump_y=.26, rump_z=.37, chest_y=-.11, chest_z=.40,   # shoulder .40
        torso=[(.18, .385), (.0, .405), (-.15, .405)],
        torso_ratio=[(.99, 1.30, 1.08), (.96, 1.28, 1.06), (.90, 1.14, 1.02)],
        haunch=(.09, .15, .345),
        neck_chain=[(-.14, .44), (-.18, .55), (-.22, .64)],
        neck_radii=(.195, .165, .155),
        neck_end=(-.24, .68), head_top=(-.28, .90), head_c=(-.27, .75),
        ear_dx=.125, ear_base=(0, -.29, .845),
        cheek_dx=.12, cheek_y=-.34, cheek_z=.695,
        chin=(-.33, .655), muzzle_dx=.06, muzzle_y=-.42, muzzle_z=.71,
        tail=[(.32, .355), (.44, .395), (.50, .495), (.46, .61), (.38, .685)],
        radii=dict(r_body=.255, head_r=.24, leg=.12, paw=.088,
                   tail=(.078, .070, .062, .053, .045)),
        front_leg=[(.095, -.13, .29), (.10, -.13, .165), (.10, -.13, .06), (.10, -.205, .03)],
        hind_leg=[(.10, .16, .29), (.10, -.02, .165), (.10, .07, .08), (.10, -.105, .03)],
    )),
    # -- Cat: slender adult -------------------------------------------------
    "cat": _layout(dict(
        rump_y=.30, rump_z=.55, chest_y=-.14, chest_z=.60,   # shoulder .60
        torso=[(.20, .565), (.0, .585), (-.17, .595)],
        torso_ratio=[(.86, 1.40, .94), (.83, 1.40, .92), (.79, 1.26, .90)],
        haunch=(.075, .18, .525),
        neck_chain=[(-.16, .62), (-.22, .78), (-.30, .98)],
        neck_radii=(.16, .13, .115),
        neck_end=(-.34, 1.10), head_top=(-.39, 1.34), head_c=(-.38, 1.18),
        ear_dx=.10, ear_base=(0, -.41, 1.275),
        cheek_dx=.10, cheek_y=-.46, cheek_z=1.095,
        chin=(-.45, 1.045), muzzle_dx=.05, muzzle_y=-.52, muzzle_z=1.105,
        tail=[(.36, .52), (.56, .64), (.70, .86), (.68, 1.10), (.54, 1.26)],
        radii=dict(r_body=.23, head_r=.185, leg=.082, paw=.068,
                   tail=(.056, .049, .042, .036, .029)),
        front_leg=[(.075, -.18, .42), (.08, -.18, .22), (.08, -.18, .065), (.08, -.26, .032)],
        hind_leg=[(.085, .18, .42), (.085, -.04, .23), (.085, .09, .095), (.085, -.13, .03)],
    )),
}


def smoothstep(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def smooth_window(x, lo, mid, hi):
    return smoothstep(x, lo, mid) * (1 - smoothstep(x, mid, hi))


def direction_quat(direction):
    """Quaternion rotating local +Z onto `direction`."""
    d = Vector(direction).normalized()
    axis = Vector((0, 0, 1)).cross(d)
    if axis.length < 1e-6:
        return Quaternion((1, 0, 0, 0))
    return Quaternion(axis.normalized(), math.acos(max(-1.0, min(1.0, Vector((0, 0, 1)).dot(d)))))


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.materials, bpy.data.meshes, bpy.data.armatures,
                       bpy.data.curves, bpy.data.metaballs):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def shade_smooth(obj):
    obj.data.polygons.foreach_set("use_smooth", [True] * len(obj.data.polygons))
    obj.data.update()


def make_materials():
    mats = {}

    def add(name, color, rough=.62):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (*color, 1)
        bsdf.inputs["Roughness"].default_value = rough
        mats[name] = m
        return m

    add("Fur", (1, 1, 1), .78)              # white; team color comes from vertex colors
    add("Eyes", (.10, .10, .13), .12)       # glossy near-black sclera
    add("Iris", (.25, .55, .45), .25)
    add("Pupils", (.02, .02, .03), .15)
    add("EyeGlints", (1, 1, 1), .10)
    add("NoseAndEars", (.93, .48, .50), .50)
    add("Mouth", (.45, .26, .28), .55)
    add("Whiskers", (.96, .93, .88), .50)
    return mats


# ---------------------------------------------------------------------------
# Armature
# ---------------------------------------------------------------------------

def build_armature(L):
    head_c, head_r = L["head_c"], L["radii"]["head_r"]

    arm = bpy.data.armatures.new("CatRig")
    obj = bpy.data.objects.new("CatRig", arm)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None, deform=True):
        e = arm.edit_bones.new(name)
        e.head, e.tail = Vector(head), Vector(tail)
        if parent:
            e.parent = arm.edit_bones[parent]
        e.use_deform = deform
        return e

    bone("root", (0, 0, 0), (0, 0, 0.05), deform=False)
    bone("hips", L["rump"], L["rump"] + Vector((0, -0.10, 0.06)), "root")
    bone("spine", L["rump"], L["chest"], "hips")
    bone("chest", L["chest"], L["chest"] + Vector((0, -0.08, 0.10)), "spine")
    bone("neck", L["chest"], L["neck_end"], "chest")
    bone("head", L["neck_end"], L["head_top"], "neck")

    for side, tag, base in ((-1, "R", L["ear_base"][0]), (1, "L", L["ear_base"][1])):
        bone(f"ear.{tag}", base, base + Vector((side * 0.05, -0.03, 0.30)), "head", deform=False)
        eye = Vector((side * 0.13, head_c.y - 0.72 * head_r, head_c.z - 0.10 * head_r))
        bone(f"eye.{tag}", eye, eye + Vector((0, 0, 0.10 * head_r)), "head", deform=False)

    for tag in ("R", "L"):
        sh, el, wr, pw = L["front"][tag]
        bone(f"frontUpper.{tag}", sh, el, "chest")
        bone(f"frontLower.{tag}", el, wr, f"frontUpper.{tag}")
        bone(f"frontPaw.{tag}", wr, pw, f"frontLower.{tag}")
        hip, knee, hock, toe = L["hind"][tag]
        bone(f"hindUpper.{tag}", hip, knee, "hips")
        bone(f"hindLower.{tag}", knee, hock, f"hindUpper.{tag}")
        bone(f"hindPaw.{tag}", hock, toe, f"hindLower.{tag}")

    prev = "hips"
    for i, pt in enumerate(L["tail"]):
        nxt = L["tail"][i + 1] if i + 1 < len(L["tail"]) else pt + Vector((0, -0.08, 0.08))
        bone(f"tail{i}", pt, nxt, prev)
        prev = f"tail{i}"

    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


# ---------------------------------------------------------------------------
# Body mesh (metaballs)
# ---------------------------------------------------------------------------

def blob(mb, co, radius, ratio=(1, 1, 1)):
    e = mb.elements.new()
    e.co = Vector(co)
    # Surface radius at default stiffness/threshold is ~0.575x the element radius.
    e.radius = radius * 1.74
    e.size_x, e.size_y, e.size_z = ratio
    return e


def chain_blobs(mb, pts, radii):
    """Blob chain with adaptive subdivision so consecutive surface radii always
    overlap (thin tails / long legs would otherwise render as detached beads)."""
    pts = [Vector(pt) for pt in pts]
    for a, b, ra, rb in zip(pts, pts[1:], radii, radii[1:]):
        dist = (b - a).length
        # Blobs merge when centers are well inside the sum of their effective
        # surface radii (~0.575x element radius); subdivide to guarantee it.
        n = max(1, math.ceil(dist / max(1e-4, 0.55 * 0.575 * (ra + rb))))
        for k in range(n + 1):
            t = k / n
            blob(mb, a.lerp(b, t), ra + (rb - ra) * t)
    blob(mb, pts[-1], radii[-1])


def build_body(L, stage):
    r_body, head_r = L["radii"]["r_body"], L["radii"]["head_r"]

    mb = bpy.data.metaballs.new("CatBody")
    mb.resolution = 0.03
    mb.render_resolution = 0.02
    mb.threshold = 0.6
    obj = bpy.data.objects.new("CatBody", mb)
    bpy.context.collection.objects.link(obj)

    for co, ratio in zip(L["torso"], L["torso_ratio"]):
        blob(mb, co, r_body, ratio)
    for co in L["haunch"]:
        blob(mb, co, r_body * 0.80)
    chain_blobs(mb, L["neck_chain"][0], L["neck_chain"][1])
    blob(mb, L["head_c"], head_r * 0.96, (1.0, 0.92, 0.92))
    for co in L["cheeks"]:
        blob(mb, co, head_r * 0.57)
    blob(mb, L["chin"], head_r * 0.40)  # chin
    for co in L["muzzle"]:
        blob(mb, co, head_r * 0.30)

    for tag in ("R", "L"):
        sh, el, wr, pw = L["front"][tag]
        chain_blobs(mb, [sh, el, wr], [r_body * 0.44, r_body * 0.34, r_body * 0.30])
        blob(mb, (wr.x, (sh.y + pw.y) / 2, 0.055), L["radii"]["paw"], (1.06, 1.5, 0.82))
        hip, knee, hock, toe = L["hind"][tag]
        chain_blobs(mb, [hip, knee, hock], [r_body * 0.58, r_body * 0.34, r_body * 0.30])
        chain_blobs(mb, [hock, (hock + toe) / 2, toe], [L["radii"]["paw"] * 0.94,
                                                        L["radii"]["paw"] * 0.75, L["radii"]["paw"] * 0.81])

    chain_blobs(mb, L["tail"], L["radii"]["tail"])

    obj.data.materials.append(bpy.data.materials["Fur"])
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.view_layer.objects.active
    shade_smooth(obj)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.004)
    bpy.ops.mesh.normals_make_consistent()
    bpy.ops.object.mode_set(mode="OBJECT")

    mesh = obj.data
    tris = sum(len(poly.vertices) - 2 for poly in mesh.polygons)
    ratio = min(1.0, TARGET_TRIS / max(tris, 1))
    dec = obj.modifiers.new("decimate", "DECIMATE")
    dec.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="decimate")
    mesh = obj.data
    print(f"[{stage}] body: {len(mesh.vertices)} verts, "
          f"{sum(len(poly.vertices) - 2 for poly in mesh.polygons)} tris (was {tris})", flush=True)
    return obj


def paint_mask(obj, L):
    """Vertex color mask: R = cream (belly/muzzle/paws), G = tabby stripes."""
    head_r, r_body = L["radii"]["head_r"], L["radii"]["r_body"]
    head_c, chest = L["head_c"], L["chest"]
    mesh = obj.data
    attr = mesh.color_attributes.new(name="Mask", type="BYTE_COLOR", domain="POINT")
    colors = []
    y0, y1 = chest.y - 0.3, head_c.y  # stripe zone across the back
    for v in mesh.vertices:
        co, n = v.co, v.normal
        cream = 0.0
        if co.y < 0.05 and co.z < 0.30 and n.z < -0.15:
            cream = 0.85  # belly
        if co.z < 0.13:
            cream = max(cream, 0.9)  # paws
        if co.y < head_c.y - 0.45 * head_r and co.z < head_c.z - 0.10 * head_r:
            cream = max(cream, 0.9)  # muzzle
        stripe = 0.0
        if n.z > 0.25 and y0 < co.y < y1 and co.z > 0.40:
            wave = 0.5 + 0.5 * math.sin((co.y - y0) / (y1 - y0) * math.pi * 7)
            stripe = smooth_window(wave, .30, .5, .70) * smoothstep(n.z, .25, .8) * 0.85
        colors.extend((cream, stripe, 0.0, 1.0))
    attr.data.foreach_set("color", colors)
    try:
        mesh.color_attributes.render_color = attr
    except AttributeError:
        pass  # Blender 5 removed this; the active attribute is what exports
    mesh.color_attributes.active_color = attr
    mesh.update()


# ---------------------------------------------------------------------------
# Accessories (rigid parts, bound to single bones)
# ---------------------------------------------------------------------------

def surface_point(bvh, origin, direction):
    location, normal = bvh.ray_cast(Vector(origin), Vector(direction).normalized())[:2]
    return location, normal.normalized()


def build_accessories(arm_obj, L, mats, bvh):
    head_r = L["radii"]["head_r"]
    head_c = L["head_c"]
    parts = []  # (object, bone name)

    def sphere(name, co, scale, mat, bone, orient=Quaternion((1, 0, 0, 0))):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=co)
        o = bpy.context.object
        o.name = name
        o.scale = scale
        o.rotation_mode = "QUATERNION"
        o.rotation_quaternion = orient
        o.data.materials.append(mat)
        shade_smooth(o)
        parts.append((o, bone))
        return o

    def curve_mesh(name, pts, depth, mat, bone):
        c = bpy.data.curves.new(name, "CURVE")
        c.dimensions = "3D"
        c.bevel_depth = depth
        c.bevel_resolution = 2
        spl = c.splines.new("BEZIER")
        spl.bezier_points.add(len(pts) - 1)
        for bp, pt in zip(spl.bezier_points, pts):
            bp.co = pt
            bp.handle_left_type = bp.handle_right_type = "AUTO"
        o = bpy.data.objects.new(name, c)
        bpy.context.collection.objects.link(o)
        c.materials.append(mat)
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.convert(target="MESH")
        o = bpy.context.view_layer.objects.active
        shade_smooth(o)
        parts.append((o, bone))
        return o

    for side, tag in ((-1, "R"), (1, "L")):
        # Eyes: glossy dark sphere + iris + pupil + glints, placed on the head
        # surface and flattened along the surface normal.
        eye_dir = Euler((math.radians(-10), 0, math.radians(-side * 30)), "XYZ").to_matrix() @ Vector((0, -1, 0.15))
        co, n = surface_point(bvh, head_c, eye_dir)
        q = direction_quat(-n)
        up = n.cross(Vector((side, 0, 0))).normalized()
        sphere(f"Eye.{tag}", co + n * 0.005, (head_r * .34, head_r * .34, head_r * .20), mats["Eyes"], f"eye.{tag}", q)
        sphere(f"Iris.{tag}", co + n * head_r * .055, (head_r * .22, head_r * .22, head_r * .12), mats["Iris"], f"eye.{tag}", q)
        sphere(f"Pupil.{tag}", co + n * head_r * .085, (head_r * .13, head_r * .13, head_r * .07), mats["Pupils"], f"eye.{tag}", q)
        for sgn in (1, -1):
            glint = co + n * head_r * .12 + up * sgn * head_r * .10 - Vector((side * head_r * .10, 0, 0))
            size = head_r * (.055 if sgn > 0 else .030)
            sphere(f"Glint{sgn}.{tag}", glint, (size, size, head_r * .05), mats["EyeGlints"], f"eye.{tag}", q)
        for dz in (-1, 0, 1):
            start = co + Vector((side * head_r * .18, -head_r * .30, dz * head_r * .16))
            curve_mesh(f"Whisker.{tag}{dz}",
                       [start,
                        start + Vector((side * head_r * .55, -head_r * .12, dz * head_r * .3)),
                        start + Vector((side * head_r * 1.15, -head_r * .02, dz * head_r * .55))],
                       head_r * .012, mats["Whiskers"], f"eye.{tag}")

    nose_dir = Euler((math.radians(-18), 0, 0), "XYZ").to_matrix() @ Vector((0, -1, 0))
    nco, nn = surface_point(bvh, head_c + Vector((0, 0, -0.12 * head_r)), nose_dir)
    sphere("Nose", nco - nn * 0.004, (head_r * .13, head_r * .10, head_r * .085), mats["NoseAndEars"], "head")
    base = nco + Vector((0, -head_r * .02, -head_r * .10))
    curve_mesh("Mouth", [base + Vector((-head_r * .13, 0, -head_r * .02)),
                         base + Vector((-head_r * .06, 0, -head_r * .10)),
                         base + Vector((head_r * .06, 0, -head_r * .10)),
                         base + Vector((head_r * .13, 0, -head_r * .02))],
               head_r * .018, mats["Mouth"], "head")

    for side, tag, eb in ((-1, "R", L["ear_base"][0]), (1, "L", L["ear_base"][1])):
        bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=head_r * .38, radius2=head_r * .02,
                                        depth=head_r * .85, location=eb + Vector((0, 0, head_r * .40)))
        ear = bpy.context.object
        ear.name = f"Ear.{tag}"
        ear.rotation_euler = Euler((math.radians(8), math.radians(-side * 8), math.radians(-side * 6)), "XYZ")
        ear.data.materials.append(mats["Fur"])
        shade_smooth(ear)
        parts.append((ear, f"ear.{tag}"))
        bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=head_r * .22, radius2=head_r * .01,
                                        depth=head_r * .55, location=eb + Vector((0, -head_r * .14, head_r * .34)))
        inner = bpy.context.object
        inner.name = f"InnerEar.{tag}"
        inner.rotation_euler = ear.rotation_euler
        inner.data.materials.append(mats["NoseAndEars"])
        shade_smooth(inner)
        parts.append((inner, f"ear.{tag}"))

    # Rigid binding: every vertex of a part fully weighted to its bone, and a
    # zeroed Mask attribute so joining doesn't default-fill it with ones
    # (which would paint accessories with full stripe/cream masks).
    for obj, bone in parts:
        vg = obj.vertex_groups.new(name=bone)
        vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        if obj.data.materials and obj.data.materials[0].name == "Fur":
            attr = obj.data.color_attributes.new(name="Mask", type="BYTE_COLOR", domain="CORNER")
            attr.data.foreach_set("color", [0.0, 0.0, 0.0, 1.0] * len(obj.data.loops))
            attr.data.update()
    return parts


def join_all(body_obj, parts):
    bpy.ops.object.select_all(action="DESELECT")
    body_obj.select_set(True)
    for obj, _ in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = body_obj
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = "Cat"
    return joined


def skin_to_armature(mesh_obj, arm_obj):
    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    unweighted = sum(1 for v in mesh_obj.data.vertices if not any(v.groups))
    if unweighted:
        print(f"WARNING: {unweighted} unweighted verts; falling back to envelopes")
        bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")


def enable_deform(arm_obj, names):
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    for name in names:
        arm_obj.data.edit_bones[name].use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")


# ---------------------------------------------------------------------------
# Posing
# ---------------------------------------------------------------------------

class PoseApi:
    def __init__(self, arm_obj):
        self.arm_obj = arm_obj
        self.arm = arm_obj.data
        # Read rest orientations from the pose-matrix convention (identity
        # quaternion), not bone.matrix_local: pb.matrix applies an axis flip,
        # and child composition must stay in one convention.
        for pb in arm_obj.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)
            pb.scale = (1, 1, 1)
        bpy.context.view_layer.update()
        self.rest_pose = {name: pb.matrix.to_3x3().copy() for name, pb in arm_obj.pose.bones.items()}
        self.rest_rel = {}
        for name, pb in arm_obj.pose.bones.items():
            parent = pb.bone.parent
            self.rest_rel[name] = (self.rest_pose[parent.name].inverted() @ self.rest_pose[name]
                                   if parent else self.rest_pose[name].copy())

    def pb(self, name):
        return self.arm_obj.pose.bones[name]

    def update(self):
        bpy.context.view_layer.update()

    def set_world_rot(self, name, q_world):
        """Rotate a bone so its orientation in armature space is q_world."""
        pb = self.pb(name)
        parent = pb.bone.parent
        m = self.rest_rel[name].to_3x3()
        if parent:
            m = self.pb(parent.name).matrix.to_3x3() @ self.rest_rel[name].to_3x3()
        pb.rotation_quaternion = m.inverted().to_quaternion() @ Quaternion(q_world)

    def aim(self, name, direction):
        """Point a bone's length axis (+Y) along `direction` in armature space."""
        d = Vector(direction).normalized()
        axis = Vector((0, 1, 0)).cross(d)
        if axis.length < 1e-6:
            q = Quaternion((1, 0, 0, 0))
        else:
            q = Quaternion(axis.normalized(), math.acos(max(-1.0, min(1.0, Vector((0, 1, 0)).dot(d)))))
        self.set_world_rot(name, q)

    def root_move(self, delta):
        pb = self.pb("root")
        pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector(delta)

    def leg_ik(self, prefix, tag, target, pole):
        """Two-bone IK: pose upper/lower so the paw reaches `target`."""
        pose = self.arm_obj.pose.bones
        upper, lower, paw = (pose[f"{prefix}Upper.{tag}"], pose[f"{prefix}Lower.{tag}"],
                             pose[f"{prefix}Paw.{tag}"])
        l1 = (upper.bone.tail_local - upper.bone.head_local).length
        l2 = (lower.bone.tail_local - lower.bone.head_local).length
        self.update()
        h = upper.matrix.translation
        d = Vector(target) - h
        dist = min(max(d.length, abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
        along = d.normalized()
        perp = Vector(pole) - along * along.dot(Vector(pole))
        perp = perp.normalized() if perp.length > 1e-5 else Vector((1, 0, 0))
        x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist)
        y = math.sqrt(max(l1 * l1 - x * x, 0.0))
        knee = h + along * x + perp * y
        self.aim(f"{prefix}Upper.{tag}", knee - h)
        self.update()
        self.aim(f"{prefix}Lower.{tag}", Vector(target) - knee)
        self.update()
        self.aim(f"{prefix}Paw.{tag}", Vector((0, -0.4, -0.9)))
        self.update()


REST_DIRS = dict(
    hips=(0, -0.86, 0.50),   # pelvic bone, forward-up toward the spine
    spine=(0, -0.99, 0.08),  # torso runs horizontally
    chest=(0, -0.60, 0.80),
    neck=(0, -0.45, 0.90),
    head=(0, -0.30, 0.95),
)  # head bone continues the neck; the face lives on the mesh


def rot_x(direction, deg):
    """Pitch a direction vector about the X axis (degrees; negative = nose up)."""
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    y, z = direction[1], direction[2]
    return Vector((direction[0], y * c - z * s, y * s + z * c))


def tail_dirs(L, phase, pitch=0.0, sway=0.12):
    dirs = []
    pts = L["tail"]
    for i in range(4):
        d = (pts[i + 1] - pts[i]).normalized()
        if pitch:
            d = rot_x(d, pitch)
        d = Euler((0, 0, math.sin(phase + i * 0.6) * sway), "XYZ").to_matrix() @ d
        dirs.append(d)
    dirs.append(dirs[-1])
    return dirs


def pose_stand(L, api, phase=0.0):
    api.aim("hips", REST_DIRS["hips"])
    api.update()
    api.aim("spine", REST_DIRS["spine"])
    api.aim("chest", REST_DIRS["chest"])
    api.aim("neck", REST_DIRS["neck"])
    api.aim("head", REST_DIRS["head"])
    for tag in ("L", "R"):
        api.aim(f"ear.{tag}", ((0.12 if tag == "L" else -0.12), -0.15, 1))
    for i, d in enumerate(tail_dirs(L, phase, sway=0.15)):
        api.aim(f"tail{i}", d)
    api.update()
    for tag in ("L", "R"):
        sh = api.pb(f"frontUpper.{tag}").bone.head_local
        api.leg_ik("front", tag, (sh.x, sh.y, 0.0), (0, 1, -0.2))
        hp = api.pb(f"hindUpper.{tag}").bone.head_local
        api.leg_ik("hind", tag, (hp.x, hp.y - 0.02, 0.0), (0, -1, -0.1))


def pose_sit(L, api, phase=0.0):
    H, B = L["H"], L["B"]
    # Nose-up pitch: the rump drops, chest and head rise.
    api.aim("hips", rot_x(REST_DIRS["hips"], -40))
    api.update()
    api.aim("spine", rot_x(REST_DIRS["spine"], -38))
    api.aim("chest", rot_x(REST_DIRS["chest"], -30))
    api.aim("neck", (0, -0.30, 0.95))
    api.aim("head", (0, -0.45, 0.85))
    for tag in ("L", "R"):
        api.aim(f"ear.{tag}", ((0.12 if tag == "L" else -0.12), -0.10, 1))
    for i, d in enumerate(tail_dirs(L, phase, pitch=-95, sway=0.10)):
        api.aim(f"tail{i}", d)
    api.root_move((0, 0, -0.60 * H))
    api.update()
    for tag in ("L", "R"):
        hp = api.pb(f"hindUpper.{tag}").bone.head_local
        api.leg_ik("hind", tag, (hp.x, hp.y - 0.40 * B, 0.02), (0, -1, 0))
        sh = api.pb(f"frontUpper.{tag}").bone.head_local
        api.leg_ik("front", tag, (sh.x, sh.y, 0.0), (0, 1, -0.2))


def pose_crouch(L, api, phase=0.0):
    pose_stand(L, api, phase)
    api.root_move((0, 0, -0.30 * L["H"]))
    api.update()
    api.aim("neck", (0, -0.20, 0.70))
    api.aim("head", (0, -1, -0.05))
    api.update()
    for tag in ("L", "R"):
        sh = api.pb(f"frontUpper.{tag}").bone.head_local
        api.leg_ik("front", tag, (sh.x, sh.y - 0.06, 0.02), (0, 1, -0.2))
        hp = api.pb(f"hindUpper.{tag}").bone.head_local
        api.leg_ik("hind", tag, (hp.x, hp.y + 0.05, 0.02), (0, -1, -0.1))


def pose_jump(L, api, phase=0.0):
    pose_stand(L, api, phase)
    # Nose-down stretch: front paws reach forward, hind legs trail.
    api.aim("hips", rot_x(REST_DIRS["hips"], 40))
    api.update()
    api.aim("spine", rot_x(REST_DIRS["spine"], 25))
    api.aim("chest", (0, -0.75, -0.35))
    api.aim("neck", (0, -0.70, -0.45))
    api.aim("head", (0, -0.95, 0.05))
    for tag in ("L", "R"):
        api.aim(f"ear.{tag}", ((0.2 if tag == "L" else -0.2), 0.5, 1))
        sh = api.pb(f"frontUpper.{tag}").bone.head_local
        api.leg_ik("front", tag, (sh.x, sh.y - 0.85 * L["B"], max(0.03, sh.z - 0.55 * L["H"])), (0, -1, 0))
        hp = api.pb(f"hindUpper.{tag}").bone.head_local
        api.leg_ik("hind", tag, (hp.x, hp.y + 0.72 * L["B"], max(0.04, hp.z - 0.30 * L["H"])), (0, 1, 0))
    for i, d in enumerate(tail_dirs(L, phase, pitch=55, sway=0.05)):
        api.aim(f"tail{i}", d)


def pose_fall(L, api, phase=0.0):
    pose_jump(L, api, phase)
    # Tipped back, belly up-ish while falling.
    api.aim("hips", rot_x(REST_DIRS["hips"], -25))
    api.update()
    api.aim("spine", rot_x(REST_DIRS["spine"], -25))
    api.aim("chest", (0, -0.4, 0.85))
    api.aim("neck", (0, -0.35, 0.9))
    api.aim("head", (0, -0.60, 0.80))
    api.update()
    for tag, sgn in (("L", 1), ("R", -1)):
        sh = api.pb(f"frontUpper.{tag}").bone.head_local
        api.leg_ik("front", tag, (sh.x + sgn * 0.3, sh.y - 0.5, sh.z + 0.3), (0, 0, 1))
        hp = api.pb(f"hindUpper.{tag}").bone.head_local
        api.leg_ik("hind", tag, (hp.x + sgn * 0.3, hp.y + 0.5, hp.z + 0.25), (0, 0, 1))
    for i, d in enumerate(tail_dirs(L, phase, pitch=30, sway=0.3)):
        api.aim(f"tail{i}", d)
    api.update()


def pose_celebrate(L, api, phase=0.0):
    pose_sit(L, api, phase)
    api.aim("head", (0, -0.55, 0.80))
    api.update()
    for tag, sgn in (("L", 1), ("R", -1)):
        lift = math.sin(phase * 2 + (0 if sgn > 0 else math.pi)) * 0.5 + 0.5
        sh = api.pb(f"frontUpper.{tag}").bone.head_local
        api.leg_ik("front", tag, (sh.x, sh.y - 0.30, sh.z + 0.10 + lift * 0.35), (0, 1, 0))
    for i, d in enumerate(tail_dirs(L, phase, sway=0.30)):
        api.aim(f"tail{i}", d)


def pose_walk(L, api, phase):
    pose_stand(L, api, phase)
    api.root_move((0, 0, 0.015 * math.sin(2 * phase)))
    api.update()
    step = 0.34 * L["H"]
    for tag in ("L", "R"):
        ph = phase if tag == "L" else phase + math.pi
        sh = api.pb(f"frontUpper.{tag}").bone.head_local
        lift = max(0.0, math.sin(ph)) * 0.30 * L["H"]
        api.leg_ik("front", tag, (sh.x, sh.y - math.sin(ph) * step, lift), (0, 1, -0.2))
        hp = api.pb(f"hindUpper.{tag}").bone.head_local
        ph2 = phase + math.pi if tag == "L" else phase
        lift2 = max(0.0, math.sin(ph2)) * 0.28 * L["H"]
        api.leg_ik("hind", tag, (hp.x, hp.y - 0.02 + math.sin(ph2) * step, lift2), (0, -1, -0.1))


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

def reset_pose(arm_obj):
    for pb in arm_obj.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()


def key_pose(arm_obj, frame, prev_quats):
    for name, pb in arm_obj.pose.bones.items():
        if not pb.bone.use_deform and not name.startswith(("eye.", "ear.")):
            continue
        q = pb.rotation_quaternion.copy()
        last = prev_quats.get(name)
        if last is not None and last.dot(q) < 0:
            q.negate()
            pb.rotation_quaternion = q
        pb.keyframe_insert("rotation_quaternion", frame=frame)
        prev_quats[name] = q
    arm_obj.pose.bones["root"].keyframe_insert("location", frame=frame)


def build_actions(arm_obj, L, api):
    tau = math.tau
    actions = {}

    def render_pose(name, fn, frames):
        prev = {}
        action = bpy.data.actions.new(name)
        arm_obj.animation_data_create().action = action
        reset_pose(arm_obj)
        for f in frames:
            fn(f)
            key_pose(arm_obj, f, prev)
        action.use_fake_user = True
        actions[name] = action
        return action

    two_cycles = tau * 2 / 30
    render_pose("Stand", lambda f: pose_stand(L, api, phase=f * two_cycles), [0, 15, 30])
    render_pose("Walk", lambda f: pose_walk(L, api, phase=f * two_cycles), [0, 7, 15, 22, 30])
    render_pose("Sit", lambda f: pose_sit(L, api, phase=f * tau / 90), [0, 30, 60, 90])
    render_pose("Crouch", lambda f: pose_crouch(L, api), [0, 6, 10])
    render_pose("Jump", lambda f: pose_jump(L, api), [0, 4, 9])
    render_pose("Land", lambda f: pose_crouch(L, api), [0, 5, 12])
    render_pose("Fall", lambda f: pose_fall(L, api, phase=f * tau / 10), [0, 5, 10])
    render_pose("Celebrate", lambda f: pose_celebrate(L, api, phase=f * tau * 2 / 30), [0, 10, 20, 30])

    def blink_at(f):
        pose_sit(L, api)
        k = math.sin(min(max(f / 8.0, 0), 1) * math.pi)
        for tag in ("L", "R"):
            pb = arm_obj.pose.bones[f"eye.{tag}"]
            pb.scale = (1, 1 - 0.94 * k, 1)
            pb.keyframe_insert("scale", frame=f)

    render_pose("Blink", blink_at, [0, 2, 4, 6, 8])

    arm_obj.animation_data.action = None
    reset_pose(arm_obj)
    return actions


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build(stage):
    clear_scene()
    L = LAYOUTS[stage]

    mats = make_materials()
    arm_obj = build_armature(L)
    body_obj = build_body(L, stage)
    paint_mask(body_obj, L)

    bvh = BVHTree.FromObject(body_obj, bpy.context.evaluated_depsgraph_get())
    parts = build_accessories(arm_obj, L, mats, bvh)
    skin_to_armature(body_obj, arm_obj)
    joined = join_all(body_obj, parts)
    enable_deform(arm_obj, [f"eye.{t}" for t in ("L", "R")] + [f"ear.{t}" for t in ("L", "R")])

    scene = bpy.context.scene
    scene.render.fps = FPS
    bpy.ops.object.select_all(action="DESELECT")
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")
    api = PoseApi(arm_obj)
    build_actions(arm_obj, L, api)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.wm.save_as_mainfile(filepath=str(WORK / f"boop-{stage}.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(OUT / f"boop-{stage}.glb"),
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_force_sampling=True,
        export_animation_mode="ACTIONS",
        export_vertex_color="ACTIVE",
        export_image_format="NONE",
        export_yup=True,
    )
    print(f"exported {stage} -> {OUT / f'boop-{stage}.glb'}", flush=True)


for stage in ("kitten", "cat"):
    build(stage)

"""Evaluate exported authoring poses across complete loops, not just keys."""
import bpy
from pathlib import Path
root = Path(__file__).resolve().parents[2]
for stage in ('kitten', 'cat'):
    bpy.ops.wm.open_mainfile(filepath=str(root / 'tools/blender/out' / f'boop-{stage}.blend'))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    mesh = next(o for o in bpy.data.objects if o.type == 'MESH' and o.find_armature() == arm)
    # Every paw/leg accessory vertex is bound to exactly its own limb bone;
    # no vertex can stretch from one leg to another during the dance.
    for prefix in ('front', 'hind'):
        for side in ('L', 'R'):
            name = f'{prefix}Paw.{side}'
            group = mesh.vertex_groups.get(name)
            assert group is not None, name
            vertices = [v for v in mesh.data.vertices if any(g.group == group.index and g.weight > .99 for g in v.groups)]
            assert len(vertices) > 100, f'{stage}: missing independently bound paw {name}'
    tail_groups = {g.index for g in mesh.vertex_groups if g.name.startswith('tail')}
    tail_vertices = [v.index for v in mesh.data.vertices if sum(g.weight for g in v.groups if g.group in tail_groups) > .65]
    assert tail_vertices, 'Tail skin not found'
    for name in ('Sit', 'Stand', 'Curious', 'Sleepy', 'Walk', 'Crouch', 'Land', 'Dance'):
        action = bpy.data.actions[name]
        arm.animation_data.action = action
        minimum = 100
        for frame in range(int(action.frame_range[0]), int(action.frame_range[1]) + 1):
            bpy.context.scene.frame_set(frame)
            evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            minimum = min(minimum, min((evaluated.matrix_world @ evaluated.data.vertices[i].co).z for i in tail_vertices))
        if name == 'Walk':
            # Wobble must not tilt soles or lift every stance foot off support.
            first = None
            paw_groups = {g.index for g in mesh.vertex_groups if 'Paw.' in g.name}
            paw_vertices = [v.index for v in mesh.data.vertices
                            if any(g.group in paw_groups and g.weight > .99 for g in v.groups)]
            for frame in range(37):
                bpy.context.scene.frame_set(frame)
                paws = [arm.pose.bones[f'{limb}Paw.{side}']
                        for limb in ('front', 'hind') for side in ('L', 'R')]
                evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
                sole = min((evaluated.matrix_world @ evaluated.data.vertices[i].co).z for i in paw_vertices)
                assert -.025 < sole < .04, f'{stage}: walk sole outside support tolerance: {sole}'
                transforms = [arm.pose.bones['root'].matrix.copy()] + [p.matrix.copy() for p in paws]
                if frame == 0:
                    first = transforms
                if frame == 36:
                    assert max(abs(a[r][c] - b[r][c]) for a, b in zip(first, transforms)
                               for r in range(4) for c in range(4)) < .001, f'{stage}: walk seam'
        print(stage, name, 'tail minimum', round(minimum, 4), flush=True)
        assert minimum > -.018, f'{stage}/{name} tail penetrates support plane: {minimum}'
print('FLOOR_QA_OK', flush=True)

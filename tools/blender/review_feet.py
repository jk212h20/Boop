"""Low-angle/underside animation review, isolated geometry without a floor."""
import bpy, math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
out=Path('/tmp/boop-foot-review');out.mkdir(exist_ok=True)
for stage in ('cat','kitten'):
 bpy.ops.wm.open_mainfile(filepath=str(root/'tools/blender/out'/f'boop-{stage}.blend'))
 scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
 scene.world=bpy.data.worlds.new('ReviewWorld');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.65,.65,1)
 arm=next(o for o in scene.objects if o.type=='ARMATURE')
 for pos in [(2,-3,4),(-3,-2,1),(0,0,-3)]:
  bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=350;o.data.size=4;o.rotation_euler=(Vector((0,0,.5))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=1.9 if stage=='cat' else 1.5
 for clip in ('Sit','Walk','Dance','Jump','Land','Crouch'):
  arm.animation_data.action=bpy.data.actions[clip];scene.frame_set(15 if clip in ('Dance','Walk') else 5)
  for view,pos in [('low',(2,-4,.6)),('sole',(1,-3,-2))]:
   center=Vector((0,0,.5));cam.location=center+Vector(pos);cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
   scene.render.filepath=str(out/f'{stage}-{clip}-{view}.png');bpy.ops.render.render(write_still=True);print(stage,clip,view,flush=True)
print('FOOT_REVIEW_OK',flush=True)

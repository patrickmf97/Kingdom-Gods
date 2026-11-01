import math, sys
import bpy
from mathutils import Vector
src, out = sys.argv[1], sys.argv[2]
close = len(sys.argv) > 3 and sys.argv[3] == "face"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
show = {"male": ["body", "head", "face", "brows", "lips", "tunic", "trousers", "boots", "belt", "buckle", "hair-short", "beard"],
        "female": ["body", "head", "face", "brows", "lips", "robe", "boots", "belt", "buckle", "hair-bun", "apron"]}
rigs = [o for o in scene.objects if o.type == "ARMATURE"]
for o in scene.objects:
    if o.type != "MESH":
        continue
    base, _, sex = o.name.rpartition("-")
    if sex not in show:
        base, sex = o.name, ""
    keep = sex in show and any(base == k or base.startswith(k + "-") or base == k for k in show[sex])
    o.hide_render = not keep
# Four figures: male idle, male walk, female idle, female walk (duplicate rigs via linked copies is complex; offset instead)
positions = {"rig-male": 0, "rig-female": 1.2}
for rig in rigs:
    rig.location.x = positions.get(rig.name, 0)
    tracks = rig.animation_data.nla_tracks if rig.animation_data else []
    for t in tracks:
        t.mute = t.name != ("walk" if rig.name == "rig-female" else "idle")
scene.frame_set(7)
bpy.ops.mesh.primitive_plane_add(size=50)
g = bpy.context.active_object; gm = bpy.data.materials.new("g"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.3, .32, .26, 1); g.data.materials.append(gm)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.5; sun.rotation_euler = (math.radians(55), 0, math.radians(-35)); scene.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); scene.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs["Color"].default_value = (.5, .6, .75, 1); w.node_tree.nodes["Background"].inputs["Strength"].default_value = .8
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
if close:
    cam.data.lens = 85; cam.location = (.25, -1.4, 1.75); target = Vector((0, 0, 1.7))
else:
    cam.data.lens = 50; cam.location = (.9, -4.6, 1.3); target = Vector((.6, 0, .95))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(cam); scene.camera = cam
scene.render.engine = "CYCLES"; scene.cycles.samples = 32; scene.cycles.use_denoising = True
scene.render.resolution_x = 900 if close else 1200; scene.render.resolution_y = 700 if close else 800
scene.view_settings.view_transform = "AgX"; scene.render.filepath = out
bpy.ops.render.render(write_still=True)

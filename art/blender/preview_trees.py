import math, os, sys
import bpy
from mathutils import Vector
src, out = sys.argv[1], sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
names = sorted({o.name.rsplit("-", 1)[0] for o in scene.objects if o.type == "MESH"})
x = 0
for n in names:
    for o in scene.objects:
        if o.type == "MESH" and o.name.rsplit("-", 1)[0] == n:
            o.location = (x, 0, 0)
    x += 6.5
for m in bpy.data.materials:
    if m.name.startswith("leaves"):
        m.blend_method = "CLIP" if hasattr(m, "blend_method") else None
bpy.ops.mesh.primitive_plane_add(size=300, location=(x / 2, 0, 0))
g = bpy.context.active_object; gm = bpy.data.materials.new("g"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.22, .3, .14, 1); g.data.materials.append(gm)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 4; sun.rotation_euler = (math.radians(50), 0, math.radians(-30)); scene.collection.objects.link(sun)
w = bpy.data.worlds.new("w"); scene.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs["Color"].default_value = (.55, .68, .85, 1)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); cam.data.lens = 30
mid = x / 2 - 3.25; cam.location = (mid, -26, 6.5)
cam.rotation_euler = (Vector((mid, 0, 4.5)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(cam); scene.camera = cam
scene.render.engine = "CYCLES"; scene.cycles.samples = 24; scene.cycles.use_denoising = True
scene.render.resolution_x = 1600; scene.render.resolution_y = 600; scene.view_settings.view_transform = "AgX"
scene.render.filepath = out; bpy.ops.render.render(write_still=True)

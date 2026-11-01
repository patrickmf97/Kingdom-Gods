"""Renders a quick look-dev image of an exported glb (art review only)."""
import math, os, sys
import bpy
from mathutils import Vector

src, out = sys.argv[1], sys.argv[2]
names = sys.argv[3].split(",") if len(sys.argv) > 3 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
roots = [o for o in scene.objects if o.parent is None and (names is None or o.name in names)]
for o in scene.objects:
    if o.parent is None and o not in roots:
        o.hide_render = True
x = 0
for o in roots:
    o.location = (x, 0, 0)
    x += o.dimensions.x + 2.5
mid = x / 2 - 1.25
bpy.ops.mesh.primitive_plane_add(size=200, location=(mid, 0, 0))
ground = bpy.context.active_object
gm = bpy.data.materials.new("ground"); gm.use_nodes = True
gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.24, .33, .16, 1)
ground.data.materials.append(gm)
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 4.2; sun.data.angle = math.radians(2)
sun.rotation_euler = (math.radians(52), 0, math.radians(-38))
scene.collection.objects.link(sun)
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = (.55, .68, .85, 1); bg.inputs["Strength"].default_value = 1.0
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 35
dist = max(14, x * .55)
cam.location = (mid + 2, -dist, dist * .42)
direction = Vector((mid, 0, 1.5)) - cam.location
cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
scene.collection.objects.link(cam); scene.camera = cam
scene.render.engine = "CYCLES"; scene.cycles.samples = int(os.environ.get("KG_PREVIEW_SAMPLES", "24"))
scene.cycles.use_denoising = True
scene.render.resolution_x = int(os.environ.get("KG_PREVIEW_W", "1600")); scene.render.resolution_y = int(os.environ.get("KG_PREVIEW_H", "560"))
scene.view_settings.view_transform = "AgX"
scene.render.filepath = out
bpy.ops.render.render(write_still=True)

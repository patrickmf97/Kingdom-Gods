"""Natural props for Valeverde: rocks, iron ore, herbs, shrubs, logs, stumps and rail fences.

Each prop is one mesh with vertex-colour ambient occlusion, centred on its base.
Run:  python3 art/blender/props.py   (after textures.py and trees.py)
"""
from __future__ import annotations

import math
import os
import random
import sys

import bpy  # loads bmesh/mathutils
import bmesh
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from trees import TEX, ROOT, canopy_normals, leaf_atlas, material as foliage_material, vertex_ao  # noqa: E402

OUTPUT = os.path.join(ROOT, "public", "models", "props.glb")


def pbr(name: str, kind: str) -> bpy.types.Material:
    """Tileable PBR material from textures.py with AO from the vertex colours."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage"); tex.image = bpy.data.images.load(os.path.join(TEX, f"{kind}_albedo.png"))
    vc = nodes.new("ShaderNodeVertexColor"); vc.layer_name = "AO"
    mix = nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs["Factor"].default_value = 1
    links.new(tex.outputs["Color"], mix.inputs["A"]); links.new(vc.outputs["Color"], mix.inputs["B"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    nrm = nodes.new("ShaderNodeTexImage"); nrm.image = bpy.data.images.load(os.path.join(TEX, f"{kind}_normal.png"))
    nrm.image.colorspace_settings.name = "Non-Color"
    nm = nodes.new("ShaderNodeNormalMap"); links.new(nrm.outputs["Color"], nm.inputs["Color"]); links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = .9 if kind not in ("iron", "ore") else .4
    bsdf.inputs["Metallic"].default_value = .7 if kind in ("iron", "ore") else 0
    return mat


def finish(name: str, bm: bmesh.types.BMesh, materials: list[bpy.types.Material]) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for m in materials:
        mesh.materials.append(m)
    return obj


def spherical_uv(bm: bmesh.types.BMesh, scale: float) -> None:
    uv = bm.loops.layers.uv.verify()
    for face in bm.faces:
        n = face.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        a, b = [i for i in range(3) if i != axis]
        for loop in face.loops:
            loop[uv].uv = (loop.vert.co[a] / scale, loop.vert.co[b] / scale)


def rock(name: str, seed: int, size: tuple[float, float, float], mat) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1)
    offset = Vector((seed * 3.1, seed * 1.7, seed * .9))
    for v in bm.verts:
        n = v.co.normalized()
        d = noise.fractal(n * 1.4 + offset, 1.0, 2.0, 4) * .32 + noise.noise(n * 4 + offset) * .08
        # Flatten facets a little: weathered stone breaks along planes.
        v.co = n * (1 + d)
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    # Sink and flatten the base into the soil.
    for v in bm.verts:
        if v.co.z < -size[2] * .35:
            v.co.z = -size[2] * .35 - (v.co.z + size[2] * .35) * .1
    bmesh.ops.translate(bm, vec=Vector((0, 0, size[2] * .3)), verts=bm.verts)
    for f in bm.faces:
        f.smooth = True
    spherical_uv(bm, 1.4)
    return finish(name, bm, [mat])


def ore(name: str, stone_mat, iron_mat) -> bpy.types.Object:
    obj = rock(name, 7, (1.0, .8, .7), stone_mat)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    rng = random.Random(5)
    for _ in range(9):
        c = Vector((rng.uniform(-.6, .6), rng.uniform(-.5, .5), rng.uniform(.5, .85)))
        crystal = bmesh.new()
        bmesh.ops.create_cone(crystal, cap_ends=True, segments=5, radius1=rng.uniform(.08, .14), radius2=0, depth=rng.uniform(.3, .5))
        axis = (c - Vector((0, 0, .1))).normalized()
        rot = axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
        bmesh.ops.transform(crystal, matrix=rot, verts=crystal.verts)
        bmesh.ops.translate(crystal, vec=c, verts=crystal.verts)
        for f in crystal.faces:
            f.material_index = 1
        tmp = bpy.data.meshes.new("t"); crystal.to_mesh(tmp); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp); crystal.free()
    spherical_uv(bm, 1.0)
    bm.to_mesh(obj.data); bm.free()
    obj.data.materials.append(iron_mat)
    return obj


def log(name: str, bark_mat, wood_mat, length=2.4, radius=.2, stump=False) -> bpy.types.Object:
    bm = bmesh.new()
    height = .55 if stump else length
    r = .32 if stump else radius
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=r * (1.15 if stump else 1), radius2=r, depth=height)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.smooth = abs(f.normal.z) < .7
        f.material_index = 1 if abs(f.normal.z) > .7 else 0
        for loop in f.loops:
            co = loop.vert.co
            if f.material_index:
                loop[uv].uv = (co.x * 1.5 + .5, co.y * 1.5 + .5)
            else:
                loop[uv].uv = (math.atan2(co.y, co.x) / math.tau * 2, co.z / 1.2)
    if stump:
        bmesh.ops.translate(bm, vec=Vector((0, 0, height / 2)), verts=bm.verts)
    else:
        bmesh.ops.rotate(bm, cent=Vector(), matrix=Vector((0, 1, 0)).to_track_quat("Z", "Y").to_matrix(), verts=bm.verts)
        bmesh.ops.translate(bm, vec=Vector((0, 0, radius * .85)), verts=bm.verts)
    return finish(name, bm, [bark_mat, wood_mat])


def bush(name: str, seed: int, radius: float, height: float, mat, cards: int) -> bpy.types.Object:
    rng = random.Random(seed)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
    centre = Vector((0, 0, height * .45))
    for _ in range(cards):
        u, v = rng.uniform(0, math.tau), rng.uniform(-.1, 1)
        r = radius * math.sqrt(rng.uniform(.15, 1))
        c = Vector((math.cos(u) * r, math.sin(u) * r, height * (.15 + .85 * rng.random() * (1 - (r / radius) ** 2 * .5))))
        n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-.1, 1))).normalized()
        t = n.cross(Vector((0, 0, 1)) if abs(n.z) < .9 else Vector((1, 0, 0))).normalized()
        b = n.cross(t).normalized()
        s = rng.uniform(.45, .7) * (radius / .8) ** .5
        corners = [c + (t * -1 + b * -1) * s / 2, c + (t + b * -1) * s / 2, c + (t + b) * s / 2, c + (t * -1 + b) * s / 2]
        face = bm.faces.new([bm.verts.new(p) for p in corners])
        for loop, coords in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop[uv].uv = coords
    obj = finish(name, bm, [mat])
    canopy_normals(obj, centre, .8)
    return obj


def herb(name: str, leaf_mat, flower_mat) -> bpy.types.Object:
    rng = random.Random(41)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap")
    for i in range(22):
        a = rng.uniform(0, math.tau)
        lean = rng.uniform(.2, .7)
        length = rng.uniform(.35, .6)
        base = Vector((math.cos(a) * .05, math.sin(a) * .05, 0))
        tip = base + Vector((math.cos(a) * lean * length, math.sin(a) * lean * length, length))
        side = Vector((-math.sin(a), math.cos(a), 0)) * .09
        corners = [base - side, base + side, tip + side * .6, tip - side * .6]
        face = bm.faces.new([bm.verts.new(p) for p in corners])
        for loop, coords in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            loop[uv].uv = coords
    for i in range(7):
        a = i / 7 * math.tau
        c = Vector((math.cos(a) * .18, math.sin(a) * .18, rng.uniform(.5, .7)))
        petal = bmesh.new()
        bmesh.ops.create_icosphere(petal, subdivisions=1, radius=.055)
        bmesh.ops.translate(petal, vec=c, verts=petal.verts)
        for f in petal.faces:
            f.material_index = 1
        tmp = bpy.data.meshes.new("t"); petal.to_mesh(tmp); bm.from_mesh(tmp); bpy.data.meshes.remove(tmp); petal.free()
    obj = finish(name, bm, [leaf_mat, flower_mat])
    return obj


def fence(name_post: str, name_rail: str, wood_mat) -> list[bpy.types.Object]:
    """Split-rail fence: a split post (1 m) and a rail spanning 1 unit along X (scaled in game)."""
    rng = random.Random(3)
    post = bmesh.new()
    bmesh.ops.create_cone(post, cap_ends=True, segments=7, radius1=.08, radius2=.065, depth=1.0)
    for v in post.verts:
        v.co.x += noise.noise(v.co * 7) * .012
        v.co.z += .5
    for v in post.verts:
        if v.co.z > .98:
            v.co.z += (v.co.x * .6)  # slanted cut sheds rain
    rail = bmesh.new()
    bmesh.ops.create_cone(rail, cap_ends=True, segments=6, radius1=.045, radius2=.04, depth=1.0)
    bmesh.ops.rotate(rail, cent=Vector(), matrix=Vector((1, 0, 0)).to_track_quat("Z", "Y").to_matrix(), verts=rail.verts)
    for v in rail.verts:
        v.co.z += math.sin(v.co.x * 3) * .012 + rng.uniform(-.004, .004)
    out = []
    for name, bm in ((name_post, post), (name_rail, rail)):
        uv = bm.loops.layers.uv.verify()
        for f in bm.faces:
            f.smooth = True
            for loop in f.loops:
                co = loop.vert.co
                loop[uv].uv = (math.atan2(co.y, co.z if name == name_rail else co.x) / math.tau, (co.x if name == name_rail else co.z) / .8)
        out.append(finish(name, bm, [wood_mat]))
    return out


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    leaf_atlas("leaves_shrub", "oak", 17)
    leaf_atlas("leaves_herb", "birch", 19)
    stone = pbr("rock", "rock")
    cobble = pbr("rock-cool", "rock")
    iron = pbr("ore", "ore")
    bark = pbr("bark", "bark")
    cut = pbr("cut-wood", "planks")
    rail_wood = pbr("rail-wood", "timber")
    shrub_leaves = foliage_material("leaves", "leaves_shrub_albedo", None, True)
    herb_leaves = foliage_material("leaves", "leaves_herb_albedo", None, True)
    flower = bpy.data.materials.new("flower"); flower.use_nodes = True
    flower.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.86, .62, .74, 1)
    built = [
        rock("rock-0", 1, (.55, .45, .42), stone),
        rock("rock-1", 2, (.42, .5, .5), cobble),
        rock("rock-2", 3, (.7, .55, .36), stone),
        ore("ore-0", stone, iron),
        log("log-0", bark, cut),
        log("stump-0", bark, cut, stump=True),
        bush("shrub-0", 51, .7, .9, shrub_leaves, 70),
        bush("shrub-1", 52, .55, .65, shrub_leaves, 50),
        herb("herb-0", herb_leaves, flower),
        *fence("fence-post", "fence-rail", rail_wood),
    ]
    for obj in built:  # each prop alone: they all sit on the origin
        vertex_ao([obj], rays=20, distance=1.2, floor=.4)
    for o in bpy.context.scene.objects:
        o.select_set(o in built)
    bpy.ops.export_scene.gltf(filepath=OUTPUT, export_format="GLB", use_selection=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_image_format="WEBP",
                              export_image_quality=85, export_vertex_color="ACTIVE", export_all_vertex_colors=True)
    print("exported", OUTPUT, os.path.getsize(OUTPUT) // 1024, "KiB", flush=True)


if __name__ == "__main__":
    main()

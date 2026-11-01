"""Models Valeverde's buildings at their exact in-game footprints, bakes ambient
occlusion and exports one glTF binary for the game.

Run with Blender's Python module:  python3 art/blender/buildings.py
Conventions (metres = game world units):
  * origin at the footprint centre, ground at z = 0;
  * the front with the door faces Blender -Y (game +Z, map "bottom");
  * the door sits at x = +0.12 * width, matching the game's lanterns and signs.
"""
from __future__ import annotations

import json
import math
import os
import random
import sys

import bpy  # must load before bmesh/mathutils when running as a Python module
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BUILD = os.path.join(ROOT, "art", "build")
TEXTURES = os.path.join(BUILD, "textures")
OUTPUT = os.path.join(ROOT, "public", "models", "village-buildings.glb")
AO_SIZE = int(os.environ.get("KG_AO_SIZE", "512"))
AO_SAMPLES = int(os.environ.get("KG_AO_SAMPLES", "48"))

# ------------------------------------------------------------------ scene setup


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = AO_SAMPLES
    scene.render.bake.margin = 6
    scene.world = bpy.data.worlds.new("World") if not scene.world else scene.world


# ------------------------------------------------------------------ materials

TILE = {  # metres covered by one texture repeat
    "plaster": 1.6, "timber": 1.2, "planks": 1.0, "stone": 1.4, "cobble": 1.6,
    "roof_tile": 1.5, "roof_tile_dark": 1.5, "slate": 1.4, "iron": .6,
}
_images: dict[str, bpy.types.Image] = {}


def image(name: str, colour: bool) -> bpy.types.Image:
    if name not in _images:
        img = bpy.data.images.load(os.path.join(TEXTURES, f"{name}.png"))
        img.colorspace_settings.name = "sRGB" if colour else "Non-Color"
        _images[name] = img
    return _images[name]


def gltf_output_group() -> bpy.types.NodeTree:
    """The exporter reads Occlusion from a node group named 'glTF Material Output'."""
    group = bpy.data.node_groups.get("glTF Material Output")
    if group:
        return group
    group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    group.nodes.new("NodeGroupInput")
    return group


def material(kind: str) -> bpy.types.Material:
    """One material per building and surface, so each can carry its own baked AO map."""
    mat = bpy.data.materials.new(f"{kind}")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    uv0 = nodes.new("ShaderNodeUVMap"); uv0.uv_map = "UVMap"
    if kind == "glass":
        bsdf.inputs["Base Color"].default_value = (.95, .78, .45, 1)
        bsdf.inputs["Roughness"].default_value = .25
        bsdf.inputs["Emission Color"].default_value = (1, .6, .25, 1)
        bsdf.inputs["Emission Strength"].default_value = .4
    elif kind == "coals":
        bsdf.inputs["Base Color"].default_value = (.25, .05, .02, 1)
        bsdf.inputs["Emission Color"].default_value = (1, .35, .08, 1)
        bsdf.inputs["Emission Strength"].default_value = 3
    else:
        tex = nodes.new("ShaderNodeTexImage"); tex.image = image(f"{kind}_albedo", True)
        links.new(uv0.outputs["UV"], tex.inputs["Vector"])
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        mr = nodes.new("ShaderNodeTexImage"); mr.image = image(f"{kind}_mr", False)
        links.new(uv0.outputs["UV"], mr.inputs["Vector"])
        sep = nodes.new("ShaderNodeSeparateColor")
        links.new(mr.outputs["Color"], sep.inputs["Color"])
        links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        nrm = nodes.new("ShaderNodeTexImage"); nrm.image = image(f"{kind}_normal", False)
        links.new(uv0.outputs["UV"], nrm.inputs["Vector"])
        nmap = nodes.new("ShaderNodeNormalMap"); nmap.inputs["Strength"].default_value = .9
        links.new(nrm.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    mat["kg_kind"] = kind
    return mat


# ------------------------------------------------------------------ geometry kit


class Builder:
    def __init__(self, name: str):
        self.name = name
        self.parts: list[tuple[bmesh.types.BMesh, str, int | None]] = []
        self.rand = random.Random(name)

    def box(self, kind: str, size, centre, rot=(0, 0, 0), bevel=.018, grain_axis: int | None = None) -> None:
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        if bevel > 0:
            bevel = min(bevel, min(size) * .3)
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2 if min(size) > .3 else 1, affect="EDGES", profile=.5)
        rotation = Matrix.Rotation(rot[0], 4, "X") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[2], 4, "Z")
        bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(centre)) @ rotation, verts=bm.verts)
        if grain_axis is None and kind in ("timber", "planks"):
            grain_axis = max(range(3), key=lambda i: size[i])
        self.parts.append((bm, kind, grain_axis, rotation))

    def prism(self, kind: str, width: float, depth: float, height: float, centre) -> None:
        """Triangular gable filling between the walls and the roof (ridge along Y in local)."""
        bm = bmesh.new()
        hw, hd = width / 2, depth / 2
        a = [bm.verts.new(v) for v in [(-hw, -hd, 0), (hw, -hd, 0), (0, -hd, height)]]
        b = [bm.verts.new(v) for v in [(-hw, hd, 0), (hw, hd, 0), (0, hd, height)]]
        bm.faces.new(a[::-1]); bm.faces.new(b)
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new([a[i], a[j], b[j], b[i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.translate(bm, vec=Vector(centre), verts=bm.verts)
        self.parts.append((bm, kind, None, Matrix.Identity(4)))

    def cylinder(self, kind: str, radius: float, length: float, centre, rot=(0, 0, 0), segments=12) -> None:
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius, depth=length)
        rotation = Matrix.Rotation(rot[0], 4, "X") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[2], 4, "Z")
        bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector(centre)) @ rotation, verts=bm.verts)
        self.parts.append((bm, kind, 2, rotation))

    # ---------------------------------------------------------------- assembly

    def finish(self, materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
        mesh = bpy.data.meshes.new(self.name)
        merged = bmesh.new()
        uv = merged.loops.layers.uv.new("UVMap")
        slots: list[str] = []
        for bm, kind, grain, rotation in self.parts:
            if kind not in slots:
                slots.append(kind)
            index = slots.index(kind)
            inv = rotation.inverted()
            tile = TILE.get(kind, 1.0)
            temp_uv = bm.loops.layers.uv.new("UVMap")
            for face in bm.faces:
                face.material_index = index
                face.smooth = True
                # Project in the part's own frame so beams keep grain along their length.
                local_normal = (inv.to_3x3() @ face.normal)
                axis = max(range(3), key=lambda i: abs(local_normal[i]))
                others = [i for i in range(3) if i != axis]
                if grain is not None and grain in others:
                    others = [i for i in others if i != grain] + [grain]
                for loop in face.loops:
                    p = inv @ loop.vert.co
                    loop[temp_uv].uv = (p[others[0]] / tile, p[others[1]] / tile)
            for edge in bm.edges:
                if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > math.radians(38):
                    edge.smooth = False
            data = bpy.data.meshes.new("tmp")
            bm.to_mesh(data)
            merged.from_mesh(data)
            bpy.data.meshes.remove(data)
            bm.free()
        merged.to_mesh(mesh)
        merged.free()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        for kind in slots:
            obj.data.materials.append(materials[kind])
        return obj


# ------------------------------------------------------------------ architecture

BEAM = .13      # timber section
PLINTH = .45    # stone base height


def roof_simple(b: Builder, w: float, d: float, h: float, kind: str, overhang=.38) -> float:
    rise = max(1.1, d * .48)
    half = d / 2 + overhang
    slope = math.atan2(rise, d / 2)
    length = half / math.cos(slope)
    span = w + overhang * 2
    ridge_z = h + rise + .04
    for side in (-1, 1):
        # Each tile course is a thin board laid along the slope, slightly kicked out at its lower edge.
        courses = max(6, int(length / .28))
        for i in range(courses):
            t0, t1 = i / courses, (i + 1) / courses
            mid = (t0 + t1) / 2
            y = side * math.cos(slope) * length * mid
            z = ridge_z - math.sin(slope) * length * mid
            b.box(kind, (span, length / courses + .06, .05), (0, y, z), rot=(-side * (slope + .045), 0, 0), bevel=.01)
        # Boarded underside.
        b.box("planks", (span - .02, length, .04), (0, side * math.cos(slope) * length / 2, ridge_z - math.sin(slope) * length / 2 - .07),
              rot=(-side * slope, 0, 0), bevel=0)
    b.cylinder(kind, .1, span + .06, (0, 0, ridge_z + .03), rot=(0, math.pi / 2, 0), segments=10)
    # Barge boards along the gable edges.
    for x in (-span / 2, span / 2):
        for side in (-1, 1):
            b.box("timber", (.07, length, .16), (x, side * math.cos(slope) * length / 2, ridge_z - math.sin(slope) * length / 2 - .02),
                  rot=(-side * slope, 0, 0), bevel=.01)
    return rise


def window(b: Builder, x: float, y_face: float, z: float, wide=.7, tall=.85, facing=-1, axis="y", shutters=True) -> None:
    """Window assembly proud of the wall: frame, mullions, glass, sill and open shutters."""
    out = facing * .07
    def at(u, v, depth):  # u along the wall, v up, depth out of the wall
        return (x + u, y_face + depth * facing, v) if axis == "y" else (y_face + depth * facing, x + u, v)
    def sz(u, v, depth):
        return (u, depth, v) if axis == "y" else (depth, u, v)
    b.box("glass", sz(wide - .08, tall - .08, .02), at(0, z, .02), bevel=0)
    for du in (-wide / 2, wide / 2):
        b.box("timber", sz(.08, tall + .08, .1), at(du, z, .05))
    for dv in (-tall / 2, tall / 2):
        b.box("timber", sz(wide + .08, .08, .1), at(0, z + dv, .05))
    b.box("timber", sz(.04, tall, .06), at(0, z, .05), bevel=.006)
    b.box("timber", sz(wide, .04, .06), at(0, z + tall * .1, .05), bevel=.006)
    b.box("planks", sz(wide + .2, .06, .18), at(0, z - tall / 2 - .06, .1))
    if shutters:
        for side in (-1, 1):
            u = side * (wide / 2 + .2)
            if axis == "y":
                b.box("planks", (.36, .04, tall), (x + u, y_face + facing * .16, z), rot=(0, 0, side * facing * .5), bevel=.008)
            else:
                b.box("planks", (.04, .36, tall), (y_face + facing * .16, x + u, z), rot=(0, 0, -side * facing * .5), bevel=.008)


def door(b: Builder, x: float, y_face: float, width=.95, height=1.85) -> None:
    b.box("planks", (width, .08, height), (x, y_face - .05, height / 2 + .02), bevel=.01)
    for dx in (-width / 2 - .06, width / 2 + .06):
        b.box("timber", (.12, .14, height + .1), (x + dx, y_face - .05, (height + .1) / 2))
    b.box("timber", (width + .3, .16, .16), (x, y_face - .06, height + .1))
    for dz in (.4, height - .4):
        b.box("iron", (width * .7, .02, .05), (x - width * .1, y_face - .1, dz), bevel=.004)
    b.cylinder("iron", .035, .05, (x + width * .33, y_face - .12, height * .52), rot=(math.pi / 2, 0, 0), segments=8)
    b.box("stone", (width + .5, .5, .12), (x, y_face - .25, .06), bevel=.02)


def frame_wall(b: Builder, length: float, y_face: float, h: float, openings: list[tuple[float, float]], axis="y", facing=-1,
               bands: tuple[float, ...] = (), door: tuple[float, float] | None = None) -> None:
    """Timber framing proud of a plaster wall: sill, posts, rails, braces; posts skip openings."""
    out = .035
    def put(size_u, size_v, u, v, depth=BEAM, rot=0.0):
        if axis == "y":
            b.box("timber", (size_u, depth, size_v), (u, y_face + facing * out, v), rot=(0, rot, 0))
        else:
            b.box("timber", (depth, size_u, size_v), (y_face + facing * out, u, v), rot=(rot, 0, 0))
    put(length + .1, BEAM, 0, PLINTH + BEAM / 2)
    put(length + .1, BEAM, 0, h - BEAM / 2)
    count = max(2, round(length / 1.25))
    posts = [-length / 2 + i * length / count for i in range(count + 1)]
    for u in posts:
        if any(abs(u - c) < half + .12 for c, half in openings):
            continue
        put(BEAM, h - PLINTH, u, (h + PLINTH) / 2)
    rail = PLINTH + (h - PLINTH) * .42
    # Window sill and head bands run the whole wall (the classic half-timber grid),
    # broken only by the door.
    for z in bands or (rail,):
        if door is None:
            put(length, BEAM * .8, 0, z)
            continue
        left, right = -length / 2, length / 2
        a, c = door[0] - door[1] - .08, door[0] + door[1] + .08
        if z > 1.95 + .1:
            put(length, BEAM * .8, 0, z)
            continue
        if a - left > .1:
            put(a - left, BEAM * .8, (left + a) / 2, z)
        if right - c > .1:
            put(right - c, BEAM * .8, (c + right) / 2, z)
    # Short studs between the head band and the top plate give the upper panels rhythm.
    if bands:
        top = bands[-1]
        for u in [-length / 2 + (i + .5) * length / (count * 2) for i in range(count * 2)]:
            if any(abs(u - o) < half + .1 for o, half in openings) or abs(u) > length / 2 - .2:
                continue
            put(BEAM * .8, h - top - BEAM, u, (h + top) / 2)
    # Diagonal braces at both ends of the wall.
    span = min(1.1, length / 4)
    for sign in (-1, 1):
        u = sign * (length / 2 - span / 2 - .05)
        if any(abs(u - o) < half + span / 2 for o, half in openings):
            continue
        brace_len = math.hypot(span, rail - PLINTH)
        angle = math.atan2(rail - PLINTH, span) * sign
        put(brace_len, BEAM * .75, u, (rail + PLINTH) / 2 + .02, rot=angle if axis == "y" else -angle)


def cottage(spec: dict, materials: dict) -> bpy.types.Object:
    w, d, h, kind = spec["width"], spec["depth"], spec["height"], spec["kind"]
    roof_kind = {"tile": "roof_tile", "tile-dark": "roof_tile_dark", "slate": "slate"}[spec["roof"]]
    b = Builder(spec["id"])
    front, back = -d / 2, d / 2
    door_x = w * .12
    # Plinth and plaster core.
    b.box("stone", (w + .08, d + .08, PLINTH), (0, 0, PLINTH / 2), bevel=.03)
    b.box("plaster", (w - .08, d - .08, h - PLINTH), (0, 0, (h + PLINTH) / 2), bevel=.01)
    # Openings on the front wall.
    window_xs = [x for x in (-w * .3, w * .33) if abs(x - door_x) > 1.0 and abs(x) < w / 2 - .55]
    openings = [(door_x, .6)] + [(x, .45) for x in window_xs]
    win_z = min(h - .7, 1.55)
    sill, head = win_z - .48, win_z + .48
    frame_wall(b, w, front, h, openings, bands=(sill, head), door=(door_x, .55))
    door(b, door_x, front)
    for x in window_xs:
        window(b, x, front, win_z)
    # Back and side walls.
    back_windows = [x for x in (-w * .25, w * .25) if abs(x) < w / 2 - .55]
    frame_wall(b, w, back, h, [(x, .45) for x in back_windows], facing=1, bands=(sill, head))
    for x in back_windows:
        window(b, x, back, win_z, facing=1)
    for side in (-1, 1):
        frame_wall(b, d, side * w / 2, h, [(0, .4)] if d > 2.4 else [], axis="x", facing=side, bands=(sill, head) if d > 2.4 else ())
        if d > 2.4:
            window(b, 0, side * w / 2, win_z, wide=.6, tall=.75, facing=side, axis="x")
    # Gables: plaster triangles with a king post.
    rise = max(1.1, d * .48)
    for side in (-1, 1):
        bm_x = side * (w / 2 - .04)
        b.prism("plaster", d - .08, .08, rise - .05, (0, 0, 0))
        bm, k, g, r = b.parts.pop()
        bmesh.ops.transform(bm, matrix=Matrix.Translation(Vector((bm_x, 0, h))) @ Matrix.Rotation(math.pi / 2, 4, "Z"), verts=bm.verts)
        b.parts.append((bm, k, g, Matrix.Rotation(math.pi / 2, 4, "Z")))
        b.box("timber", (BEAM, BEAM, rise - .15), (side * (w / 2 + .01), 0, h + (rise - .15) / 2))
    roof_simple(b, w, d, h, roof_kind)
    # Chimney through the back slope.
    cx, cy = w * .32, d * .18
    b.box("stone", (.55, .55, rise + 1.1), (cx, cy, h + (rise + 1.1) / 2 - .1), bevel=.03)
    b.box("stone", (.7, .7, .12), (cx, cy, h + rise + 1.0), bevel=.02)
    # Trade details.
    if kind == "inn":
        # Porch roof over the door on two posts.
        b.box("timber", (1.9, 1.0, .08), (door_x, front - .55, 2.25), rot=(-.25, 0, 0), bevel=.01)
        for dx in (-.85, .85):
            b.box("timber", (.12, .12, 2.15), (door_x + dx, front - .98, 1.08))
        for i, dx in enumerate((-w * .42, -w * .42 + .55)):
            b.cylinder("planks", .28, .65, (dx, front - .45, .33), segments=14)
    if kind == "bakery":
        # Domed bread oven against the side wall.
        b.box("stone", (1.1, 1.3, 1.0), (-w / 2 - .5, .1, .5), bevel=.08)
        b.cylinder("stone", .55, 1.1, (-w / 2 - .5, .1, 1.0), rot=(math.pi / 2, 0, 0), segments=14)
        b.box("coals", (.4, .05, .3), (-w / 2 - .5, -.56, .45), bevel=.0)
    if kind == "orphanage":
        # A small bell cote on the ridge.
        b.box("timber", (.6, .6, .7), (-w * .25, 0, h + rise + .4), bevel=.02)
        b.box(roof_kind, (.85, .85, .08), (-w * .25, 0, h + rise + .82), bevel=.02)
        b.cylinder("iron", .14, .22, (-w * .25, 0, h + rise + .45), segments=12)
    return b.finish(materials)


def forge_shed(spec: dict, materials: dict) -> bpy.types.Object:
    """Open-fronted workshop: stone back and side walls, timber posts, hearth glow inside."""
    w, d, h = spec["width"], spec["depth"], spec["height"]
    b = Builder(spec["id"])
    b.box("stone", (w + .08, d + .08, .2), (0, 0, .1), bevel=.02)
    b.box("stone", (w, .35, h), (0, d / 2 - .18, h / 2), bevel=.03)
    for side in (-1, 1):
        b.box("stone", (.35, d, h), (side * (w / 2 - .18), 0, h / 2), bevel=.03)
    for x in (-w / 2 + .2, -w / 6, w / 6, w / 2 - .2):
        b.box("timber", (.2, .2, h), (x, -d / 2 + .12, h / 2))
    b.box("timber", (w + .2, .22, .25), (0, -d / 2 + .12, h - .12))
    b.box("stone", (1.3, .9, .85), (-w * .2, d / 2 - .65, .43), bevel=.05)
    b.box("coals", (.9, .5, .06), (-w * .2, d / 2 - .65, .87), bevel=0)
    b.box("stone", (.7, .6, h + 1.5), (-w * .2, d / 2 - .25, (h + 1.5) / 2), bevel=.04)
    b.box("iron", (.5, .22, .35), (w * .15, -d * .05, .55), bevel=.02)
    b.box("timber", (.35, .35, .38), (w * .15, -d * .05, .19))
    roof_simple(b, w, d, h, "slate")
    return b.finish(materials)


def farm_shed(spec: dict, materials: dict) -> bpy.types.Object:
    w, d, h = spec["width"], spec["depth"], spec["height"]
    b = Builder(spec["id"])
    b.box("stone", (w + .06, d + .06, .2), (0, 0, .1), bevel=.02)
    b.box("planks", (w, d, h - .2), (0, 0, h / 2 + .1), bevel=.01)
    for x in (-w / 2, w / 2):
        for y in (-d / 2, d / 2):
            b.box("timber", (.14, .14, h), (x, y, h / 2))
    b.box("planks", (.9, .06, 1.4), (w * .1, -d / 2 - .03, .8), bevel=.01)
    roof_simple(b, w, d, h, "slate", overhang=.25)
    return b.finish(materials)


# ------------------------------------------------------------------ bake + export


def unwrap_lightmap(obj: bpy.types.Object) -> None:
    obj.data.uv_layers.new(name="AO")
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.scene.objects:
        o.select_set(o == obj)
    obj.data.uv_layers.active = obj.data.uv_layers["AO"]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.006, area_weight=1.0, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_ao(obj: bpy.types.Object) -> bpy.types.Image:
    img = bpy.data.images.new(f"{obj.name}_ao", AO_SIZE, AO_SIZE, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    for mat in obj.data.materials:
        nodes = mat.node_tree.nodes
        tex = nodes.new("ShaderNodeTexImage"); tex.image = img; tex.name = "AO_BAKE"
        uv = nodes.new("ShaderNodeUVMap"); uv.uv_map = "AO"
        mat.node_tree.links.new(uv.outputs["UV"], tex.inputs["Vector"])
        nodes.active = tex
    # A ground plane darkens the base the way soil does; it is removed before export.
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    ground = bpy.context.active_object
    for o in bpy.context.scene.objects:
        o.select_set(o == obj)
    bpy.context.view_layer.objects.active = obj
    obj.data.uv_layers.active = obj.data.uv_layers["AO"]
    bpy.context.scene.world.light_settings.distance = 2.5
    bpy.ops.object.bake(type="AO", margin=6, use_clear=True)
    bpy.data.objects.remove(ground, do_unlink=True)
    # Soften Monte-Carlo grain and lift the floor so AO never goes fully black.
    import numpy as np
    px = np.array(img.pixels[:]).reshape(AO_SIZE, AO_SIZE, 4)
    lum = px[..., 0]
    blurred = lum.copy()
    for shift in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        blurred += np.roll(lum, shift, (0, 1))
    blurred /= 5
    lum = .22 + .78 * np.clip(blurred, 0, 1) ** .85
    px[..., 0] = px[..., 1] = px[..., 2] = lum
    img.pixels[:] = px.ravel()
    img.pack()
    # Wire AO into each material's glTF occlusion socket.
    group = gltf_output_group()
    for mat in obj.data.materials:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        tex = nodes["AO_BAKE"]
        node = nodes.new("ShaderNodeGroup"); node.node_tree = group
        sep = nodes.new("ShaderNodeSeparateColor")
        links.new(tex.outputs["Color"], sep.inputs["Color"])
        links.new(sep.outputs["Red"], node.inputs["Occlusion"])
    obj.data.uv_layers.active = obj.data.uv_layers["UVMap"]
    obj.data.uv_layers["UVMap"].active_render = True
    return img


def main() -> None:
    reset_scene()
    with open(os.path.join(BUILD, "specs.json")) as handle:
        specs = json.load(handle)
    # Estates share one cottage model.
    seen_estate = False
    built = []
    for spec in specs:
        if spec["kind"] == "estate-home":
            if seen_estate:
                continue
            seen_estate = True
            spec = {**spec, "id": "estate-home"}
        kinds = ["plaster", "timber", "planks", "stone", "cobble", "roof_tile", "roof_tile_dark", "slate", "iron", "glass", "coals"]
        materials = {k: material(k) for k in kinds}
        if spec["kind"] == "forge":
            obj = forge_shed(spec, materials)
        elif spec["kind"] == "farm-shed":
            obj = farm_shed(spec, materials)
        else:
            obj = cottage(spec, materials)
        unwrap_lightmap(obj)
        bake_ao(obj)
        obj["kg_building"] = spec["id"]
        built.append(obj)
        print(f"built {spec['id']}: {len(obj.data.polygons)} faces", flush=True)
    for o in bpy.context.scene.objects:
        o.select_set(o in built)
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT, export_format="GLB", use_selection=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_tangents=False,
        export_image_format="WEBP", export_image_quality=82, export_materials="EXPORT",
        export_vertex_color="NONE", export_extras=True,
    )
    print("exported", OUTPUT, os.path.getsize(OUTPUT) // 1024, "KiB", flush=True)


if __name__ == "__main__":
    main()

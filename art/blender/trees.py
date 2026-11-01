"""Grows the forest's trees in Blender and exports them for instancing.

Each species is two meshes sharing one origin at the trunk base:
  <name>-wood   tapered trunk and recursive branches (bark texture)
  <name>-leaves leaf cards with alpha-cut texture and outward "canopy" normals
Vertex colours carry ray-traced ambient occlusion (COLOR_0), so the same tree can be
instanced hundreds of times without per-instance lightmaps.
Run:  python3 art/blender/trees.py
"""
from __future__ import annotations

import math
import os
import random

import bpy  # loads bmesh/mathutils
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
TEX = os.path.join(ROOT, "art", "build", "textures")
OUTPUT = os.path.join(ROOT, "public", "models", "trees.glb")

# ------------------------------------------------------------------ textures


def bark_texture() -> None:
    from textures import fractal, normal_from_height  # same folder
    size = 512
    ridges = fractal(size, 1.8, 71, stretch=(9, 1))     # vertical furrows
    detail = fractal(size, 1.3, 72)
    furrow = np.clip((ridges - .35) * 2.2, 0, 1)
    t = furrow * .7 + detail * .3
    stops = [(0, (40, 30, 23)), (.45, (78, 62, 48)), (1, (118, 102, 84))]
    albedo = np.zeros((size, size, 3))
    for c in range(3):
        albedo[..., c] = np.interp(t, [s for s, _ in stops], [col[c] for _, col in stops])
    lichen = np.clip((fractal(size, 2.6, 73) - .74) * 4, 0, 1)
    albedo = albedo * (1 - lichen[..., None] * .5) + np.array([128, 138, 98]) * lichen[..., None] * .5
    Image.fromarray(albedo.astype(np.uint8)).save(f"{TEX}/bark_albedo.png")
    Image.fromarray(normal_from_height(furrow * .8 + detail * .2, 7)).save(f"{TEX}/bark_normal.png")


def leaf_atlas(name: str, kind: str, seed: int) -> None:
    """A cluster of leaves (or needles) on transparency, drawn at 2x and filtered down."""
    rng = random.Random(seed)
    big = 1024
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    palette = {
        "oak": [(62, 92, 38), (78, 110, 44), (96, 126, 52), (54, 80, 34)],
        "birch": [(96, 128, 52), (118, 146, 60), (138, 158, 70), (84, 116, 46)],
        "pine": [(52, 86, 54), (62, 100, 60), (74, 112, 66), (44, 76, 48)],
    }[kind]
    if kind == "pine":
        # Needle sprays: twigs with dense short strokes.
        for _ in range(26):
            x0, y0 = rng.uniform(.1, .9) * big, rng.uniform(.15, .95) * big
            ang = rng.uniform(-2.2, -.9)
            length = rng.uniform(.25, .45) * big
            x1, y1 = x0 + math.cos(ang) * length, y0 + math.sin(ang) * length
            d.line([(x0, y0), (x1, y1)], fill=(70, 52, 36, 255), width=5)
            for k in range(46):
                t = k / 46
                px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                for side in (-1, 1):
                    a2 = ang + side * rng.uniform(.6, 1.1)
                    nl = rng.uniform(.04, .07) * big * (1 - t * .5)
                    col = rng.choice(palette) + (255,)
                    d.line([(px, py), (px + math.cos(a2) * nl, py + math.sin(a2) * nl)], fill=col, width=4)
    else:
        count = 170 if kind == "oak" else 230
        for _ in range(count):
            cx, cy = rng.gauss(.5, .17) * big, rng.gauss(.5, .17) * big
            if not (60 < cx < big - 60 and 60 < cy < big - 60):
                continue
            w = rng.uniform(.05, .08) * big * (1.15 if kind == "oak" else .8)
            h = w * (1.7 if kind == "oak" else 1.45)
            ang = rng.uniform(0, math.pi * 2)
            leaf = Image.new("RGBA", (int(w * 2.4), int(h * 2.4)), (0, 0, 0, 0))
            ld = ImageDraw.Draw(leaf)
            col = rng.choice(palette)
            lw, lh = leaf.size
            if kind == "oak":
                # Lobed outline: a column of overlapping circles.
                for k in range(5):
                    t = k / 4
                    r = w * (.42 + .18 * math.sin(t * math.pi))
                    for side in (-1, 1):
                        ld.ellipse([lw / 2 + side * r * .35 - r, lh * (.2 + .6 * t) - r * .8, lw / 2 + side * r * .35 + r, lh * (.2 + .6 * t) + r * .8], fill=col + (255,))
            else:
                ld.ellipse([lw / 2 - w / 2, lh / 2 - h / 2, lw / 2 + w / 2, lh / 2 + h / 2], fill=col + (255,))
            ld.line([(lw / 2, lh * .15), (lw / 2, lh * .9)], fill=tuple(max(0, c - 25) for c in col) + (255,), width=3)
            leaf = leaf.rotate(math.degrees(ang), expand=True, resample=Image.BICUBIC)
            img.alpha_composite(leaf, (int(cx - leaf.size[0] / 2), int(cy - leaf.size[1] / 2)))
    img = img.resize((512, 512), Image.LANCZOS)
    # Bleed colour into transparent texels so mip-maps do not fringe black.
    rgb = img.convert("RGB").filter(ImageFilter.MaxFilter(5))
    out = Image.merge("RGBA", (*rgb.split(), img.split()[3]))
    out.save(f"{TEX}/{name}_albedo.png")


# ------------------------------------------------------------------ materials


def material(name: str, albedo: str, normal: str | None, alpha: bool) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(TEX, f"{albedo}.png"))
    vc = nodes.new("ShaderNodeVertexColor"); vc.layer_name = "AO"
    mix = nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1
    links.new(tex.outputs["Color"], mix.inputs["A"])
    links.new(vc.outputs["Color"], mix.inputs["B"])
    links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = .85 if alpha else .92
    if alpha:
        links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        mat.blend_method = "CLIP" if hasattr(mat, "blend_method") else mat.blend_method
    if normal:
        nt = nodes.new("ShaderNodeTexImage"); nt.image = bpy.data.images.load(os.path.join(TEX, f"{normal}.png"))
        nt.image.colorspace_settings.name = "Non-Color"
        nm = nodes.new("ShaderNodeNormalMap")
        links.new(nt.outputs["Color"], nm.inputs["Color"])
        links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


# ------------------------------------------------------------------ growth


class Wood:
    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.tips: list[tuple[Vector, Vector, float]] = []

    def tube(self, points: list[Vector], radii: list[float], sides: int = 8, v_scale: float = 1.0) -> None:
        rings = []
        for i, p in enumerate(points):
            ahead = points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]
            ahead.normalize()
            side = ahead.cross(Vector((0, 0, 1)) if abs(ahead.z) < .95 else Vector((1, 0, 0))).normalized()
            up = side.cross(ahead).normalized()
            ring = []
            for k in range(sides):
                a = k / sides * math.tau
                ring.append(self.bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * radii[i]))
            rings.append(ring)
        length = 0.0
        vs = [0.0]
        for a, b in zip(points, points[1:]):
            length += (b - a).length
            vs.append(length)
        for i in range(len(rings) - 1):
            for k in range(sides):
                k2 = (k + 1) % sides
                face = self.bm.faces.new([rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]])
                face.smooth = True
                for loop, (u, v) in zip(face.loops, [(k, vs[i]), (k + 1, vs[i]), (k + 1, vs[i + 1]), (k, vs[i + 1])]):
                    loop[self.uv].uv = (u / sides * max(1, radii[i] * 9), v * v_scale / 1.2)
        cap = self.bm.faces.new(list(reversed(rings[-1])))
        cap.smooth = True


def curve(start: Vector, direction: Vector, length: float, steps: int, droop: float, rng: random.Random, wobble=.12) -> list[Vector]:
    pts = [start.copy()]
    d = direction.normalized()
    for i in range(steps):
        d = (d + Vector((rng.uniform(-wobble, wobble), rng.uniform(-wobble, wobble), -droop * (i / steps)))).normalized()
        pts.append(pts[-1] + d * (length / steps))
    return pts


def broadleaf(rng: random.Random, height: float, spread: float, levels: int, birch: bool = False) -> Wood:
    wood = Wood()
    trunk_h = height * (.42 if not birch else .55)
    base_r = .3
    pts = curve(Vector((0, 0, -.05)), Vector((rng.uniform(-.05, .05), rng.uniform(-.05, .05), 1)), height * .82, 10, 0, rng, .05)
    radii = [base_r * (1.35 if i == 0 else 1) * (1 - i / 11 * .7) for i in range(len(pts))]
    wood.tube(pts, radii, sides=10)

    def grow(origin: Vector, direction: Vector, length: float, radius: float, depth: int) -> None:
        steps = 5
        p = curve(origin, direction, length, steps, .25 if not birch else .35, rng, .18)
        r = [radius * (1 - i / (steps + 1) * .75) for i in range(len(p))]
        wood.tube(p, r, sides=6 if depth < 2 else 5)
        if depth >= levels - 1:
            # Foliage clothes the fine branches along their length, not only the ends.
            for k in (2, 3, 4):
                wood.tips.append((p[k], (p[k] - p[k - 1]).normalized(), length))
        if depth >= levels:
            wood.tips.append((p[-1], (p[-1] - p[-2]).normalized(), length))
            return
        children = 3 if depth == 0 else 2
        for c in range(children):
            t = rng.uniform(.45, .95)
            idx = min(len(p) - 1, int(t * steps))
            a = rng.uniform(0, math.tau)
            sideways = Vector((math.cos(a), math.sin(a), 0))
            nd = (direction * .55 + sideways * .7 + Vector((0, 0, .35))).normalized()
            grow(p[idx], nd, length * rng.uniform(.55, .72), r[idx] * .62, depth + 1)
        wood.tips.append((p[-1], (p[-1] - p[-2]).normalized(), length))

    first = 5 if not birch else 6
    for i in range(first):
        h = trunk_h + (height * .82 - trunk_h) * (i / first) * .9
        idx = min(len(pts) - 1, int(h / (height * .82) * 10))
        a = i / first * math.tau + rng.uniform(-.4, .4)
        d = Vector((math.cos(a), math.sin(a), rng.uniform(.5, .9) if not birch else rng.uniform(.9, 1.4)))
        grow(pts[idx], d, spread * rng.uniform(.75, 1.0), radii[idx] * .55, 1)
    wood.tips.append((pts[-1], Vector((0, 0, 1)), spread * .6))
    return wood


def pine(rng: random.Random, height: float) -> tuple[Wood, list[tuple[Vector, float, float]]]:
    wood = Wood()
    pts = curve(Vector((0, 0, -.05)), Vector((0, 0, 1)), height, 12, 0, rng, .02)
    radii = [.26 * (1 - i / 13 * .92) for i in range(len(pts))]
    wood.tube(pts, radii, sides=9)
    whorls = []
    count = 9
    for i in range(count):
        z = height * (.22 + .74 * i / (count - 1))
        reach = (1 - i / count) * height * .3 + .35
        whorls.append((Vector((0, 0, z)), reach, i / count))
        for k in range(5):
            a = k / 5 * math.tau + i * .7
            d = Vector((math.cos(a), math.sin(a), -.15))
            p = curve(Vector((0, 0, z)), d, reach, 3, .3, rng, .05)
            wood.tube(p, [.05 * (1 - i / count) + .015, .03, .02, .012], sides=4)
    return wood, whorls


def leaf_cards(tips, rng: random.Random, card: float, per_tip: int, cluster: float) -> tuple[bmesh.types.BMesh, Vector]:
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    centre = sum((t[0] for t in tips), Vector()) / max(1, len(tips))
    for pos, direction, _ in tips:
        for _ in range(per_tip):
            c = pos + Vector((rng.gauss(0, cluster), rng.gauss(0, cluster), rng.gauss(0, cluster * .8)))
            n = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-.2, 1))).normalized()
            t = n.cross(Vector((0, 0, 1)) if abs(n.z) < .9 else Vector((1, 0, 0))).normalized()
            b = n.cross(t).normalized()
            s = card * rng.uniform(.8, 1.25)
            corners = [c + (t * -1 + b * -1) * s / 2, c + (t + b * -1) * s / 2, c + (t + b) * s / 2, c + (t * -1 + b) * s / 2]
            verts = [bm.verts.new(v) for v in corners]
            face = bm.faces.new(verts)
            for loop, coords in zip(face.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
                loop[uv].uv = coords
    return bm, centre


def pine_cards(whorls, rng: random.Random, height: float) -> tuple[bmesh.types.BMesh, Vector]:
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for origin, reach, t in whorls:
        cards = int(10 + reach * 7)
        for k in range(cards):
            a = k / cards * math.tau + rng.uniform(-.2, .2)
            r = reach * rng.uniform(.35, 1.0)
            c = origin + Vector((math.cos(a) * r, math.sin(a) * r, -r * .28 + rng.uniform(-.1, .1)))
            out = Vector((math.cos(a), math.sin(a), 0))
            tangent = Vector((-math.sin(a), math.cos(a), 0))
            down = (out * .45 + Vector((0, 0, -.35))).normalized()
            s = (.7 + reach * .45) * rng.uniform(.85, 1.15)
            corners = [c - tangent * s / 2 - down * s * .1, c + tangent * s / 2 - down * s * .1,
                       c + tangent * s / 2 + down * s * .9 + out * s * .2, c - tangent * s / 2 + down * s * .9 + out * s * .2]
            # Lay the spray roughly horizontal, drooping outward.
            corners = [c + (p - c).normalized() * (p - c).length for p in corners]
            verts = [bm.verts.new(v) for v in corners]
            face = bm.faces.new(verts)
            for loop, coords in zip(face.loops, [(0, 1), (1, 1), (1, 0), (0, 0)]):
                loop[uv].uv = coords
    top = Vector((0, 0, height * .98))
    for k in range(6):
        a = k / 6 * math.tau
        tangent = Vector((-math.sin(a), math.cos(a), 0))
        corners = [top + Vector((0, 0, .5)) - tangent * .35, top + Vector((0, 0, .5)) + tangent * .35,
                   top + Vector((math.cos(a) * .5, math.sin(a) * .5, -.6)) + tangent * .35, top + Vector((math.cos(a) * .5, math.sin(a) * .5, -.6)) - tangent * .35]
        face = bm.faces.new([bm.verts.new(v) for v in corners])
        for loop, coords in zip(face.loops, [(0, 1), (1, 1), (1, 0), (0, 0)]):
            loop[uv].uv = coords
    return bm, Vector((0, 0, height * .5))


# ------------------------------------------------------------------ object assembly + AO


def to_object(name: str, bm: bmesh.types.BMesh, mat: bpy.types.Material) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(mat)
    return obj


def canopy_normals(obj: bpy.types.Object, centre: Vector, squash: float = 1.0) -> None:
    """Leaf cards shade like one soft volume: normals point away from the crown centre."""
    mesh = obj.data
    normals = []
    for loop in mesh.loops:
        p = mesh.vertices[loop.vertex_index].co - centre
        p.z *= squash
        normals.append(p.normalized() if p.length > 1e-4 else Vector((0, 0, 1)))
    mesh.normals_split_custom_set(normals)


def vertex_ao(objects: list[bpy.types.Object], rays: int = 24, distance: float = 2.2, floor: float = .35) -> None:
    """Ray-traced hemisphere occlusion into an 'AO' colour attribute (exported as COLOR_0)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bms = []
    for obj in objects:
        bm = bmesh.new(); bm.from_mesh(obj.data); bm.transform(obj.matrix_world); bms.append(bm)
    merged = bmesh.new()
    for bm in bms:
        tmp = bpy.data.meshes.new("tmp"); bm.to_mesh(tmp); merged.from_mesh(tmp); bpy.data.meshes.remove(tmp)
    ground = [merged.verts.new(v) for v in [(-30, -30, -.02), (30, -30, -.02), (30, 30, -.02), (-30, 30, -.02)]]
    merged.faces.new(ground)
    tree = BVHTree.FromBMesh(merged)
    rng = random.Random(9)
    dirs = []
    for i in range(rays):
        z = (i + .5) / rays
        a = i * 2.39996
        r = math.sqrt(1 - z * z)
        dirs.append(Vector((math.cos(a) * r, math.sin(a) * r, z)))
    for obj in objects:
        mesh = obj.data
        attr = mesh.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
        for v in mesh.vertices:
            p = obj.matrix_world @ v.co
            n = (obj.matrix_world.to_3x3() @ v.normal).normalized()
            hits = 0
            for d in dirs:
                # Rotate the cosine-weighted hemisphere to the vertex normal (approximation: blend toward up for foliage).
                dd = (d + n * .9).normalized()
                hit = tree.ray_cast(p + dd * .04, dd, distance)
                if hit[0] is not None:
                    hits += 1
            occ = 1 - hits / rays
            value = floor + (1 - floor) * occ
            attr.data[v.index].color = (value, value, value, 1)
    for bm in bms:
        bm.free()
    merged.free()


def species(name: str, wood: Wood, leaves: bmesh.types.BMesh, centre: Vector, bark, leaf_mat, squash=1.0) -> list[bpy.types.Object]:
    w = to_object(f"{name}-wood", wood.bm, bark)
    l = to_object(f"{name}-leaves", leaves, leaf_mat)
    canopy_normals(l, centre, squash)
    vertex_ao([w, l])
    return [w, l]


def main() -> None:
    import sys
    sys.path.insert(0, HERE)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bark_texture()
    leaf_atlas("leaves_oak", "oak", 3)
    leaf_atlas("leaves_birch", "birch", 4)
    leaf_atlas("needles_pine", "pine", 5)
    bark = material("bark", "bark_albedo", "bark_normal", False)
    oak_leaves = material("leaves", "leaves_oak_albedo", None, True)
    birch_leaves = material("leaves", "leaves_birch_albedo", None, True)
    pine_leaves = material("leaves", "needles_pine_albedo", None, True)
    built = []
    for i, seed in enumerate((11, 12)):
        rng = random.Random(seed)
        wood = broadleaf(rng, height=6.6 + i * .5, spread=2.2 + i * .3, levels=3)
        leaves, centre = leaf_cards(wood.tips, rng, card=1.0, per_tip=4, cluster=.42)
        built += species(f"oak-{i}", wood, leaves, centre + Vector((0, 0, -.4)), bark, oak_leaves, .8)
    for i, seed in enumerate((21, 22)):
        rng = random.Random(seed)
        wood = broadleaf(rng, height=7.6 + i * .6, spread=2.0, levels=3, birch=True)
        leaves, centre = leaf_cards(wood.tips, rng, card=.9, per_tip=4, cluster=.38)
        built += species(f"broadleaf-{i}", wood, leaves, centre, bark, birch_leaves, .7)
    for i, seed in enumerate((31, 32)):
        rng = random.Random(seed)
        height = 8.2 + i * .9
        wood, whorls = pine(rng, height)
        leaves, centre = pine_cards(whorls, rng, height)
        built += species(f"pine-{i}", wood, leaves, centre, bark, pine_leaves, .45)
    for obj in built:
        print(f"{obj.name}: {len(obj.data.vertices)} verts", flush=True)
    for o in bpy.context.scene.objects:
        o.select_set(o in built)
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT, export_format="GLB", use_selection=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_image_format="WEBP", export_image_quality=85,
        export_vertex_color="ACTIVE", export_all_vertex_colors=True,
    )
    print("exported", OUTPUT, os.path.getsize(OUTPUT) // 1024, "KiB", flush=True)


if __name__ == "__main__":
    main()

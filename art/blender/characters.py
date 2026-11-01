"""Rigged villagers for Kingdom Gods.

Two base bodies (male, female) share one armature layout and five actions
(idle, walk, run, work, attack). Every garment, hairstyle and trade accessory
is a separate mesh named by role; the game shows the ones a person wears and
tints materials named skin / hair / eyes / outfit / trousers / leather / linen / metal.
Units are metres for a 1.75 m adult; the game scales the rig to its world.
Run:  python3 art/blender/characters.py
"""
from __future__ import annotations

import math
import os

import bpy  # loads bmesh/mathutils
import bmesh
from mathutils import Euler, Matrix, Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUTPUT = os.path.join(ROOT, "public", "models", "characters.glb")
FPS = 24

# ------------------------------------------------------------------ materials

PALETTE = {  # neutral bases (sRGB); the game tints each person
    "skin": (.79, .58, .44), "hair": (.33, .23, .17), "eyes": (.45, .58, .5), "eye-white": (.92, .9, .86),
    "pupil": (.04, .04, .04), "lips": (.66, .4, .37), "outfit": (.3, .47, .38), "trousers": (.36, .3, .24),
    "leather": (.39, .29, .2), "linen": (.87, .83, .74), "metal": (.68, .7, .72), "wood": (.5, .37, .25),
    "brows": (.3, .21, .15),
}
_materials: dict[str, bpy.types.Material] = {}


def mat(name: str) -> bpy.types.Material:
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    # Palette values are display (sRGB) colours; Blender shades in linear light.
    bsdf.inputs["Base Color"].default_value = (*[c ** 2.2 for c in PALETTE[name]], 1)
    bsdf.inputs["Roughness"].default_value = {"metal": .35, "eye-white": .2, "pupil": .1, "eyes": .25, "hair": .6, "leather": .55, "skin": .55}.get(name, .85)
    bsdf.inputs["Metallic"].default_value = .85 if name == "metal" else 0
    if name == "skin":
        # A touch of subsurface reads as skin rather than plastic in the reference renders.
        bsdf.inputs["Subsurface Weight"].default_value = .15
    _materials[name] = m
    return m


# ------------------------------------------------------------------ skin-modifier sculpting


def skin_mesh(name: str, points: list[tuple[float, float, float]], radii: list[tuple[float, float]], edges: list[tuple[int, int]],
              material: str, subdiv: int = 2, root: int = 0) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, edges, [])
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    skin = obj.modifiers.new("skin", "SKIN")
    skin.use_smooth_shade = True
    skin.branch_smoothing = .5
    for i, (rx, ry) in enumerate(radii):
        mesh.skin_vertices[0].data[i].radius = (rx, ry)
    mesh.skin_vertices[0].data[root].use_root = True
    sub = obj.modifiers.new("sub", "SUBSURF")
    sub.levels = subdiv; sub.render_levels = subdiv
    apply_modifiers(obj)
    obj.data.materials.append(mat(material))
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def apply_modifiers(obj: bpy.types.Object) -> None:
    deps = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(deps)
    data = bpy.data.meshes.new_from_object(evaluated)
    obj.modifiers.clear()
    old = obj.data
    obj.data = data
    bpy.data.meshes.remove(old)


def primitive(name: str, kind: str, material: str, size=(1, 1, 1), location=(0, 0, 0), rotation=(0, 0, 0), segments=16, smooth=True, bevel=0.0) -> bpy.types.Object:
    bm = bmesh.new()
    if kind == "sphere":
        bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=max(6, segments // 2), radius=.5)
    elif kind == "cylinder":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=.5, radius2=.5, depth=1)
    elif kind == "cone":
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=.5, radius2=.0, depth=1)
    elif kind == "torus":
        # Ring around Z: major radius .5, minor .1 (scaled by size).
        ring = []
        for i in range(segments):
            a = i / segments * math.tau
            ring.append([bm.verts.new((math.cos(a) * .5 + math.cos(b) * .1 * math.cos(a), math.sin(a) * .5 + math.cos(b) * .1 * math.sin(a), math.sin(b) * .1))
                         for b in [j / 6 * math.tau for j in range(6)]])
        for i in range(segments):
            for j in range(6):
                bm.faces.new([ring[i][j], ring[(i + 1) % segments][j], ring[(i + 1) % segments][(j + 1) % 6], ring[i][(j + 1) % 6]])
    else:
        bmesh.ops.create_cube(bm, size=1)
        if bevel:
            bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.transform(bm, matrix=Euler(rotation).to_matrix().to_4x4(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(location), verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat(material))
    for p in obj.data.polygons:
        p.use_smooth = smooth
    return obj


def join(name: str, objects: list[bpy.types.Object]) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name; obj.data.name = name
    return obj


def sculpt(obj: bpy.types.Object, fn) -> None:
    for v in obj.data.vertices:
        v.co = fn(v.co.copy())


# ------------------------------------------------------------------ anatomy


def body(sex: str) -> bpy.types.Object:
    f = sex == "female"
    sh = .17 if f else .2      # shoulder half-width
    hip = .11 if f else .095
    pts = [
        (0, 0, .93),            # 0 pelvis (root)
        (0, 0, 1.08),           # 1 waist
        (0, 0, 1.26),           # 2 chest
        (0, 0, 1.42),           # 3 upper chest
        (0, 0, 1.48),           # 4 neck base
        (0, 0, 1.63),           # 5 neck top (buried in the head)
        (sh, 0, 1.42), (-sh, 0, 1.42),            # 6,7 shoulders
        (sh + .06, .01, 1.16), (-sh - .06, .01, 1.16),  # 8,9 elbows
        (sh + .1, -.02, .92), (-sh - .1, -.02, .92),    # 10,11 wrists
        (sh + .11, -.03, .82), (-sh - .11, -.03, .82),  # 12,13 hand tips
        (hip, 0, .9), (-hip, 0, .9),                    # 14,15 hips
        (hip * .9, -.01, .5), (-hip * .9, -.01, .5),    # 16,17 knees
        (hip * .85, .02, .09), (-hip * .85, .02, .09),  # 18,19 ankles
        (hip * .85, -.14, .035), (-hip * .85, -.14, .035),  # 20,21 toes
    ]
    r = [
        (.15 if f else .14, .11), (.12 if f else .135, .095), (.15 if f else .165, .11), (.14 if f else .16, .1), (.062, .062), (.056, .058),
        (.078, .078), (.078, .078), (.058, .056), (.058, .056), (.04, .034), (.04, .034), (.042, .022), (.042, .022),
        (.085 if f else .08, .085 if f else .08), (.085 if f else .08, .085 if f else .08),
        (.054, .056), (.054, .056), (.038, .04), (.038, .04), (.036, .028), (.036, .028),
    ]
    e = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (3, 6), (3, 7), (6, 8), (7, 9), (8, 10), (9, 11), (10, 12), (11, 13),
         (0, 14), (0, 15), (14, 16), (15, 17), (16, 18), (17, 19), (18, 20), (19, 21)]
    obj = skin_mesh(f"body-{sex}", pts, r, e, "skin")
    hands = []
    for side in (-1, 1):
        x = side * (sh + .105)
        hands.append(primitive("hand", "sphere", "skin", size=(.045, .085, .1), location=(x, -.028, .86), rotation=(0, 0, side * .08), segments=14))
        hands.append(primitive("thumb", "sphere", "skin", size=(.024, .024, .06), location=(x - side * .02, -.055, .885), rotation=(.3, 0, -side * .4), segments=10))
    obj = join(f"body-{sex}", [obj, *hands])
    if f:
        # Gentle bust volume, kept modest under the kirtle.
        def bust(co: Vector) -> Vector:
            for side in (-1, 1):
                c = Vector((side * .075, -.1, 1.28))
                d = (co - c).length
                if d < .09 and co.y < -.04:
                    co.y -= (1 - d / .09) ** 2 * .018
            return co
        sculpt(obj, bust)
    return obj


HZ = 1.69  # head centre height


def head_dims(female: bool) -> tuple[float, float, float]:
    return (.19, .215, .245) if female else (.2, .225, .255)


def smooth(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def head(sex: str, age: str) -> list[bpy.types.Object]:
    from mathutils.bvhtree import BVHTree
    f = sex == "female"
    w, d, h = head_dims(f)
    skull = primitive(f"head-{sex}", "sphere", "skin", size=(w, d, h), location=(0, 0, HZ), segments=64)

    def face(co: Vector) -> Vector:
        x, y, z = co.x, co.y, co.z - HZ
        # Jaw and chin: narrower and slightly forward below the cheekbones.
        if z < -.005:
            t = smooth((-z - .005) / .115)
            co.x *= 1 - t * (.3 if f else .22)
            if y > -d * .2:
                co.y *= 1 - t * .22
        # A flatter face plane instead of a ball.
        if y < -d * .3:
            co.y = -d * .3 + (co.y + d * .3) * .72
        # Cheekbones.
        for side in (-1, 1):
            dd = math.hypot(x - side * .052, z + .012)
            if dd < .04 and y < -.05:
                co.y -= (1 - dd / .04) * .006
        # Eye sockets and brow ridge.
        for side in (-1, 1):
            dd = math.hypot(x - side * .041, (z - .014) * 1.3)
            if dd < .028 and y < -.05:
                co.y += (1 - dd / .028) ** 1.5 * .012
        if .032 < z < .058 and abs(x) < .075 and y < -.06:
            co.y -= .006 * smooth(1 - abs(x) / .075)
        # Nose bridge, tip and wings.
        if abs(x) < .024 and -.04 < z < .03 and y < -.06:
            along = smooth((.03 - z) / .07)
            co.y -= smooth(1 - abs(x) / .024) * (.012 + along * (.028 if not f else .022))
        # Philtrum/mouth recess and chin.
        if abs(x) < .034 and -.075 < z < -.045 and y < -.06:
            co.y += .003 * smooth(1 - abs(x) / .034)
        if abs(x) < .04 and -.118 < z < -.088 and y < -.04:
            co.y -= .008 * smooth(1 - abs(x) / .04) * smooth(1 - abs(z + .103) / .015)
        return co
    sculpt(skull, face)
    ears = [primitive(f"ear-{side}", "sphere", "skin", size=(.02, .042, .058), location=(side * (w / 2 - .004), .008, HZ - .004),
                      rotation=(0, 0, side * .3), segments=14) for side in (-1, 1)]
    bm = bmesh.new(); bm.from_mesh(skull.data)
    tree = BVHTree.FromBMesh(bm)

    def surface(x: float, z: float) -> Vector:
        hit = tree.ray_cast(Vector((x, -1, HZ + z)), Vector((0, 1, 0)))
        return hit[0] if hit[0] is not None else Vector((x, -d / 2, HZ + z))

    parts = []
    for side in (-1, 1):
        x = side * .041
        p = surface(x, .012)
        centre = p + Vector((0, .013, 0))
        parts.append(primitive("eye-white", "sphere", "eye-white", size=(.034, .03, .028), location=centre, segments=18))
        parts.append(primitive("iris", "cylinder", "eyes", size=(.019, .019, .004), location=centre + Vector((0, -.0145, 0)), rotation=(math.pi / 2, 0, 0), segments=18))
        parts.append(primitive("pupil", "cylinder", "pupil", size=(.0085, .0085, .004), location=centre + Vector((0, -.0165, 0)), rotation=(math.pi / 2, 0, 0), segments=12))
        # Upper lid line: a thin dark arc gives the eye a shape and a gaze.
        parts.append(strip("lid", [surface(x + side * k * .016, .023 - abs(k) * .004) + Vector((0, -.004, 0)) for k in (-1, -.4, .3, 1)], .0024, "brows"))
        parts.append(strip("brow", [surface(x + side * k * .022, .044 + (1 - abs(k - .2)) * .006) + Vector((0, -.002, 0)) for k in (-1, -.3, .4, 1.1)], .0048, "brows"))
    up, low = surface(0, -.06), surface(0, -.071)
    parts.append(primitive("lips", "sphere", "lips", size=(.05, .016, .012), location=up + Vector((0, .004, 0)), segments=16))
    parts.append(primitive("lips2", "sphere", "lips", size=(.044, .016, .013), location=low + Vector((0, .004, 0)), segments=16))
    bm.free()
    sub = skull.modifiers.new("smooth", "SUBSURF"); sub.levels = 1
    apply_modifiers(skull)
    for poly in skull.data.polygons:
        poly.use_smooth = True
    head_obj = join(f"head-{sex}", [skull, *ears])
    head_obj.data.validate()
    eye_parts = [o for o in parts if o.name.startswith(("eye-white", "iris", "pupil"))]
    brow_parts = [o for o in parts if o.name.startswith(("brow", "lid"))]
    lip_parts = [o for o in parts if o.name.startswith("lips")]
    eyes = join(f"face-{sex}", eye_parts)
    brows = join(f"brows-{sex}", brow_parts)
    lips = join(f"lips-{sex}", lip_parts)
    return [head_obj, eyes, brows, lips]


def strip(name: str, points: list[Vector], radius: float, material: str) -> bpy.types.Object:
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(points):
        ahead = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        side = ahead.cross(Vector((0, 1, 0))).normalized()
        up = side.cross(ahead).normalized()
        taper = radius * (.55 + .45 * math.sin(math.pi * i / (len(points) - 1)))
        rings.append([bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * taper) for a in [k / 6 * math.tau for k in range(6)]])
    for a, b in zip(rings, rings[1:]):
        for k in range(6):
            bm.faces.new([a[k], a[(k + 1) % 6], b[(k + 1) % 6], b[k]])
    mesh = bpy.data.meshes.new(name); bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh); bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(mat(material))
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def scalp_shell(name: str, sex: str, material: str, keep, offset: float, thickness: float = .008, jitter: float = .0) -> bpy.types.Object:
    """A garment or hair layer cut from the head surface itself, so it hugs the skull."""
    f = sex == "female"
    w, d, h = head_dims(f)
    src = primitive(name, "sphere", material, size=(w, d, h), location=(0, 0, HZ), segments=48)
    bm = bmesh.new(); bm.from_mesh(src.data)
    bmesh.ops.delete(bm, geom=[face for face in bm.faces if not keep(face.calc_center_median() - Vector((0, 0, HZ)))], context="FACES")
    bm.normal_update()
    for v in bm.verts:
        n = v.co - Vector((0, 0, HZ))
        n.normalize()
        rough = (math.sin(v.co.x * 160) * math.sin(v.co.z * 140)) * jitter
        v.co += n * (offset + rough)
    bm.to_mesh(src.data); bm.free()
    sub = src.modifiers.new("smooth", "SUBSURF"); sub.levels = 1
    mod = src.modifiers.new("solid", "SOLIDIFY"); mod.thickness = thickness; mod.offset = -1
    apply_modifiers(src)
    for poly in src.data.polygons:
        poly.use_smooth = True
    return src


# ------------------------------------------------------------------ garments and hair


def shell(name: str, material: str, pts, radii, edges, root=0, subdiv=2) -> bpy.types.Object:
    return skin_mesh(name, pts, radii, edges, material, subdiv, root)


def garments(sex: str) -> list[bpy.types.Object]:
    f = sex == "female"
    sh = .17 if f else .2
    out = []
    # Tunic: torso + sleeves to the elbow + skirt to mid-thigh.
    def tunic(name: str, hem_z: float, flare: float, mat_name: str, sleeves=True) -> bpy.types.Object:
        knee = hem_z < .4  # long robes widen gradually (A-line) instead of ballooning
        pts = [(0, 0, 1.08), (0, 0, 1.26), (0, 0, 1.42), (0, 0, 1.515), (0, 0, .93), (0, 0, .55 if knee else hem_z)]
        r = [(.15 if f else .162, .118), (.18 if f else .19, .132), (.168 if f else .182, .122), (.072, .07), (.172 if f else .168, .13), (flare, flare * .78)]
        e = [(0, 1), (1, 2), (2, 3), (0, 4), (4, 5)]
        if sleeves:
            pts += [(sh, 0, 1.42), (-sh, 0, 1.42), (sh + .055, .01, 1.15), (-sh - .055, .01, 1.15)]
            r += [(.09, .09), (.09, .09), (.07, .068), (.07, .068)]
            e += [(2, 6), (2, 7), (6, 8), (7, 9)]
        if knee:
            r[5] = (flare * .82, flare * .66)
            pts.append((0, 0, hem_z)); r.append((flare, flare * .72)); e.append((5, len(pts) - 1))
        return shell(name, mat_name, pts, r, e)
    out.append(tunic(f"tunic-{sex}", .62 if not f else .5, .2 if not f else .23, "outfit"))
    out.append(tunic(f"robe-{sex}", .12, .25, "outfit"))
    # Trousers and boots.
    hip = .11 if f else .095
    for side in (-1, 1):
        out.append(shell(f"trouser-{sex}-{side}", "trousers",
                         [(side * hip, 0, .92), (side * hip * .9, -.01, .5), (side * hip * .85, .02, .17)],
                         [(.09 if f else .088, .09), (.062, .064), (.048, .05)], [(0, 1), (1, 2)]))
        out.append(shell(f"boot-{sex}-{side}", "leather",
                         [(side * hip * .87, .0, .3), (side * hip * .85, .02, .09), (side * hip * .85, -.15, .04)],
                         [(.052, .054), (.048, .05), (.043, .034)], [(0, 1), (1, 2)]))
    keep = [o for o in out if o.name.startswith(("tunic", "robe"))]
    trouser_parts = [o for o in out if o.name.startswith("trouser")]
    boot_parts = [o for o in out if o.name.startswith("boot")]
    trousers = join(f"trousers-{sex}", trouser_parts)
    boots = join(f"boots-{sex}", boot_parts)
    out = keep + [trousers, boots]
    out.append(primitive(f"belt-{sex}", "torus", "leather", size=(.3 if f else .315, .235 if f else .24, .25), location=(0, 0, 1.06), segments=24))
    out.append(primitive(f"buckle-{sex}", "cube", "metal", size=(.04, .01, .03), location=(0, -.125, 1.06), bevel=.003))
    # Trade pieces.
    out.append(primitive(f"apron-{sex}", "cube", "linen", size=(.28, .02, .62), location=(0, -.135, .86), rotation=(.06, 0, 0), bevel=.006))
    cape = shell(f"cape-{sex}", "outfit", [(0, .1, 1.45), (0, .13, 1.0), (0, .16, .45)], [(.2, .03), (.24, .03), (.27, .03)], [(0, 1), (1, 2)], subdiv=1)
    out.append(cape)
    out.append(primitive(f"satchel-{sex}", "cube", "leather", size=(.18, .07, .16), location=(sh * .85, .02, .98), bevel=.015))
    out.append(primitive(f"strap-{sex}", "cube", "leather", size=(.05, .02, .62), location=(0, -.13, 1.24), rotation=(0, .78, 0), bevel=.004))
    out.append(primitive(f"pack-{sex}", "cube", "leather", size=(.34, .2, .42), location=(0, .2, 1.22), bevel=.04))
    out.append(primitive(f"quiver-{sex}", "cylinder", "leather", size=(.08, .08, .5), location=(.08, .16, 1.28), rotation=(0, -.3, 0), segments=10))
    out.append(primitive(f"pauldrons-{sex}", "sphere", "metal", size=(.17, .15, .1), location=(sh, 0, 1.46), segments=14))
    left = primitive("p2", "sphere", "metal", size=(.17, .15, .1), location=(-sh, 0, 1.46), segments=14)
    out[-1] = join(f"pauldrons-{sex}", [out[-1], left])
    out.append(primitive(f"tabard-{sex}", "cube", "linen", size=(.26, .02, .62), location=(0, -.14, 1.1), bevel=.006))
    return out


def hairline(p: Vector, d: float) -> float:
    """Height (relative to head centre) above which hair grows, front to back."""
    t = smooth((p.y + d * .32) / (d * .6))
    return .07 * (1 - t) + -.1 * t


def headwear(sex: str) -> list[bpy.types.Object]:
    f = sex == "female"
    w, d, h = head_dims(f)
    out = []
    ear = lambda p: abs(p.x) > w * .4 and -.05 < p.z < .03 and abs(p.y) < d * .2
    scalp = lambda p: p.z > hairline(p, d) and not ear(p)
    out.append(scalp_shell(f"hair-short-{sex}", sex, "hair", scalp, .006, .012, .003))
    long_top = scalp_shell("lt", sex, "hair", scalp, .007, .014, .003)
    back = shell("lb", "hair", [(0, .07, HZ + .02), (0, .085, HZ - .14), (0, .08, HZ - .3)], [(.095, .06), (.105, .05), (.095, .03)], [(0, 1), (1, 2)])
    out.append(join(f"hair-long-{sex}", [long_top, back]))
    bun_top = scalp_shell("bt", sex, "hair", scalp, .006, .012, .002)
    bun = primitive("bun", "sphere", "hair", size=(.1, .09, .09), location=(0, d / 2 + .02, HZ + .06), segments=18)
    out.append(join(f"hair-bun-{sex}", [bun_top, bun]))
    braid_top = scalp_shell("brt", sex, "hair", scalp, .006, .012, .002)
    links = [primitive(f"bl{i}", "sphere", "hair", size=(.05, .048, .06), location=(0, d / 2 - .01 + i * .006, HZ - .07 - i * .05), segments=12) for i in range(5)]
    out.append(join(f"hair-braid-{sex}", [braid_top, *links]))
    if not f:
        lips = lambda p: abs(p.x) < .029 and -.08 < p.z < -.051
        moustache = lambda p: abs(p.x) < .042 and -.053 < p.z < -.04 and p.y < -.06
        beard = lambda p: p.y < .03 and not lips(p) and (p.z < -.047 or moustache(p)) and p.z > -.16
        out.append(scalp_shell(f"beard-{sex}", sex, "hair", beard, .003, .009, .002))
    hood = lambda p: p.z > -.12 and not (p.y < -d * .22 and p.z < .075)
    out.append(scalp_shell(f"hood-{sex}", sex, "outfit", hood, .03, .02))
    helm = scalp_shell("hm", sex, "metal", lambda p: p.z > .03, .024, .012)
    rim = primitive("rim", "torus", "metal", size=(w * 1.22, d * 1.22, .25), location=(0, 0, HZ + .045), segments=28)
    out.append(join(f"helmet-{sex}", [helm, rim]))
    brim = primitive("brim", "cylinder", "linen", size=(.46, .48, .014), location=(0, .0, HZ + .085), segments=28)
    crown = primitive("crown", "cylinder", "linen", size=(w * 1.12, d * 1.1, .11), location=(0, .0, HZ + .135), segments=24)
    out.append(join(f"hat-{sex}", [brim, crown]))
    out.append(primitive(f"cap-{sex}", "sphere", "linen", size=(w * 1.16, d * 1.12, .1), location=(0, .01, HZ + .09), segments=24))
    return out


def props_in_hand() -> list[bpy.types.Object]:
    blade = primitive("blade", "cube", "metal", size=(.035, .008, .62), location=(0, 0, .42), bevel=.003)
    guard = primitive("guard", "cube", "metal", size=(.16, .025, .025), location=(0, 0, .1), bevel=.005)
    grip = primitive("grip", "cylinder", "leather", size=(.032, .032, .14), location=(0, 0, .02), segments=8)
    sword = join("sword", [blade, guard, grip])
    handle = primitive("handle", "cylinder", "wood", size=(.035, .035, .8), location=(0, 0, .3), segments=8)
    head = primitive("pickhead", "cone", "metal", size=(.05, .05, .5), location=(0, 0, .66), rotation=(0, math.pi / 2, 0), segments=8)
    pick = join("tool", [handle, head])
    return [sword, pick]


# ------------------------------------------------------------------ armature and actions

BONES = {  # name: (head, tail, parent)
    "root": ((0, 0, 0), (0, .15, 0), None),
    "hips": ((0, 0, .93), (0, 0, 1.08), "root"),
    "spine": ((0, 0, 1.08), (0, 0, 1.26), "hips"),
    "chest": ((0, 0, 1.26), (0, 0, 1.48), "spine"),
    "neck": ((0, 0, 1.47), (0, 0, 1.56), "chest"),
    "head": ((0, 0, 1.56), (0, 0, 1.86), "neck"),
}


def armature(sex: str) -> bpy.types.Object:
    f = sex == "female"
    sh = .17 if f else .2
    hip = .11 if f else .095
    bones = dict(BONES)
    for side, s in (("L", 1), ("R", -1)):
        bones[f"upper_arm.{side}"] = ((s * sh * .55, 0, 1.42), (s * (sh + .06), .01, 1.16), "chest")
        bones[f"forearm.{side}"] = ((s * (sh + .06), .01, 1.16), (s * (sh + .1), -.02, .92), f"upper_arm.{side}")
        bones[f"hand.{side}"] = ((s * (sh + .1), -.02, .92), (s * (sh + .11), -.03, .8), f"forearm.{side}")
        bones[f"thigh.{side}"] = ((s * hip, 0, .92), (s * hip * .9, -.01, .5), "hips")
        bones[f"shin.{side}"] = ((s * hip * .9, -.01, .5), (s * hip * .85, .02, .09), f"thigh.{side}")
        bones[f"foot.{side}"] = ((s * hip * .85, .02, .09), (s * hip * .85, -.14, .035), f"shin.{side}")
    data = bpy.data.armatures.new(f"rig-{sex}")
    rig = bpy.data.objects.new(f"rig-{sex}", data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (h, t, parent) in bones.items():
        b = data.edit_bones.new(name)
        b.head, b.tail = Vector(h), Vector(t)
    for name, (_, _, parent) in bones.items():
        if parent:
            data.edit_bones[name].parent = data.edit_bones[parent]
            data.edit_bones[name].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def bind(rig: bpy.types.Object, meshes: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def attach(rig: bpy.types.Object, obj: bpy.types.Object, bone: str) -> None:
    """Rigid accessory following one bone (hair, hats, weapons)."""
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    bpy.context.view_layer.update()
    obj.matrix_world = world


def pose_key(rig, frame: int, rotations: dict[str, tuple[float, float, float]], root_z: float = 0.0) -> None:
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = Euler(rotations.get(pb.name, (0, 0, 0)))
        pb.keyframe_insert("rotation_euler", frame=frame)
    root = rig.pose.bones["root"]
    root.location = (0, 0, root_z)
    root.keyframe_insert("location", frame=frame)


def make_action(rig, name: str, frames: int, pose) -> bpy.types.Action:
    rig.animation_data_create()
    action = bpy.data.actions.new(name)
    rig.animation_data.action = action
    for frame in range(0, frames + 1, 2):
        t = frame / frames
        rotations, root_z = pose(t)
        pose_key(rig, frame, rotations, root_z)
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    rig.animation_data.action = None
    return action


def actions(rig) -> None:
    tau = math.tau
    # Rotation axes in bone space: X bends forward/back for limbs hanging down the rig.
    def walk_pose(stride: float, bend: float, arm: float, bob: float, lean: float):
        def pose(t: float):
            s = math.sin(t * tau)
            c = math.cos(t * tau)
            rot = {
                "thigh.L": (s * stride, 0, 0), "thigh.R": (-s * stride, 0, 0),
                "shin.L": (-max(0, -c) * bend - .05, 0, 0), "shin.R": (-max(0, c) * bend - .05, 0, 0),
                "foot.L": (max(0, s) * .25, 0, 0), "foot.R": (max(0, -s) * .25, 0, 0),
                "upper_arm.L": (-s * arm, 0, -.08), "upper_arm.R": (s * arm, 0, .08),
                "forearm.L": (-.25 - max(0, -s) * arm * .6, 0, 0), "forearm.R": (-.25 - max(0, s) * arm * .6, 0, 0),
                "spine": (lean, s * .06, 0), "chest": (0, -s * .08, 0), "neck": (-lean * .5, 0, 0),
            }
            return rot, abs(math.sin(t * tau)) * bob - bob * .5
        return pose

    def idle(t: float):
        b = math.sin(t * tau)
        return {"chest": (b * .02, 0, 0), "neck": (-b * .01, 0, 0), "head": (0, math.sin(t * tau + 1) * .05, 0),
                "upper_arm.L": (0, 0, -.1 - b * .01), "upper_arm.R": (0, 0, .1 + b * .01),
                "forearm.L": (-.15, 0, 0), "forearm.R": (-.15, 0, 0), "thigh.L": (0, 0, .02), "thigh.R": (0, 0, -.02)}, 0.0

    def work(t: float):
        s = math.sin(t * tau)
        return {"upper_arm.R": (-1.6 + s * .9, 0, .2), "forearm.R": (-.4 - max(0, s) * .3, 0, 0),
                "upper_arm.L": (-1.1 + s * .5, 0, -.2), "forearm.L": (-.6, 0, 0),
                "spine": (.18 + s * .12, 0, 0), "chest": (.1, 0, 0), "thigh.L": (-.15, 0, 0), "thigh.R": (.1, 0, 0),
                "shin.L": (-.2, 0, 0), "shin.R": (-.15, 0, 0)}, -.03 - abs(s) * .02

    def attack(t: float):
        k = min(1.0, t / .35)
        swing = 1 - (1 - min(1.0, max(0.0, (t - .25) / .35))) ** 2
        return {"upper_arm.R": (-2.4 * k + 2.0 * swing, 0, .3 + .4 * swing), "forearm.R": (-.3, 0, 0),
                "upper_arm.L": (-.5, 0, -.3), "forearm.L": (-.8, 0, 0),
                "spine": (.05, -.35 * k + .7 * swing, 0), "chest": (0, -.2 * k + .4 * swing, 0),
                "thigh.L": (-.35, 0, 0), "thigh.R": (.25, 0, 0), "shin.L": (-.25, 0, 0)}, -.04 * swing

    make_action(rig, "idle", 96, idle)
    make_action(rig, "walk", 28, walk_pose(.42, .75, .32, .035, .04))
    make_action(rig, "run", 18, walk_pose(.75, 1.25, .7, .07, .18))
    make_action(rig, "work", 28, work)
    make_action(rig, "attack", 18, attack)


# ------------------------------------------------------------------ build


def character(sex: str) -> bpy.types.Object:
    rig = armature(sex)
    skin_body = body(sex)
    head_parts = head(sex, "adult")
    clothes = garments(sex)
    bind(rig, [skin_body, head_parts[0], *clothes])
    for obj in head_parts[1:]:
        attach(rig, obj, "head")
    for obj in headwear(sex):
        attach(rig, obj, "head")
    sword, tool = props_in_hand()
    sh = .17 if sex == "female" else .2
    for obj in (sword, tool):
        obj.location = (-(sh + .105), -.03, .86)
        obj.rotation_euler = (math.pi, 0, 0)
        obj.name = f"{obj.name}-{sex}"
        attach(rig, obj, "hand.R")
    actions(rig)
    return rig


def main() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    rigs = [character("male"), character("female")]
    # One file per body, so each file's clips drive exactly one skeleton.
    for rig in rigs:
        bpy.ops.object.select_all(action="DESELECT")
        rig.select_set(True)
        for child in rig.children_recursive:
            child.select_set(True)
        for other in rigs:
            if other is not rig and other.animation_data:
                for track in other.animation_data.nla_tracks:
                    track.mute = True
        if rig.animation_data:
            for track in rig.animation_data.nla_tracks:
                track.mute = False
        sex = rig.name.split("-")[1]
        path = OUTPUT.replace(".glb", f"-{sex}.glb")
        bpy.ops.export_scene.gltf(
            filepath=path, export_format="GLB", use_selection=True, export_apply=False,
            export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
            export_skins=True, export_morph=False, export_texcoords=False, export_normals=True,
            export_materials="EXPORT", export_frame_range=False,
        )
        print("exported", path, os.path.getsize(path) // 1024, "KiB", flush=True)


if __name__ == "__main__":
    main()

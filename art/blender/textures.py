"""Tileable PBR textures for Kingdom Gods, generated without external assets.

Every map is periodic by construction (FFT-filtered noise and wrapped Voronoi),
so it repeats seamlessly across walls, roofs and floors. Each material yields
albedo (sRGB), normal (OpenGL, +Y) and a glTF metallic-roughness map.
"""
from __future__ import annotations

import os
import numpy as np
from PIL import Image

SIZE = 512
rng = np.random.default_rng(1913)


def fractal(size: int = SIZE, beta: float = 2.2, seed: int = 0, stretch: tuple[float, float] = (1, 1)) -> np.ndarray:
    """Periodic 1/f^beta noise in [0, 1]. Stretch elongates features (wood grain)."""
    g = np.random.default_rng(seed)
    white = g.standard_normal((size, size))
    fy = np.fft.fftfreq(size)[:, None] * stretch[1]
    fx = np.fft.fftfreq(size)[None, :] * stretch[0]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    spectrum = np.fft.fft2(white) / f ** (beta / 2)
    spectrum[0, 0] = 0
    n = np.real(np.fft.ifft2(spectrum))
    n -= n.min()
    return n / max(n.max(), 1e-9)


def voronoi(size: int, cells: int, seed: int, jitter: float = .8):
    """Wrapped Voronoi: returns (distance to edge, cell id) arrays."""
    g = np.random.default_rng(seed)
    gy, gx = np.mgrid[0:cells, 0:cells]
    pts = (np.stack([gx, gy], -1) + .5 + (g.random((cells, cells, 2)) - .5) * jitter).reshape(-1, 2) / cells
    ys, xs = np.mgrid[0:size, 0:size] / size
    best = np.full((size, size), 9.0)
    second = np.full((size, size), 9.0)
    ident = np.zeros((size, size), dtype=np.int32)
    for i, (px, py) in enumerate(pts):
        dx = np.abs(xs - px); dx = np.minimum(dx, 1 - dx)
        dy = np.abs(ys - py); dy = np.minimum(dy, 1 - dy)
        d = np.sqrt(dx * dx + dy * dy)
        closer = d < best
        second = np.where(closer, best, np.minimum(second, d))
        ident = np.where(closer, i, ident)
        best = np.where(closer, d, best)
    return (second - best) * cells, ident


def normal_from_height(h: np.ndarray, strength: float) -> np.ndarray:
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * .5 + .5) * 255).astype(np.uint8)


def palette(t: np.ndarray, stops: list[tuple[float, tuple[int, int, int]]]) -> np.ndarray:
    xs = [s for s, _ in stops]
    out = np.zeros(t.shape + (3,))
    for c in range(3):
        out[..., c] = np.interp(t, xs, [col[c] for _, col in stops])
    return out


def save(name: str, folder: str, albedo: np.ndarray, height: np.ndarray, rough: np.ndarray, strength: float, metal: float = 0) -> None:
    os.makedirs(folder, exist_ok=True)
    Image.fromarray(np.clip(albedo, 0, 255).astype(np.uint8)).save(f"{folder}/{name}_albedo.png")
    Image.fromarray(normal_from_height(height, strength)).save(f"{folder}/{name}_normal.png")
    mr = np.zeros(rough.shape + (3,), dtype=np.uint8)
    mr[..., 1] = np.clip(rough * 255, 0, 255)
    mr[..., 2] = int(metal * 255)
    Image.fromarray(mr).save(f"{folder}/{name}_mr.png")


def plaster(folder: str) -> None:
    low, mid, fine = fractal(beta=3.2, seed=1), fractal(beta=2.2, seed=2), fractal(beta=1.2, seed=3)
    stains = np.clip((low - .55) * 2.2, 0, 1)
    t = .55 + (mid - .5) * .25 + (fine - .5) * .12
    albedo = palette(t, [(0, (196, 182, 152)), (.5, (226, 214, 186)), (1, (240, 231, 208))])
    albedo *= (1 - stains[..., None] * .16)
    albedo[..., 2] *= 1 - stains * .05
    height = mid * .6 + fine * .4
    save("plaster", folder, albedo, height, .82 + fine * .12, 3.5)


def timber(folder: str) -> None:
    grain = fractal(beta=2.0, seed=4, stretch=(1, 14))
    rings = np.sin(grain * 38) * .5 + .5
    knots = fractal(beta=3.0, seed=5)
    t = rings * .45 + grain * .4 + (knots > .8) * .3
    albedo = palette(t, [(0, (52, 36, 24)), (.45, (84, 59, 38)), (.8, (108, 78, 50)), (1, (126, 92, 60))])
    height = rings * .7 + grain * .3
    save("timber", folder, albedo, height, .68 + rings * .18, 6)


def planks(folder: str) -> None:
    grain = fractal(beta=2.0, seed=6, stretch=(1, 16))
    ys = np.arange(SIZE)[None, :].repeat(SIZE, 0) / SIZE
    plank = np.floor(ys * 6)
    seam = np.clip(np.abs(((ys * 6) % 1) - .5) * 2 - .9, 0, 1) * 10
    shade = (np.sin(plank * 12.9) * .5 + .5) * .25
    t = grain * .6 + shade + .1
    albedo = palette(t, [(0, (78, 54, 34)), (.5, (118, 84, 52)), (1, (150, 112, 72))])
    albedo *= (1 - np.clip(seam, 0, 1)[..., None] * .55)
    height = grain * .5 - np.clip(seam, 0, 1)
    save("planks", folder, albedo, height, .74 + grain * .15, 5)


def stone(folder: str, cells: int, seed: int, name: str, warm: bool) -> None:
    edge, ident = voronoi(SIZE, cells, seed, .9)
    mortar = np.clip(1 - edge * 9, 0, 1)
    per = (np.sin(ident * 12.9898) * 43758.5453) % 1
    surface = fractal(beta=2.0, seed=seed + 1)
    t = per * .55 + surface * .45
    stops = [(0, (98, 94, 84)), (.5, (138, 132, 116)), (1, (172, 164, 144))] if warm else \
        [(0, (88, 92, 92)), (.5, (122, 126, 124)), (1, (156, 158, 152))]
    albedo = palette(t, stops)
    albedo = albedo * (1 - mortar[..., None]) + np.array([150, 142, 124]) * mortar[..., None] * .85
    bulge = np.clip(edge * 4, 0, 1) ** .5
    height = bulge * .8 + surface * .2 - mortar * .4
    save(name, folder, albedo, height, .86 + surface * .1, 7)


def roof_tiles(folder: str, name: str, stops: list) -> None:
    """Rows run along U; each tile is a rounded tongue with its own tint."""
    ys, xs = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    rows, cols = 8, 10
    ry = ys * rows
    offset = (np.floor(ry) % 2) * .5
    cx = xs * cols + offset
    tile_id = np.floor(ry) * 31 + np.floor(cx)
    u = (cx % 1) - .5
    v = ry % 1
    tongue = np.clip(1 - (np.abs(u) * 2) ** 3, 0, 1) * np.clip(v * 3, 0, 1)
    gap = np.clip(np.abs(u) * 2 - .92, 0, 1) * 12
    per = (np.sin(tile_id * 12.9898) * 43758.5453) % 1
    grime = fractal(beta=2.6, seed=11)
    t = per * .5 + grime * .3 + v * .2
    albedo = palette(t, stops)
    albedo *= (1 - np.clip(gap, 0, 1)[..., None] * .45) * (.82 + .18 * v[..., None])
    moss = np.clip((grime - .72) * 4, 0, 1)
    albedo = albedo * (1 - moss[..., None] * .5) + np.array([88, 104, 58]) * moss[..., None] * .5
    height = tongue * .7 + v * .3 - np.clip(gap, 0, 1) * .5
    save(name, folder, albedo, height, .7 + grime * .2, 6)


def iron(folder: str) -> None:
    n = fractal(beta=1.8, seed=21)
    albedo = palette(n, [(0, (46, 46, 48)), (1, (82, 80, 78))])
    rust = np.clip((fractal(beta=2.8, seed=22) - .7) * 3, 0, 1)
    albedo = albedo * (1 - rust[..., None] * .6) + np.array([120, 66, 36]) * rust[..., None] * .6
    save("iron", folder, albedo, n, .5 + rust * .4, 2, metal=.85)


def build_all(folder: str) -> None:
    plaster(folder)
    timber(folder)
    planks(folder)
    stone(folder, 9, 31, "stone", True)
    stone(folder, 6, 41, "cobble", False)
    roof_tiles(folder, "roof_tile", [(0, (122, 52, 36)), (.5, (158, 74, 48)), (1, (184, 98, 64))])
    roof_tiles(folder, "roof_tile_dark", [(0, (92, 44, 34)), (.5, (126, 60, 44)), (1, (148, 78, 56))])
    roof_tiles(folder, "slate", [(0, (58, 66, 72)), (.5, (78, 88, 94)), (1, (102, 110, 114))])
    iron(folder)


if __name__ == "__main__":
    import sys
    build_all(sys.argv[1] if len(sys.argv) > 1 else "art/build/textures")

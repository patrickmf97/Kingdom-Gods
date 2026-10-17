import * as THREE from "three";

export type SurfaceTexture = "wood" | "shingles" | "stone" | "plaster" | "soil" | "path" | "canvas";

const SIZE = 64;
const TAU = Math.PI * 2;
const fract = (value: number): number => value - Math.floor(value);
const smooth = (value: number): number => value * value * (3 - 2 * value);

/** Integer hashing keeps generation reproducible without touching ambient randomness. */
function hash(x: number, y: number, seed: number): number {
  let value = Math.imul(x + seed, 374761393) ^ Math.imul(y + seed, 668265263);
  value = Math.imul(value ^ value >>> 13, 1274126177);
  return ((value ^ value >>> 16) >>> 0) / 4294967295;
}

/** Value noise wraps its lattice, so every layer is periodic in both axes. */
function noise(u: number, v: number, columns: number, rows: number, seed: number): number {
  const x = u * columns, y = v * rows;
  const left = Math.floor(x), top = Math.floor(y);
  const sx = smooth(fract(x)), sy = smooth(fract(y));
  const at = (cx: number, cy: number): number => hash(cx % columns, cy % rows, seed);
  const upper = at(left, top) * (1 - sx) + at(left + 1, top) * sx;
  const lower = at(left, top + 1) * (1 - sx) + at(left + 1, top + 1) * sx;
  return upper * (1 - sy) + lower * sy;
}

/** Neutral near-white albedo adds surface detail without replacing the authored palette. */
function shade(kind: SurfaceTexture, u: number, v: number): number {
  switch (kind) {
    case "wood": {
      // Narrow wandering fibres run along V; the broad layer suggests growth bands.
      const bend = noise(u, v, 3, 2, 11) * .3 + Math.sin(v * TAU) * .1;
      const fibre = Math.pow(.5 + Math.sin((u * 8 + bend) * TAU) * .5, 7);
      return 251 - fibre * 25 - noise(u, v, 5, 2, 29) * 9 - noise(u, v, 32, 4, 47) * 4;
    }
    case "shingles": {
      const course = Math.floor(v * 4);
      const across = fract(u * 4 + (course % 2) * .5);
      const down = fract(v * 4);
      const overlap = down < .1 || down > .94 ? 23 : 0;
      const joint = across < .055 ? 18 : 0;
      return 251 - Math.max(overlap, joint) - down * 7 - noise(u, v, 16, 12, 73) * 6;
    }
    case "stone": {
      const course = Math.floor(v * 4);
      const across = fract(u * 3 + (course % 2) * .5);
      const down = fract(v * 4);
      const mortar = down < .075 || across < .045 ? 24 : 0;
      const weathering = noise(u, v, 12, 12, 101) * 8 + noise(u, v, 31, 29, 103) * 5;
      return 251 - mortar - weathering;
    }
    case "plaster":
      return 251 - noise(u, v, 5, 5, 127) * 12 - noise(u, v, 24, 24, 131) * 10;
    case "soil": {
      const clumps = noise(u, v, 8, 8, 151) * 12;
      const grit = noise(u, v, 31, 31, 157) * 20;
      return 251 - clumps - grit;
    }
    case "path": {
      const wornTracks = Math.pow(.5 + Math.sin(u * TAU * 2) * .5, 6) * 8;
      const pebbles = Math.max(0, noise(u, v, 24, 24, 173) - .5) * 26;
      return 251 - wornTracks - pebbles - noise(u, v, 7, 9, 179) * 12;
    }
    case "canvas": {
      const warp = .5 + Math.cos(u * TAU * 16) * .5;
      const weft = .5 + Math.cos(v * TAU * 16) * .5;
      const crossing = Math.abs(warp - weft);
      return 252 - (warp + weft) * 7 - crossing * 6 - noise(u, v, 12, 12, 191) * 6;
    }
  }
}

function createSurfaceTexture(kind: SurfaceTexture): THREE.DataTexture {
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    // Duplicating the periodic endpoint also avoids an interpolation seam at the tile edge.
    const u = (x % (SIZE - 1)) / (SIZE - 1);
    const v = (y % (SIZE - 1)) / (SIZE - 1);
    const brightness = Math.round(Math.max(210, Math.min(255, shade(kind, u, v))));
    const offset = (y * SIZE + x) * 4;
    pixels[offset] = brightness;
    pixels[offset + 1] = brightness;
    pixels[offset + 2] = brightness;
    pixels[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = `region-surface-${kind}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Lazy per-region ownership: disposing one environment never invalidates another's maps. */
export class RegionSurfaceTextures {
  private readonly textures = new Map<SurfaceTexture, THREE.DataTexture>();
  private disposed = false;

  get(kind: SurfaceTexture): THREE.DataTexture {
    if (this.disposed) throw new Error("Region surface textures have been disposed");
    let texture = this.textures.get(kind);
    if (!texture) {
      texture = createSurfaceTexture(kind);
      this.textures.set(kind, texture);
    }
    return texture;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}

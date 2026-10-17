import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { RegionSurfaceTextures, type SurfaceTexture } from "../src/three/materials";

const surfaces: SurfaceTexture[] = ["wood", "shingles", "stone", "plaster", "soil", "path", "canvas"];

function pixels(texture: THREE.DataTexture): Uint8Array {
  assert.ok(texture.image.data instanceof Uint8Array);
  return texture.image.data;
}

test("surface maps are deterministic CPU textures with distinct, restrained material detail", () => {
  const first = new RegionSurfaceTextures();
  const second = new RegionSurfaceTextures();
  const fingerprints = new Set<string>();
  let bytes = 0;
  for (const surface of surfaces) {
    const texture = first.get(surface);
    const counterpart = second.get(surface);
    const data = pixels(texture);
    assert.ok(texture instanceof THREE.DataTexture, surface);
    assert.ok([32, 64].includes(texture.image.width), surface);
    assert.equal(texture.image.height, texture.image.width, surface);
    assert.equal(data.length, texture.image.width * texture.image.height * 4, surface);
    assert.deepEqual(data, pixels(counterpart), `${surface} must not depend on call order or ambient randomness`);
    assert.notEqual(texture, counterpart, `${surface} must belong to one active region`);
    assert.notEqual(data.buffer, pixels(counterpart).buffer, `${surface} pixel ownership must also be isolated`);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace, surface);
    assert.equal(texture.wrapS, THREE.RepeatWrapping, surface);
    assert.equal(texture.wrapT, THREE.RepeatWrapping, surface);
    assert.equal(texture.magFilter, THREE.LinearFilter, surface);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter, surface);
    assert.equal(texture.generateMipmaps, true, `${surface} needs stable detail when zoomed out`);
    assert.ok(texture.version > 0, `${surface} is ready to upload`);
    const shades = new Set<number>();
    let brightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      for (let channel = 0; channel < 3; channel++) {
        assert.ok(Number.isFinite(data[i + channel]));
        assert.ok(data[i + channel] >= 210 && data[i + channel] <= 255, `${surface} preserves its base material color`);
      }
      assert.equal(data[i + 3], 255, `${surface} stays opaque`);
      brightness += data[i];
      shades.add(data[i]);
    }
    assert.ok(shades.size >= 15, `${surface} needs readable texture variation`);
    assert.ok(brightness / (data.length / 4) >= 230, `${surface} must stay near white overall`);
    fingerprints.add(Buffer.from(data).toString("base64"));
    bytes += data.byteLength;
  }
  assert.equal(fingerprints.size, surfaces.length, "each surface has its own recognizable pattern");
  assert.ok(bytes <= 7 * 64 * 64 * 4, "one region uses at most 112 KiB of source texture pixels");
  first.dispose();
  second.dispose();
});

test("every surface repeats continuously at both tile borders", () => {
  const textures = new RegionSurfaceTextures();
  for (const surface of surfaces) {
    const texture = textures.get(surface);
    const data = pixels(texture);
    const width = texture.image.width;
    const height = texture.image.height;
    for (let x = 0; x < width; x++) {
      const top = x * 4;
      const bottom = ((height - 1) * width + x) * 4;
      assert.deepEqual(data.slice(top, top + 4), data.slice(bottom, bottom + 4), `${surface} vertical repeat at x=${x}`);
    }
    for (let y = 0; y < height; y++) {
      const left = y * width * 4;
      const right = (y * width + width - 1) * 4;
      assert.deepEqual(data.slice(left, left + 4), data.slice(right, right + 4), `${surface} horizontal repeat at y=${y}`);
    }
  }
  textures.dispose();
});

test("wood grain reads along its length while canvas has crossing woven detail", () => {
  const textures = new RegionSurfaceTextures();
  const changes = (kind: SurfaceTexture): [number, number] => {
    const texture = textures.get(kind);
    const data = pixels(texture);
    const width = texture.image.width;
    let horizontal = 0, vertical = 0;
    for (let y = 0; y < width - 1; y++) for (let x = 0; x < width - 1; x++) {
      const offset = (y * width + x) * 4;
      horizontal += Math.abs(data[offset] - data[offset + 4]);
      vertical += Math.abs(data[offset] - data[offset + width * 4]);
    }
    return [horizontal, vertical];
  };
  const [woodAcross, woodAlong] = changes("wood");
  assert.ok(woodAcross > woodAlong * 2, "grain has a clear long direction");
  const [canvasAcross, canvasAlong] = changes("canvas");
  assert.ok(canvasAcross > 1000 && canvasAlong > 1000, "weave has readable threads in both directions");
  assert.ok(canvasAcross / canvasAlong > .5 && canvasAcross / canvasAlong < 2, "warp and weft have comparable prominence");
  textures.dispose();
});

test("a region caches each surface and disposes its textures exactly once", () => {
  const textures = new RegionSurfaceTextures();
  const liveElsewhere = new RegionSurfaceTextures();
  const counters = new Map<THREE.DataTexture, number>();
  for (const surface of surfaces) {
    const texture = textures.get(surface);
    assert.equal(textures.get(surface), texture);
    counters.set(texture, 0);
    texture.addEventListener("dispose", () => counters.set(texture, counters.get(texture)! + 1));
  }
  let otherRegionDisposals = 0;
  liveElsewhere.get("wood").addEventListener("dispose", () => otherRegionDisposals++);
  textures.dispose();
  textures.dispose();
  for (const count of counters.values()) assert.equal(count, 1);
  assert.equal(otherRegionDisposals, 0, "disposing one region cannot invalidate another region");
  assert.throws(() => textures.get("wood"), /disposed/i, "a disposed cache cannot resurrect GPU resources");
  liveElsewhere.dispose();
  assert.equal(otherRegionDisposals, 1);
});

test("an unused region can be disposed before any texture is requested", () => {
  const textures = new RegionSurfaceTextures();
  assert.doesNotThrow(() => { textures.dispose(); textures.dispose(); });
  assert.throws(() => textures.get("stone"), /disposed/i);
});

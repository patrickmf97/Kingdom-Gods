import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CHARACTER_SURFACES, characterUV, createCharacterMaterials } from "../src/three/character-materials";

const names = Object.keys(CHARACTER_SURFACES) as (keyof typeof CHARACTER_SURFACES)[];
function pixel(texture: THREE.DataTexture, x: number, y: number) {
  const data = texture.image.data as Uint8Array;
  return Array.from(data.slice((y * texture.image.width + x) * 4, (y * texture.image.width + x) * 4 + 4));
}
function maps(material: THREE.MeshStandardMaterial) {
  return [material.map, material.normalMap, material.roughnessMap] as THREE.DataTexture[];
}

test("character surfaces retain neutral saved-palette multiplication and use real smooth material channels", () => {
  const owned = createCharacterMaterials(), material = owned.material;
  assert.ok(material instanceof THREE.MeshStandardMaterial);
  assert.equal(material.color.getHex(), 0xffffff);
  assert.equal(material.vertexColors, true);
  assert.equal(material.flatShading, false);
  assert.equal(material.transparent, false);
  assert.equal(material.depthWrite, true);
  assert.ok(material.metalness <= .1);
  assert.ok(material.normalScale.x > 0 && material.normalScale.x <= .25);
  assert.equal(material.normalScale.x, material.normalScale.y);
  assert.equal(material.map!.colorSpace, THREE.SRGBColorSpace);
  assert.equal(material.normalMap!.colorSpace, THREE.NoColorSpace);
  assert.equal(material.roughnessMap!.colorSpace, THREE.NoColorSpace);
  let bytes = 0;
  for (const texture of maps(material)) {
    assert.ok(texture instanceof THREE.DataTexture);
    assert.equal(texture.image.width, 256); assert.equal(texture.image.height, 256);
    bytes += (texture.image.data as Uint8Array).byteLength;
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(texture.magFilter, THREE.LinearFilter);
    assert.equal(texture.generateMipmaps, true);
  }
  assert.ok(bytes <= 3 * 256 * 256 * 4, "three maps stay within .75 MiB before mipmaps");
  owned.dispose();
});

test("each surface has bounded albedo detail, valid tangent normals and a distinct roughness response", () => {
  const owned = createCharacterMaterials(), [albedo, normal, roughness] = maps(owned.material);
  const response: Record<string, number> = {};
  for (const surface of names) {
    const index = CHARACTER_SURFACES[surface], ox = index % 4 * 64, oy = Math.floor(index / 4) * 128;
    const tones = new Set<number>(); let rough = 0, count = 0, normalVariation = false;
    for (let y = 5; y < 123; y += 3) for (let x = 5; x < 59; x += 3) {
      const color = pixel(albedo, ox + x, oy + y), n = pixel(normal, ox + x, oy + y);
      assert.equal(color[3], 255); assert.ok(Math.min(...color.slice(0, 3)) >= 210, `${surface}: no muddy color blotches`);
      assert.ok(Math.max(...color.slice(0, 3)) - Math.min(...color.slice(0, 3)) <= 4, `${surface}: vertex palette stays authoritative`);
      const vector = n.slice(0, 3).map(value => value / 255 * 2 - 1);
      assert.ok(Math.abs(Math.hypot(...vector) - 1) < .015, `${surface}: normalized tangent normals`);
      assert.ok(vector[2] > .65, `${surface}: shallow surface relief`);
      normalVariation ||= n[0] !== 128 || n[1] !== 128;
      assert.equal(n[3], 255);
      const r = pixel(roughness, ox + x, oy + y);
      assert.equal(r[3], 255); assert.ok(r[1] >= 30 && r[1] <= 250);
      rough += r[1]; count++; tones.add(color[0]);
    }
    assert.ok(tones.size > 2 || surface === "eye", `${surface}: intentional tonal detail`);
    assert.ok(normalVariation || surface === "eye", `${surface}: actual relief beyond albedo`);
    response[surface] = rough / count;
  }
  assert.ok(response.cloth > response.leather && response.leather > response.hair);
  assert.ok(response.linen > response.skin && response.skin > response.metal);
  assert.ok(response.eye < response.hair);
  owned.dispose();
});

test("atlas gutters duplicate their own surface edges and UVs never sample neighboring tiles", () => {
  const owned = createCharacterMaterials();
  for (const surface of names) {
    const index = CHARACTER_SURFACES[surface], ox = index % 4 * 64, oy = Math.floor(index / 4) * 128;
    for (const texture of maps(owned.material)) {
      for (const y of [0, 3, 17, 64, 124, 127]) {
        const sampleY = Math.max(4, Math.min(123, y));
        assert.deepEqual(pixel(texture, ox, oy + y), pixel(texture, ox + 4, oy + sampleY));
        assert.deepEqual(pixel(texture, ox + 63, oy + y), pixel(texture, ox + 59, oy + sampleY));
      }
      for (const x of [5, 23, 51]) {
        assert.deepEqual(pixel(texture, ox + x, oy), pixel(texture, ox + x, oy + 4));
        assert.deepEqual(pixel(texture, ox + x, oy + 127), pixel(texture, ox + x, oy + 123));
      }
    }
    for (const [u, v] of [[0, 0], [1, 1], [.5, .5], [-2, 4], [NaN, Infinity]]) {
      const [x, y] = characterUV(surface, u, v).map(value => value * 256);
      assert.ok(Number.isFinite(x + y));
      assert.ok(x >= ox + 4.5 && x <= ox + 59.5);
      assert.ok(y >= oy + 4.5 && y <= oy + 123.5);
    }
  }
  owned.dispose();
});

test("deterministic per-actor maps own their resources and dispose exactly once", () => {
  const first = createCharacterMaterials(), second = createCharacterMaterials();
  const one = maps(first.material), two = maps(second.material);
  for (let i = 0; i < one.length; i++) {
    assert.notEqual(one[i], two[i]); assert.notEqual(one[i].image.data, two[i].image.data);
    assert.deepEqual(one[i].image.data, two[i].image.data);
  }
  let firstDisposed = 0, secondDisposed = 0;
  for (const resource of [first.material, ...one]) resource.addEventListener("dispose", () => firstDisposed++);
  for (const resource of [second.material, ...two]) resource.addEventListener("dispose", () => secondDisposed++);
  first.dispose(); first.dispose();
  assert.equal(firstDisposed, 4); assert.equal(secondDisposed, 0);
  second.dispose(); second.dispose(); assert.equal(secondDisposed, 4);
});

test("character fill preserves material identity and adds bounded view-shaped diffuse light", () => {
  const owned = createCharacterMaterials(), material = owned.material;
  const shader = {
    uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  const key = material.customProgramCacheKey(), version = material.version;
  const fill = shader.uniforms.uCharacterFillStrength, tint = shader.uniforms.uCharacterFillTint;
  assert.ok(fill && tint, "the actual StandardMaterial shader owns fill uniforms");
  assert.match(shader.fragmentShader, /#include <lights_fragment_end>[\s\S]*reflectedLight\.indirectDiffuse \+=/);
  assert.match(shader.fragmentShader, /dot\(\s*normal\s*,\s*normalize\(vViewPosition\)\s*\)/);
  assert.match(shader.fragmentShader, /diffuseColor\.rgb \* uCharacterFillTint/);
  assert.equal(material.emissive.getHex(), 0x000000, "fill never turns the actor into an emissive lamp");
  assert.equal(material.color.getHex(), 0xffffff); assert.equal(material.vertexColors, true);
  let previous = Infinity;
  for (const daylight of [0, .15, .35, .5, .75, 1]) {
    owned.setLighting(daylight, false);
    assert.ok(fill.value >= .025 - 1e-12 && fill.value <= .18 + 1e-12);
    assert.ok(fill.value <= previous + 1e-12, "fill recedes smoothly with daylight");
    previous = fill.value;
    assert.ok(tint.value instanceof THREE.Color);
    assert.ok(tint.value.toArray().every((value: number) => value >= .9 && value <= 1.05));
    assert.equal(material.version, version, "lighting updates do not request new shader programs");
    assert.equal(material.customProgramCacheKey(), key);
  }
  owned.setLighting(0, false); assert.ok(Math.abs(fill.value - .18) < 1e-12);
  owned.setLighting(1, false); assert.ok(Math.abs(fill.value - .025) < 1e-12);
  owned.setLighting(0, true); assert.ok(Math.abs(fill.value - .06) < 1e-12);
  owned.setLighting(1, true); assert.ok(Math.abs(fill.value - .06) < 1e-12);
  for (const daylight of [NaN, Infinity, -100, 100]) {
    owned.setLighting(daylight, false);
    assert.ok(Number.isFinite(fill.value) && fill.value >= .025 - 1e-12 && fill.value <= .18 + 1e-12);
  }
  owned.dispose(); const disposedFill = fill.value;
  owned.setLighting(0, false); assert.equal(fill.value, disposedFill);
});

test("actor lighting uniforms remain independent while sharing the same compiled program key", () => {
  const first = createCharacterMaterials(), second = createCharacterMaterials();
  const compile = (material: THREE.MeshStandardMaterial) => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer); return shader;
  };
  const one = compile(first.material), two = compile(second.material);
  assert.equal(first.material.customProgramCacheKey(), second.material.customProgramCacheKey());
  assert.notEqual(one.uniforms.uCharacterFillStrength, two.uniforms.uCharacterFillStrength);
  assert.notEqual(one.uniforms.uCharacterFillTint.value, two.uniforms.uCharacterFillTint.value);
  const prior = two.uniforms.uCharacterFillStrength.value;
  first.setLighting(0, false); assert.equal(two.uniforms.uCharacterFillStrength.value, prior);
  first.dispose(); second.dispose();
});

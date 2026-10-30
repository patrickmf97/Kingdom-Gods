import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { AmbienceLayer, AMBIENCE_PARTICLES, createGlowTexture } from "../src/three/ambience";

test("ambience is one bounded, noninteractive draw that follows the focus and disposes cleanly", () => {
  const layer = new AmbienceLayer();
  const points = layer.group.getObjectByName("ambience-motes") as THREE.Points;
  assert.ok(points instanceof THREE.Points);
  assert.equal(points.geometry.getAttribute("position").count, AMBIENCE_PARTICLES);
  assert.ok(AMBIENCE_PARTICLES <= 256);
  assert.equal(points.userData.presentationOnly, true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(layer.group, true).length, 0);
  const material = points.material as THREE.ShaderMaterial;
  for (const [daylight, mood] of [[1, "outdoor"], [0, "outdoor"], [NaN, "interior"], [.5, "underground"]] as const) {
    layer.update(3, new THREE.Vector3(10, 0, 4), daylight, mood, 0, 1.5);
    assert.ok(Number.isFinite(material.uniforms.uNight.value));
    assert.ok(material.uniforms.uNight.value >= 0 && material.uniforms.uNight.value <= 1);
  }
  assert.equal(material.uniforms.uFocus.value.x, 10);
  let disposed = 0;
  points.geometry.addEventListener("dispose", () => disposed++);
  material.addEventListener("dispose", () => disposed++);
  layer.dispose();
  assert.equal(disposed, 2);
});

test("glow texture is a soft radial falloff", () => {
  const texture = createGlowTexture(), data = texture.image.data as Uint8Array, size = texture.image.width;
  const alpha = (x: number, y: number) => data[(y * size + x) * 4 + 3];
  assert.ok(alpha(size / 2, size / 2) > 200);
  assert.equal(alpha(0, 0), 0);
  assert.ok(alpha(size / 2, size / 2) > alpha(size / 2 + 12, size / 2));
  texture.dispose();
});

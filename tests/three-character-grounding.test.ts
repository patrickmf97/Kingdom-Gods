import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

test("cast silhouette extends from the actor's feet toward its head, away from the sun", async () => {
  const { CharacterGrounding } = await import("../src/three/character-grounding");
  const layer = new CharacterGrounding();
  const feet = new THREE.Vector3(10, 0, 20);
  layer.update([feet], { daylight: 1, cloudiness: 0, indoors: false });
  const mesh = layer.group.children[0] as THREE.InstancedMesh, matrix = new THREE.Matrix4();
  mesh.getMatrixAt(1, matrix);
  // Plane UV v+ becomes local -Z after the floor rotation. Sample the actual
  // shader's head (+.57) and lower legs (-.57), then transform into world space.
  const head = new THREE.Vector3(0, 0, -.57 / 2).applyMatrix4(matrix).sub(feet);
  const legs = new THREE.Vector3(0, 0, .57 / 2).applyMatrix4(matrix).sub(feet);
  assert.ok(head.length() > legs.length() + .5, "head must lie at the far end of the projected body");
  assert.ok(head.x > .5 && head.z < -.2, "the head projects away from the sunlight's X-/Z+ position");
  layer.dispose();
});

test("character shadows batch soft contact and directional silhouettes without mutating actors", async () => {
  const module = await import("../src/three/character-grounding").catch(() => null);
  assert.ok(module, "a bounded actor shadow layer must exist");
  const layer = new module.CharacterGrounding(4);
  const actors = [{ x: 4, y: 0, z: 5 }, { x: 8, y: .23, z: 10 }];
  const before = structuredClone(actors);
  layer.update(actors, { daylight: 1, cloudiness: 0, indoors: false });
  assert.equal(layer.drawCalls, 1); assert.equal(layer.count, 4);
  assert.deepEqual(actors, before);
  const mesh = layer.group.children[0] as THREE.InstancedMesh;
  const first = mesh.instanceMatrix.array;
  assert.ok(Array.from(first).every(Number.isFinite));
  assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
  assert.equal((mesh.material as THREE.ShaderMaterial).depthWrite, false);
  assert.match((mesh.material as THREE.ShaderMaterial).fragmentShader, /smoothstep/);
  layer.group.updateMatrixWorld(true);
  assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(4, 4, 5), new THREE.Vector3(0, -1, 0)).intersectObject(layer.group, true), []);
  layer.update(actors, { daylight: 0, cloudiness: 1, indoors: false });
  assert.equal(mesh.instanceMatrix.array, first, "live updates reuse the original GPU arrays");
  assert.equal(layer.count, 2, "night retains foot contact without a sunny cast silhouette");
  layer.update([], { daylight: 1, cloudiness: 0, indoors: true });
  assert.equal(layer.count, 0); assert.equal(layer.drawCalls, 0);
  layer.dispose(); layer.dispose();
});

test("shadow capacity and resource ownership remain bounded through region changes", async () => {
  const module = await import("../src/three/character-grounding").catch(() => null);
  assert.ok(module);
  const layer = new module.CharacterGrounding(3);
  const mesh = layer.group.children[0] as THREE.InstancedMesh;
  let disposed = 0;
  mesh.geometry.addEventListener("dispose", () => disposed++);
  (mesh.material as THREE.Material).addEventListener("dispose", () => disposed++);
  layer.update(Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0, z: i })), { daylight: 1, cloudiness: .1, indoors: false });
  assert.equal(layer.count, 6); assert.equal(mesh.instanceMatrix.count, 6);
  layer.update([{ x: NaN, y: 0, z: 0 }], { daylight: 1, cloudiness: 0, indoors: false });
  assert.equal(layer.count, 0, "invalid presentation coordinates cannot poison a batch");
  layer.dispose(); layer.dispose(); assert.equal(disposed, 2); assert.equal(layer.group.children.length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { initialState } from "../src/simulation";
import { RESOURCE_NODES, regionForZone } from "../src/regions";
import { createLandscapeFinish } from "../src/three/landscape-finish";

for (const zone of ["village", "wilderness", "highlands"] as const) test(`${zone} receives bounded noninteractive contact and broad soil variation`, () => {
  const state = initialState(); state.zone = zone;
  const before = JSON.stringify(state);
  const layer = createLandscapeFinish(zone, state)!;
  const meshes: THREE.Mesh[] = []; layer.group.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  assert.ok(meshes.length <= 3);
  const shadows = layer.group.getObjectByName("landscape-contact-shadows") as THREE.InstancedMesh;
  assert.ok(shadows.count >= regionForZone(zone).decor.length + RESOURCE_NODES.filter(node => node.zone === zone).length);
  assert.ok(shadows.count <= 1024);
  const soil = layer.group.getObjectByName("landscape-ground-variation") as THREE.Mesh;
  assert.ok(soil.material instanceof THREE.MeshStandardMaterial, "ground variation follows the existing lights at night");
  const texture = (soil.material as THREE.MeshStandardMaterial).map! as THREE.DataTexture;
  assert.ok(texture.image.width <= 64 && texture.image.height <= 64);
  assert.ok(new Set((texture.image.data as Uint8Array)).size > 30, "broad ground color must vary");
  layer.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(40, 20, 40), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(layer.group, true).length, 0);
  for (const mesh of meshes) { assert.equal(mesh.castShadow, false); assert.equal(mesh.userData.presentationOnly, true); }
  layer.update(state, 3);
  assert.equal(JSON.stringify(state), before);
  const owned = new Set<THREE.EventDispatcher<{ dispose: {} }>>();
  for (const mesh of meshes) { owned.add(mesh.geometry); owned.add(mesh.material as THREE.Material); if (mesh instanceof THREE.InstancedMesh) owned.add(mesh); }
  for (const mesh of meshes) { const map = (mesh.material as THREE.MeshBasicMaterial).map; if (map) owned.add(map); }
  let disposed = 0; for (const resource of owned) resource.addEventListener("dispose", () => disposed++);
  layer.dispose(); layer.dispose();
  assert.equal(disposed, owned.size); assert.equal(layer.group.children.length, 0);
});

test("resource shadows shrink on depletion and recover without rebuilding GPU resources", () => {
  const state = initialState(); const layer = createLandscapeFinish("village", state)!;
  const mesh = layer.group.getObjectByName("landscape-contact-shadows") as THREE.InstancedMesh;
  const ids = mesh.userData.resourceSlots as Record<string, number>;
  const index = ids.tree1; assert.ok(Number.isInteger(index));
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix); const live = new THREE.Vector3().setFromMatrixScale(matrix).x;
  state.frontier.resources.tree1.remaining = 0; layer.update(state, 0);
  mesh.getMatrixAt(index, matrix); assert.ok(new THREE.Vector3().setFromMatrixScale(matrix).x < live * .5);
  state.frontier.resources.tree1.remaining = 2; layer.update(state, 1);
  mesh.getMatrixAt(index, matrix); assert.equal(new THREE.Vector3().setFromMatrixScale(matrix).x, live);
  layer.dispose();
});

test("enclosed regions never acquire exterior ground layers", () => {
  for (const zone of ["mine", "dungeon", "orphanage"] as const) assert.equal(createLandscapeFinish(zone, initialState()), undefined);
});

test("estate construction activates an existing shadow slot and removal clears it", async () => {
  const { ESTATE_DEFS } = await import("../src/territory-data");
  const state = initialState(); const layer = createLandscapeFinish("wilderness", state)!;
  const shadows = layer.group.getObjectByName("landscape-contact-shadows") as THREE.InstancedMesh;
  const before = [...shadows.instanceMatrix.array]; const storage = shadows.instanceMatrix.array;
  const holding = state.territory.parcels[ESTATE_DEFS[0].id];
  holding.owned = true; holding.building = "warehouse"; layer.update(state, 1);
  assert.equal(shadows.instanceMatrix.array, storage); assert.notDeepEqual([...storage], before);
  holding.building = "none"; layer.update(state, 2); assert.deepEqual([...storage], before);
  layer.dispose();
});

test("environment composition releases finish instances exactly once across repeated disposal", async () => {
  const { createRegionEnvironment } = await import("../src/three/environment");
  const state = initialState();
  const environment = createRegionEnvironment("highlands", state);
  const finish = environment.group.getObjectByName("landscape-finish-highlands")!;
  const contact = finish.getObjectByName("landscape-contact-shadows") as THREE.InstancedMesh;
  let disposed = 0; contact.addEventListener("dispose", () => disposed++);
  const original = JSON.stringify(state); environment.update(state, 4); assert.equal(JSON.stringify(state), original);
  environment.dispose(); environment.dispose(); assert.equal(disposed, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createRegionEnvironment } from "../src/three/environment";
import { initialState } from "../src/simulation";
import { findPath, isWalkable } from "../src/navigation";
import { ESTATE_DEFS, estateSolid } from "../src/territory-data";
import { RESOURCE_NODES, regionForZone } from "../src/regions";
import type { Zone } from "../src/types";

const zones: Zone[] = ["village", "orphanage", "dungeon", "wilderness", "mine"];
const scale = 1 / 24;
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}
function bodyVolumesAt(root: THREE.Object3D, x: number, y: number): THREE.Mesh[] {
  const point = new THREE.Vector3(x * scale, .6, y * scale);
  root.updateMatrixWorld(true);
  return meshes(root).filter(mesh => mesh.visible && !(mesh instanceof THREE.InstancedMesh) &&
    new THREE.Box3().setFromObject(mesh).containsPoint(point));
}
function floorHeight(root: THREE.Object3D, x: number, y: number): number | undefined {
  root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(x * scale, .1, y * scale), new THREE.Vector3(0, -1, 0));
  return ray.intersectObject(root, true)[0]?.point.y;
}

for (const zone of zones) test(`${zone} builds actual finite 3D geometry without a browser or WebGL context`, () => {
  const state = initialState(); state.zone = zone;
  const environment = createRegionEnvironment(zone, state);
  assert.ok(environment.group.children.length > 0);
  const geometry = new Set(meshes(environment.group).map(mesh => mesh.geometry));
  assert.ok(geometry.size > 2);
  for (const value of geometry) {
    const positions = value.getAttribute("position");
    assert.ok(positions?.count > 0);
    for (const coordinate of positions.array) assert.ok(Number.isFinite(coordinate));
    value.computeBoundingSphere();
    assert.ok(value.boundingSphere && Number.isFinite(value.boundingSphere.radius));
  }
  for (const mesh of meshes(environment.group)) {
    assert.ok(mesh.material instanceof THREE.Material || mesh.material.every(material => material instanceof THREE.Material));
    assert.ok(mesh.position.toArray().every(Number.isFinite));
    assert.ok(mesh.scale.toArray().every(Number.isFinite));
  }
  environment.update(state, 37.5);
  environment.dispose();
  assert.equal(environment.group.children.length, 0);
});

test("village landmark bodies cover their existing logical walls and leave the farm gate and bridge clear", () => {
  const state = initialState(); state.zone = "village";
  const environment = createRegionEnvironment("village", state);
  for (const [x, y, label] of [[2110, 278, "crypt"], [1960, 728, "farm shed"], [875, 1111, "inn fence"]] as const) {
    assert.equal(isWalkable({ x, y }, { zone: "village", building: false }), false, label);
    assert.ok(bodyVolumesAt(environment.group, x, y).length > 0, `${label} needs a visible body at its impassable base`);
  }
  for (const [x, y] of [[1894, 866], [1894, 906], [385, 893], [710, 642], [2110, 340]]) {
    assert.equal(isWalkable({ x, y }, { zone: "village", building: false }), true);
    assert.equal(bodyVolumesAt(environment.group, x, y).length, 0, `approach ${x},${y} must remain clear`);
  }
  environment.dispose();
});

test("the orphanage and dungeon allow the original arrival, conversations and exit without new furniture obstacles", () => {
  for (const zone of ["orphanage", "dungeon"] as const) {
    const state = initialState(); state.zone = zone;
    const environment = createRegionEnvironment(zone, state);
    for (const [x, y] of [[450, 750], [400, 290], [450, 790], [270, 460], [650, 400]]) {
      assert.equal(bodyVolumesAt(environment.group, x, y).length, 0, `${zone} ${x},${y}`);
      assert.ok((floorHeight(environment.group, x, y) ?? -1) >= 0);
    }
    environment.dispose();
  }
});

test("mine chamber joins are visible walkable floor along real paths from the entrance to every ore vein", () => {
  const state = initialState(); state.zone = "mine";
  const environment = createRegionEnvironment("mine", state);
  const context = { zone: "mine" as const, building: false };
  for (const node of RESOURCE_NODES.filter(node => node.zone === "mine")) {
    const destination = { x: node.x, y: node.y + 30 };
    const path = findPath({ x: 400, y: 970 }, destination, context);
    assert.ok(path.length > 1, node.id);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16);
      for (let j = 0; j <= steps; j++) {
        const x = a.x + (b.x - a.x) * j / steps, y = a.y + (b.y - a.y) * j / steps;
        assert.equal(bodyVolumesAt(environment.group, x, y).length, 0, `${node.id} wall crosses ${x},${y}`);
        assert.ok((floorHeight(environment.group, x, y) ?? -1) >= -.000001, `${node.id} missing mine floor at ${x},${y}`);
      }
    }
  }
  environment.dispose();
});

test("harvesting changes real resource visibility and replenishment restores the original presentation", () => {
  const state = initialState(); state.zone = "mine";
  const environment = createRegionEnvironment("mine", state);
  const available = environment.group.getObjectByName("mine-iron-west-available")!;
  const depleted = environment.group.getObjectByName("mine-iron-west-depleted")!;
  assert.equal(available.visible, true); assert.equal(depleted.visible, false);
  state.frontier.resources["mine-iron-west"].remaining = 0;
  environment.update(state, 10);
  assert.equal(available.visible, false); assert.equal(depleted.visible, true);
  state.frontier.resources["mine-iron-west"].remaining = 4;
  environment.update(state, 11);
  assert.equal(available.visible, true); assert.equal(depleted.visible, false);
  environment.dispose();
});

test("owned buildings use the same footprints as navigation and visual updates release replaced materials", () => {
  const state = initialState(); state.zone = "wilderness";
  const environment = createRegionEnvironment("wilderness", state);
  const estate = ESTATE_DEFS[0];
  const holding = state.territory.parcels[estate.id];
  const area = estateSolid(estate.id);
  const x = (area.left + area.right) / 2, y = (area.top + area.bottom) / 2;
  assert.equal(bodyVolumesAt(environment.group, x, y).length, 0);
  holding.owned = true; holding.building = "warehouse"; holding.condition = 100;
  environment.update(state, 1);
  assert.ok(bodyVolumesAt(environment.group, x, y).length > 0);
  const building = environment.group.getObjectByName("estate-warehouse")!;
  const temporaryMaterials = new Set(meshes(building).flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material])
    .filter(material => material.transparent));
  let released = 0;
  for (const material of temporaryMaterials) material.addEventListener("dispose", () => released++);
  holding.condition = 10;
  environment.update(state, 2);
  assert.equal(released, temporaryMaterials.size);
  assert.ok(bodyVolumesAt(environment.group, x, y).length > 0);
  assert.equal(bodyVolumesAt(environment.group, estate.x, estate.y).length, 0);
  environment.dispose();
  assert.equal(released, temporaryMaterials.size, "replaced materials must not be disposed twice");
});

test("crop maturity updates legacy crops and repeated planting disposes GPU instance buffers", () => {
  const state = initialState(); state.zone = "village";
  const environment = createRegionEnvironment("village", state);
  state.property.plantedAt = state.day;
  state.economy.crop = null;
  environment.update(state, 1);
  const cropInstances = meshes(environment.group).filter(mesh => mesh instanceof THREE.InstancedMesh && mesh.count === 96);
  assert.equal(cropInstances.length, 2);
  const youngColors = cropInstances.map(mesh => (mesh.material as THREE.MeshStandardMaterial).color.getHex());
  let released = 0;
  cropInstances.forEach(mesh => mesh.addEventListener("dispose", () => released++));
  state.day += 2;
  environment.update(state, 2);
  const ripeInstances = meshes(environment.group).filter(mesh => mesh instanceof THREE.InstancedMesh && mesh.count === 96);
  assert.ok(ripeInstances.some((mesh, i) => (mesh.material as THREE.MeshStandardMaterial).color.getHex() !== youngColors[i]));
  assert.equal(released, 2, "maturing the crop must release replaced instance buffers");
  state.property.plantedAt = null;
  environment.update(state, 3);
  assert.equal(meshes(environment.group).filter(mesh => mesh instanceof THREE.InstancedMesh && mesh.count === 96).length, 0);
  environment.dispose();
});

test("forests use bounded instanced batches and disposing one region leaves another region alive", () => {
  const state = initialState();
  const one = createRegionEnvironment("wilderness", state);
  const two = createRegionEnvironment("mine", state);
  const forestBatches = meshes(one.group).filter(mesh => mesh instanceof THREE.InstancedMesh && mesh.count > 50);
  assert.ok(forestBatches.length > 0 && forestBatches.length <= 5);
  assert.ok(regionForZone("wilderness").decor.length > 100);
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh>();
  for (const mesh of meshes(one.group)) {
    resources.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) resources.add(material);
    if (mesh instanceof THREE.InstancedMesh) resources.add(mesh);
  }
  let disposals = 0; let otherDisposals = 0;
  for (const resource of resources) {
    if (resource instanceof THREE.InstancedMesh) resource.addEventListener("dispose", () => disposals++);
    else resource.addEventListener("dispose", () => disposals++);
  }
  for (const mesh of meshes(two.group)) mesh.geometry.addEventListener("dispose", () => otherDisposals++);
  one.dispose(); one.dispose();
  assert.equal(disposals, resources.size);
  assert.equal(otherDisposals, 0);
  one.update(state, 50);
  assert.equal(one.group.children.length, 0, "updates after teardown must not rebuild orphaned objects");
  two.dispose();
  assert.ok(otherDisposals > 0);
});

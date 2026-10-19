import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { HIGHLAND_BUILDINGS, HIGHLAND_RESOURCE_NODES, HIGHLAND_RIDGES, WILDERNESS_HIGHLANDS_PORTAL } from "../src/highlands";
import { createHighlandsLayer } from "../src/three/highlands";
import { initialState } from "../src/simulation";
import { findPath, objectApproach } from "../src/navigation";

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = []; root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); }); return result;
}
function visible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) { if (!current.visible) return false; current = current.parent; }
  return true;
}
function bodiesAt(root: THREE.Object3D, x: number, y: number): THREE.Mesh[] {
  root.updateMatrixWorld(true);
  const point = new THREE.Vector3(x / 24, .6, y / 24);
  return meshes(root).filter(mesh => visible(mesh) && !(mesh instanceof THREE.InstancedMesh) && !mesh.name.startsWith("horizon-") &&
    new THREE.Box3().setFromObject(mesh).containsPoint(point));
}

test("Brumavale builds a finite region-local mountain landscape with bounded instancing", () => {
  const layer = createHighlandsLayer(initialState());
  const all = meshes(layer.group);
  assert.ok(layer.group.getObjectByName("horizon-highlands"));
  assert.ok(layer.group.getObjectByName("highlands-floor"));
  const foliage = meshes(layer.group.getObjectByName("living-vegetation")!);
  assert.ok(foliage.every(mesh => mesh instanceof THREE.InstancedMesh));
  assert.ok(foliage.length <= 12);
  const plants = foliage.filter(mesh => mesh.name.startsWith("meadow-")) as THREE.InstancedMesh[];
  assert.ok(plants.reduce((total, batch) => total + batch.count, 0) > 2000);
  assert.ok(all.length < 210, `bounded active region draw budget, got ${all.length}`);
  for (const shape of new Set(all.map(mesh => mesh.geometry))) {
    const positions = shape.getAttribute("position");
    assert.ok(positions.count > 0);
    for (const coordinate of positions.array) assert.ok(Number.isFinite(coordinate));
    shape.computeBoundingSphere(); assert.ok(Number.isFinite(shape.boundingSphere!.radius));
  }
  layer.dispose();
});

test("mountain buildings and ridges share navigation solids while all actual destination routes remain visually clear", () => {
  const state = initialState(); state.zone = "highlands";
  const layer = createHighlandsLayer(state), context = { zone: "highlands" as const, building: true };
  for (const building of HIGHLAND_BUILDINGS) {
    assert.ok(layer.group.getObjectByName(building.id));
    const area = building.footprint;
    assert.ok(bodiesAt(layer.group, (area.left + area.right) / 2, (area.top + area.bottom) / 2).length > 0);
  }
  for (const area of HIGHLAND_RIDGES) assert.ok(bodiesAt(layer.group, (area.left + area.right) / 2, (area.top + area.bottom) / 2).length > 0);
  for (const target of [...HIGHLAND_BUILDINGS, ...HIGHLAND_RESOURCE_NODES]) {
    const route = findPath(WILDERNESS_HIGHLANDS_PORTAL.spawn, objectApproach(target.id, context), context);
    assert.ok(route.length > 0, target.id);
    for (let index = 1; index < route.length; index++) {
      const a = route[index - 1], b = route[index], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 14);
      for (let step = 0; step <= steps; step++) {
        const x = a.x + (b.x - a.x) * step / steps, y = a.y + (b.y - a.y) * step / steps;
        assert.equal(bodiesAt(layer.group, x, y).length, 0, `${target.id} visual body crosses ${x},${y}`);
      }
    }
  }
  layer.dispose();
});

test("each mountain reserve switches to a depleted model and recovers without rebuilding its assets", () => {
  const state = initialState(), layer = createHighlandsLayer(state);
  for (const node of HIGHLAND_RESOURCE_NODES) {
    const available = layer.group.getObjectByName(`${node.id}-available`)!;
    const depleted = layer.group.getObjectByName(`${node.id}-depleted`)!;
    assert.ok(available.children.length > 0 && depleted.children.length > 0);
    assert.equal(available.visible, true); assert.equal(depleted.visible, false);
    state.frontier.resources[node.id] = { remaining: 0, readyDay: state.day + node.respawnDays };
    layer.update(state, 30);
    assert.equal(available.visible, false); assert.equal(depleted.visible, true);
    state.frontier.resources[node.id] = { remaining: node.capacity, readyDay: null };
    layer.update(state, 31);
    assert.equal(available.visible, true); assert.equal(depleted.visible, false);
  }
  layer.dispose();
});

test("teardown releases the complete region once and leaves another active layer intact", () => {
  const state = initialState(), one = createHighlandsLayer(state), two = createHighlandsLayer(state);
  const owned = new Set<THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh | THREE.Texture>();
  for (const mesh of meshes(one.group)) {
    owned.add(mesh.geometry);
    if (mesh instanceof THREE.InstancedMesh) owned.add(mesh);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      owned.add(material);
      const map = (material as THREE.MeshStandardMaterial).map; if (map) owned.add(map);
    }
  }
  let released = 0, otherReleased = 0;
  for (const resource of owned) (resource as THREE.BufferGeometry).addEventListener("dispose", () => released++);
  for (const mesh of meshes(two.group)) mesh.geometry.addEventListener("dispose", () => otherReleased++);
  one.dispose(); one.dispose(); one.update(state, 50);
  assert.equal(released, owned.size, "shared assets must release exactly once");
  assert.equal(otherReleased, 0); assert.equal(one.group.children.length, 0);
  two.update(state, 70); assert.ok(two.group.children.length > 0); two.dispose();
});

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createRegionEnvironment } from "../src/three/environment";
import { initialState } from "../src/simulation";
import { regionForZone, RESOURCE_NODES } from "../src/regions";

const meshes = (root: THREE.Object3D): THREE.Mesh[] => {
  const result: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
};
const maps = (root: THREE.Object3D): Set<THREE.Texture> => new Set(meshes(root)
  .flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material])
  .flatMap(material => material instanceof THREE.MeshStandardMaterial && material.map ? [material.map] : []));

test("authored roofs, paths and mine floors carry finite UVs with visibly distinct region-owned surface maps", () => {
  for (const zone of ["village", "wilderness", "mine"] as const) {
    const environment = createRegionEnvironment(zone, initialState());
    const textures = maps(environment.group);
    const surfaces = [...textures].filter(texture => texture.name.startsWith("region-surface-"));
    const landscape = [...textures].filter(texture => !texture.name.startsWith("region-surface-"));
    assert.ok(surfaces.length >= (zone === "village" ? 7 : 3), `${zone} needs intentional surface details`);
    assert.ok(surfaces.length <= 7, "one cached texture per surface keeps uploads bounded");
    assert.equal(landscape.length, zone === "mine" ? 0 : 1, "only one additional exterior ground map is permitted");
    for (const texture of landscape) {
      assert.equal(texture.name, "landscape-broad-ground-64");
      assert.ok(texture instanceof THREE.DataTexture);
      const image = texture.image as { width: number; height: number };
      assert.ok(image.width <= 64 && image.height <= 64);
    }
    for (const mesh of meshes(environment.group)) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (!material.map) continue;
      const positions = mesh.geometry.getAttribute("position");
      const uv = mesh.geometry.getAttribute("uv");
      assert.equal(uv?.count, positions.count, `${mesh.name || mesh.geometry.type} needs a UV for every vertex`);
      assert.ok(Array.from(uv.array).every(Number.isFinite));
      assert.ok(new Set(Array.from(uv.array)).size > 1, "UVs must span the texture");
      const indices = mesh.geometry.index;
      for (let vertex = 0; vertex < (indices?.count ?? positions.count); vertex += 3) {
        const [a, b, c] = [0, 1, 2].map(offset => indices ? indices.getX(vertex + offset) : vertex + offset);
        const edgeA = new THREE.Vector3().fromBufferAttribute(positions, b).sub(new THREE.Vector3().fromBufferAttribute(positions, a));
        const edgeB = new THREE.Vector3().fromBufferAttribute(positions, c).sub(new THREE.Vector3().fromBufferAttribute(positions, a));
        if (edgeA.cross(edgeB).lengthSq() < 1e-12) continue;
        const area = (uv.getX(b) - uv.getX(a)) * (uv.getY(c) - uv.getY(a)) -
          (uv.getY(b) - uv.getY(a)) * (uv.getX(c) - uv.getX(a));
        assert.ok(Math.abs(area) > 1e-9, "every visible textured triangle needs usable UV area");
      }
    }
    assert.ok(meshes(environment.group).length < (zone === "village" ? 500 : zone === "wilderness" ? 450 : 260), "dressing must stay within a cheap geometry budget");
    environment.dispose();
  }
});

test("region surface maps are cached across rebuilt homes and disposed once without affecting another active region", () => {
  const state = initialState();
  state.property.building = true;
  const one = createRegionEnvironment("village", state);
  const two = createRegionEnvironment("village", initialState());
  const original = maps(one.group);
  assert.ok(original.size > 0, "surface maps must exist to exercise ownership");
  let released = 0, otherReleased = 0;
  original.forEach(texture => texture.addEventListener("dispose", () => released++));
  maps(two.group).forEach(texture => texture.addEventListener("dispose", () => otherReleased++));
  state.economy.condition = 10;
  one.update(state, 1);
  assert.deepEqual(maps(one.group), original, "rebuilding a home must reuse region-owned surfaces");
  assert.equal(released, 0, "dynamic fade-material replacement does not own shared maps");
  one.dispose(); one.dispose();
  assert.equal(released, original.size);
  assert.equal(otherReleased, 0);
  two.dispose();
});

test("market and forge dressing stay inside their existing solid bases", () => {
  const environment = createRegionEnvironment("village", initialState());
  const solids = regionForZone("village").solids;
  for (const [name, indices] of [["market-dressing", [8, 11, 12]], ["forge-dressing", [3]]] as const) {
    const dressing = environment.group.getObjectByName(name);
    assert.ok(dressing, `${name} supplies recognizable handmade props`);
    const drawables = meshes(dressing);
    assert.ok(drawables.length >= 6 && drawables.length < 35);
    environment.group.updateMatrixWorld(true);
    for (const mesh of drawables) {
      const box = new THREE.Box3().setFromObject(mesh);
      assert.ok(indices.some(index => {
        const area = solids[index];
        return box.min.x * 24 >= area.left - .01 && box.max.x * 24 <= area.right + .01 &&
          box.min.z * 24 >= area.top - .01 && box.max.z * 24 <= area.bottom + .01;
      }), `${name} ${mesh.name} must stay within an authored obstacle`);
    }
  }
  environment.dispose();
});

test("harvestable pines use layered conifers while oaks keep broad crowns without changing resource identities", () => {
  const environment = createRegionEnvironment("wilderness", initialState());
  for (const node of RESOURCE_NODES.filter(node => node.zone === "wilderness" && node.kind === "resource")) {
    const live = environment.group.getObjectByName(`${node.id}-available`)!;
    const cones = meshes(live).filter(mesh => mesh.geometry instanceof THREE.ConeGeometry);
    assert.equal(cones.length, node.id.includes("pine") ? 3 : 0, node.id);
  }
  environment.dispose();
});

test("mine timber supports have a visible reveal while keeping every new volume outside the walkable chambers", () => {
  const environment = createRegionEnvironment("mine", initialState());
  const dressing = environment.group.getObjectByName("mine-dressing")!;
  const areas = regionForZone("mine").walkableAreas!;
  environment.group.updateMatrixWorld(true);
  const supports = meshes(dressing).filter(mesh => mesh.scale.y > 2);
  assert.ok(supports.length >= 6 && supports.length <= 10);
  for (const mesh of meshes(dressing)) {
    const bounds = new THREE.Box3().setFromObject(mesh);
    for (const area of areas) {
      const overlapX = Math.min(bounds.max.x * 24, area.right) - Math.max(bounds.min.x * 24, area.left);
      const overlapY = Math.min(bounds.max.z * 24, area.bottom) - Math.max(bounds.min.z * 24, area.top);
      assert.ok(overlapX < .001 || overlapY < .001, "embedded props cannot steal chamber floor");
    }
  }
  for (const support of supports) {
    const brace = meshes(dressing).find(mesh => mesh.scale.y < .2 && mesh.position.x === support.position.x &&
      mesh.position.z === support.position.z)!;
    const normalAxis = support.scale.x > support.scale.z ? "x" : "z";
    assert.ok(brace.scale[normalAxis] > support.scale[normalAxis], "brace faces need a real reveal beyond the post");
    const center = support.position.clone(); center.y = 1.2;
    const visible = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)].some(direction => {
      const origin = center.clone().add(direction);
      if (!areas.some(area => origin.x * 24 > area.left && origin.x * 24 < area.right &&
        origin.z * 24 > area.top && origin.z * 24 < area.bottom)) return false;
      const ray = new THREE.Raycaster(origin, direction.clone().negate(), 0, 2);
      return ray.intersectObject(environment.group, true)[0]?.object === support;
    });
    assert.ok(visible, "timber must be visible from its chamber instead of hidden inside an opaque stone wall");
  }
  environment.dispose();
});

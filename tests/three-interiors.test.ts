import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { INTERIORS } from "../src/interiors";
import type { GameState } from "../src/types";
import { createInteriorLayer } from "../src/three/interiors";

const SCALE = 1 / 24;
// The presentation layer deliberately reads no simulation state or browser globals.
const state = {} as GameState;
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}

test("all authored interiors have finite volumetric furniture, a floor and bounded shared GPU resources", () => {
  for (const definition of INTERIORS) {
    const layer = createInteriorLayer(definition, state);
    const drawables = meshes(layer.group);
    const geometries = new Set(drawables.map(mesh => mesh.geometry));
    const materials = new Set(drawables.flatMap(mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    assert.ok(layer.group.getObjectByName("interior-floor"), definition.zone);
    assert.ok(layer.group.getObjectByName("interior-doorframe"), definition.zone);
    assert.ok(geometries.size <= 10, `${definition.zone}: ${geometries.size} geometries`);
    assert.ok(materials.size <= 70, `${definition.zone}: ${materials.size} materials`);
    assert.ok(drawables.length <= 400, `${definition.zone}: ${drawables.length} draw calls`);
    for (const geometry of geometries) {
      for (const value of geometry.getAttribute("position").array) assert.ok(Number.isFinite(value));
      geometry.computeBoundingSphere();
      assert.ok(Number.isFinite(geometry.boundingSphere!.radius));
    }
    let lights = 0;
    layer.group.traverse(object => { if (object instanceof THREE.Light) lights++; });
    assert.equal(lights, 0, "warm hearths and windows use emissive surfaces, without per-prop lights");
    definition.furniture.forEach((furniture, index) => {
      const prop = layer.group.getObjectByName(`furniture-${index}-${furniture.kind}`)!;
      assert.ok(prop, `${definition.zone} missing ${furniture.kind}`);
      const box = new THREE.Box3().setFromObject(prop);
      assert.ok(box.max.y > box.min.y, `${furniture.kind} must be volumetric`);
      const turn = furniture.rotation ?? 0;
      const width = Math.abs(Math.cos(turn)) * furniture.w + Math.abs(Math.sin(turn)) * furniture.d;
      const depth = Math.abs(Math.sin(turn)) * furniture.w + Math.abs(Math.cos(turn)) * furniture.d;
      assert.ok(box.min.x >= (furniture.x - width / 2) * SCALE - .00001, `${definition.zone} ${index}: left footprint`);
      assert.ok(box.max.x <= (furniture.x + width / 2) * SCALE + .00001, `${definition.zone} ${index}: right footprint`);
      assert.ok(box.min.z >= (furniture.y - depth / 2) * SCALE - .00001, `${definition.zone} ${index}: north footprint`);
      assert.ok(box.max.z <= (furniture.y + depth / 2) * SCALE + .00001, `${definition.zone} ${index}: south footprint`);
    });
    layer.dispose();
  }
});

test("spawn, exit and the orphanage introduction have visible floor and no furniture or wall through the hero", () => {
  for (const definition of INTERIORS) {
    const layer = createInteriorLayer(definition, state);
    layer.group.updateMatrixWorld(true);
    const points = [definition.spawn, definition.exit, ...(definition.zone === "orphanage" ? [{ x: 400, y: 290 }] : [])];
    for (const point of points) {
      const body = new THREE.Vector3(point.x * SCALE, .6, point.y * SCALE);
      for (const mesh of meshes(layer.group)) {
        const boxes: THREE.Box3[] = [];
        if (mesh instanceof THREE.InstancedMesh) {
          mesh.geometry.computeBoundingBox();
          for (let index = 0; index < mesh.count; index++) {
            const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
            boxes.push(mesh.geometry.boundingBox!.clone().applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld));
          }
        } else boxes.push(new THREE.Box3().setFromObject(mesh));
        assert.equal(boxes.some(box => box.containsPoint(body)), false,
          `${definition.zone} ${point.x},${point.y}: obstructed by ${mesh.name}`);
      }
      const ray = new THREE.Raycaster(new THREE.Vector3(point.x * SCALE, .15, point.y * SCALE), new THREE.Vector3(0, -1, 0));
      assert.ok(ray.intersectObject(layer.group, true).length > 0, `${definition.zone}: missing floor`);
    }
    layer.dispose();
  }
});

test("interior animation follows only the supplied presentation clock and never allocates replacement geometry", () => {
  const definition = INTERIORS.find(interior => interior.zone === "forge-room")!;
  const layer = createInteriorLayer(definition, state);
  const flame = layer.group.getObjectByName("animated-flame-0")!;
  assert.ok(flame, "the forge has a real animated hearth");
  const initial = flame.scale.clone();
  const resources = meshes(layer.group).map(mesh => mesh.geometry);
  layer.update(state, 7.3);
  assert.notDeepEqual(flame.scale.toArray(), initial.toArray());
  const paused = flame.scale.toArray();
  layer.update(state, 7.3);
  assert.deepEqual(flame.scale.toArray(), paused, "a paused presentation clock freezes fire");
  assert.deepEqual(meshes(layer.group).map(mesh => mesh.geometry), resources);
  layer.dispose();
});

test("authored tabletop dressing has visible support and a turned bed keeps its rotated collision footprint", () => {
  const source = INTERIORS.find(interior => interior.zone === "orphanage")!;
  const definition = { ...source, furniture: source.furniture.map((furniture, index) =>
    index === 0 ? { ...furniture, rotation: Math.PI / 2 } : furniture) };
  const layer = createInteriorLayer(definition, state);
  const bed = new THREE.Box3().setFromObject(layer.group.getObjectByName("furniture-0-bed")!);
  assert.ok(Math.abs((bed.max.x - bed.min.x) / SCALE - definition.furniture[0].d) < .00001);
  assert.ok(Math.abs((bed.max.z - bed.min.z) / SCALE - definition.furniture[0].w) < .00001);
  const deskIndex = definition.furniture.findIndex(furniture => furniture.kind === "desk");
  const booksIndex = definition.furniture.findIndex(furniture => furniture.kind === "books" && furniture.x === 245);
  const desk = layer.group.getObjectByName(`furniture-${deskIndex}-desk`)!;
  const books = layer.group.getObjectByName(`furniture-${booksIndex}-books`)!;
  assert.ok(books.position.y > desk.position.y + 1.3, "authored desk books rest on its tabletop");
  layer.dispose();
});

test("each room releases all geometry, materials, texture maps and instance buffers exactly once", () => {
  const one = createInteriorLayer(INTERIORS[0], state);
  const two = createInteriorLayer(INTERIORS[1], state);
  const resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture | THREE.InstancedMesh>();
  for (const mesh of meshes(one.group)) {
    resources.add(mesh.geometry);
    if (mesh instanceof THREE.InstancedMesh) resources.add(mesh);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      resources.add(material);
      if (material instanceof THREE.MeshStandardMaterial && material.map) resources.add(material.map);
    }
  }
  let released = 0, otherReleased = 0;
  for (const resource of resources) {
    if (resource instanceof THREE.InstancedMesh) resource.addEventListener("dispose", () => released++);
    else if (resource instanceof THREE.Texture) resource.addEventListener("dispose", () => released++);
    else if (resource instanceof THREE.Material) resource.addEventListener("dispose", () => released++);
    else resource.addEventListener("dispose", () => released++);
  }
  for (const mesh of meshes(two.group)) mesh.geometry.addEventListener("dispose", () => otherReleased++);
  one.dispose(); one.dispose(); one.update(state, 20);
  assert.equal(released, resources.size);
  assert.equal(otherReleased, 0);
  assert.equal(one.group.children.length, 0);
  two.dispose();
  assert.ok(otherReleased > 0);
});

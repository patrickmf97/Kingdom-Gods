import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LightningLayer } from "../src/three/lightning";
import { initialState } from "../src/simulation";

test("lightning shows the saved warning point with bounded noninteractive geometry and never changes campaign state", () => {
  const state = initialState();
  state.worldLife.storm.sequence = 1;
  state.worldLife.storm.warning = { id: 1, zone: "village", x: 1400, y: 950, remaining: 3.5 };
  const before = structuredClone(state), layer = new LightningLayer();
  layer.update(state, "village", 1);
  assert.equal(layer.group.visible, true);
  assert.ok(Math.abs(layer.group.position.x - 1400 / 24) < 1e-10); assert.ok(Math.abs(layer.group.position.z - 950 / 24) < 1e-10);
  assert.equal(layer.group.children.filter(object => object.visible).length, 2);
  assert.deepEqual(new THREE.Raycaster(new THREE.Vector3(1400 / 24, 4, 950 / 24), new THREE.Vector3(0, -1, 0)).intersectObject(layer.group, true), []);
  layer.update(state, "inn-room", 1); assert.equal(layer.group.visible, false);
  assert.deepEqual(state, before); layer.dispose();
});

test("a receipt draws a bounded branched bolt once, fades from simulation time and reuses every buffer", () => {
  const state = initialState(), layer = new LightningLayer();
  state.worldLife.storm.sequence = 1;
  state.worldLife.storm.impact = { id: 1, zone: "village", x: 1400, y: 950, remaining: 1.2 };
  layer.update(state, "village", 1);
  const bolt = layer.group.children.find(object => object instanceof THREE.LineSegments) as THREE.LineSegments;
  const vertices = bolt.geometry.getAttribute("position").array;
  assert.ok(bolt.geometry.drawRange.count > 12 && bolt.geometry.drawRange.count <= 144);
  assert.ok(Array.from(vertices).every(Number.isFinite)); assert.ok(layer.flash > 0);
  layer.update(state, "village", 1);
  assert.equal(bolt.geometry.getAttribute("position").array, vertices);
  state.worldLife.storm.impact.remaining = .7; layer.update(state, "village", 1.5);
  assert.equal(bolt.visible, false); assert.equal(layer.flash, 0);
  layer.dispose();
});

test("lightning releases its owned buffers and materials exactly once", () => {
  const layer = new LightningLayer();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  layer.group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    }
  });
  let disposed = 0; resources.forEach(resource => resource.addEventListener("dispose", () => disposed++));
  layer.dispose(); layer.dispose(); assert.equal(disposed, resources.size); assert.equal(layer.group.children.length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { clampPitch, forwardFromYaw, yawFromDirection, FIRST_PERSON_EYE, FIRST_PERSON_HUMAN_SCALE } from "../src/three/presentation";
import { screenToMap } from "../src/three/coordinates";
import { FrameBudget, postQualityFor } from "../src/three/realism";
import { GrassField, GRASS_CAPACITY } from "../src/three/grass";
import { groundCoverAllowed } from "../src/three/vegetation";
import { WORLD_SCALE } from "../src/three/coordinates";

test("first-person forward matches the existing W key direction for any yaw", () => {
  for (const yaw of [-3, -1.2, 0, .4, Math.PI / 2, 2.9]) {
    const forward = forwardFromYaw(yaw), key = screenToMap(0, -1, yaw);
    assert.ok(Math.abs(forward.x - key.x) < 1e-9 && Math.abs(forward.z - key.y) < 1e-9);
    const back = yawFromDirection(forward.x, forward.z);
    assert.ok(Math.abs(Math.atan2(Math.sin(back - yaw), Math.cos(back - yaw))) < 1e-9);
  }
});

test("pitch is clamped and invalid input is neutral", () => {
  assert.equal(clampPitch(5), 1.1);
  assert.equal(clampPitch(-5), -1.25);
  assert.equal(clampPitch(NaN), 0);
  assert.ok(FIRST_PERSON_EYE * 1 < 1.85, "eye height stays under door lintels");
  assert.ok(2.2 * FIRST_PERSON_HUMAN_SCALE < 1.85, "people fit through doors at first-person scale");
});

test("post quality respects phones, overrides and falls back gracefully", () => {
  assert.deepEqual(postQualityFor(false, 1440), { enabled: true, ambientOcclusion: true, bloom: true, samples: 4 });
  assert.equal(postQualityFor(true, 1440).ambientOcclusion, false);
  assert.equal(postQualityFor(false, 600).samples, 0);
  assert.equal(postQualityFor(false, 1440, "?gfx=off").enabled, false);
  assert.deepEqual(postQualityFor(true, 400, "?gfx=high"), { enabled: true, ambientOcclusion: true, bloom: true, samples: 4 });
  const budget = new FrameBudget(30, 4);
  for (const ms of [40, 40, 40]) assert.equal(budget.sample(ms), false);
  assert.equal(budget.sample(40), true, "a slow window asks for less quality");
  for (const ms of [10, 10, 10]) budget.sample(ms);
  assert.equal(budget.sample(10), false);
  assert.equal(budget.sample(NaN), false);
});

test("grass fills open meadow around the eye, stays off roads and hides indoors", () => {
  const grass = new GrassField();
  const eye = new THREE.Vector3(900 * WORLD_SCALE, 1.55, 900 * WORLD_SCALE);
  grass.update("wilderness", eye, true, 1, 1);
  assert.ok(grass.mesh.count > 1000 && grass.mesh.count <= GRASS_CAPACITY);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  for (let i = 0; i < grass.mesh.count; i += 97) {
    grass.mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
    const point = { x: position.x / WORLD_SCALE, y: position.z / WORLD_SCALE };
    assert.ok(groundCoverAllowed("wilderness", { x: Math.floor(point.x / 12) * 12 + 6, y: Math.floor(point.y / 12) * 12 + 6 }, 2, "grass"));
    assert.ok(Math.hypot(position.x - eye.x, position.z - eye.z) < 18);
  }
  const count = grass.mesh.count;
  grass.update("wilderness", eye.clone().add(new THREE.Vector3(.5, 0, 0)), true, 2, 1);
  assert.equal(grass.mesh.count, count, "small steps do not refill the field");
  grass.update("orphanage", eye, true, 3, 1);
  assert.equal(grass.mesh.visible, false);
  grass.update("wilderness", eye, false, 4, 1);
  assert.equal(grass.mesh.visible, false, "the aerial camera keeps its own ground cover");
  assert.equal(grass.mesh.raycast(new THREE.Raycaster(), []), undefined);
  grass.dispose();
});

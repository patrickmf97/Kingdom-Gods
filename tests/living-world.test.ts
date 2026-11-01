import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LivingWorld, SMOKE_PUFFS, FLOCK_BIRDS } from "../src/three/living-world";

test("life layers are bounded, never raycast and dispose everything", () => {
  const life = new LivingWorld();
  life.setChimneys([new THREE.Vector3(1, 5, 1), new THREE.Vector3(4, 6, 2)]);
  life.addFlocks([new THREE.Vector3(0, 15, 0)]);
  life.addButterflies([new THREE.Vector3(2, 0, 2)]);
  const smoke = life.group.getObjectByName("chimney-smoke") as THREE.Points;
  assert.equal(smoke.geometry.getAttribute("position").count, 2 * SMOKE_PUFFS);
  const birds = life.group.getObjectByName("bird-flocks") as THREE.InstancedMesh;
  assert.equal(birds.count, FLOCK_BIRDS);
  const ray = new THREE.Raycaster(new THREE.Vector3(1, 20, 1), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(life.group, true).length, 0);
  life.setChimneys([new THREE.Vector3(0, 4, 0)]);
  assert.equal(life.group.children.filter(child => child.name === "chimney-smoke").length, 1, "chimneys are replaced, not duplicated");
  for (const daylight of [NaN, -1, .5, 4]) life.update(3, daylight);
  life.dispose();
  assert.equal(life.group.children.length, 0);
});

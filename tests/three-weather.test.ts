import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { WeatherLayer, atmosphereFor } from "../src/three/weather";
import type { WeatherSnapshot } from "../src/weather";
const weather = (kind: WeatherSnapshot["kind"], outdoors = true): WeatherSnapshot => ({ day: 10, kind, label: kind, description: "", temperature: 18, precipitation: kind === "rain" ? .8 : 0, cloudiness: kind === "clear" ? .1 : .9, wind: .5, gatheringRate: 1, supplyPenalty: 0, outdoors });

test("weather reuses at most three noninteractive fixed GPU batches under the particle budget", () => {
  const layer = new WeatherLayer(); const point = { x: 1000, y: 800 };
  layer.update(weather("rain"), 10, point, 720);
  assert.ok(layer.count > 100 && layer.count <= 384); assert.ok(layer.capacity <= 384); assert.ok(layer.drawCalls <= 3);
  const meshes = layer.group.children as THREE.InstancedMesh[];
  const arrays = meshes.map(mesh => mesh.instanceMatrix.array);
  const first = meshes.map(mesh => [...mesh.instanceMatrix.array]);
  const versions = meshes.map(mesh => mesh.instanceMatrix.version);
  layer.update(weather("rain"), 10, point, 720);
  meshes.forEach((mesh, index) => { assert.equal(mesh.instanceMatrix.array, arrays[index]); assert.equal(mesh.instanceMatrix.version, versions[index], "a paused presentation clock needs no GPU upload"); assert.deepEqual([...mesh.instanceMatrix.array], first[index]); });
  layer.update(weather("rain"), 11, point, 720);
  assert.notDeepEqual([...meshes[0].instanceMatrix.array], first[0]);
  const ray = new THREE.Raycaster(new THREE.Vector3(1000 / 24, 30, 800 / 24), new THREE.Vector3(0, -1, 0));
  layer.group.updateMatrixWorld(true); assert.equal(ray.intersectObject(layer.group, true).length, 0);
  const resources = new Set<THREE.EventDispatcher<{ dispose: {} }>>();
  for (const mesh of meshes) { resources.add(mesh); resources.add(mesh.geometry); resources.add(mesh.material as THREE.Material); assert.equal(mesh.castShadow, false); }
  let releases = 0; resources.forEach(resource => resource.addEventListener("dispose", () => releases++));
  layer.dispose(); layer.dispose(); assert.equal(releases, resources.size); assert.equal(layer.group.children.length, 0);
});

test("rain and fog stay outside, and clear skies have no precipitation", () => {
  const layer = new WeatherLayer();
  layer.update(weather("rain", false), 1, { x: 0, y: 0 }, 720); assert.equal(layer.count, 0); assert.equal(layer.drawCalls, 0);
  layer.update(weather("clear"), 1, { x: 0, y: 0 }, 720);
  assert.equal((layer.group.getObjectByName("weather-rain") as THREE.InstancedMesh).count, 0);
  layer.update(weather("fog"), 1, { x: 0, y: 0 }, 720); assert.ok((layer.group.getObjectByName("weather-fog") as THREE.InstancedMesh).count > 0);
  layer.dispose();
});

test("sunrise and sunset warm the same lights while night is readable blue and fog reduces distance", () => {
  const noon = atmosphereFor(720, weather("clear")), dawn = atmosphereFor(390, weather("clear")), dusk = atmosphereFor(1050, weather("clear")), night = atmosphereFor(60, weather("clear"));
  assert.ok(dawn.sun.r > dawn.sun.b * 1.3); assert.ok(dusk.sun.r > dusk.sun.b * 1.3);
  assert.ok(night.sky.b > night.sky.r); assert.ok(night.ambient.b > night.ambient.r);
  assert.ok(night.ambientIntensity >= .6); assert.ok(noon.sunIntensity > night.sunIntensity);
  assert.ok(atmosphereFor(720, weather("fog")).fogFar < noon.fogFar);
});

test("Brumavale receives the existing outdoor pollen and firefly presentation", async () => {
  const { initialState } = await import("../src/simulation");
  const { EffectSimulation, PARTICLE_KINDS } = await import("../src/three/effects");
  const state = initialState(); state.zone = "highlands"; state.phase = "playing"; state.minutes = 720;
  const effects = new EffectSimulation(); effects.reset(state);
  for (let i = 0; i < 8; i++) effects.update(state, .1);
  assert.ok([...effects.pool.kinds.slice(0, effects.pool.count)].includes(PARTICLE_KINDS.pollen));
  effects.reset(state); state.minutes = 60;
  for (let i = 0; i < 8; i++) effects.update(state, .1);
  assert.ok([...effects.pool.kinds.slice(0, effects.pool.count)].includes(PARTICLE_KINDS.firefly));
});

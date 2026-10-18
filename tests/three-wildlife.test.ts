import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ANIMAL_DEFS } from "../src/wildlife-data";
import type { AnimalBehavior, AnimalSpecies, AnimalState, GameState, Zone } from "../src/types";

function campaign() {
  const animals = Object.fromEntries(ANIMAL_DEFS.map((definition, index) => [definition.id, {
    id: definition.id, species: definition.species, zone: definition.zone,
    x: definition.homeX, y: definition.homeY, facing: .4, behavior: "idle",
    target: null, wait: 1, trust: .3, fear: 0, lastFedDay: null, seed: index + 10,
  } satisfies AnimalState]));
  return { wildlife: { animals, observed: [] } } as unknown as GameState;
}
async function layer() {
  const module = await import("../src/three/wildlife").catch(() => null);
  assert.ok(module, "the state-driven wildlife presentation layer must exist without WebGL or a DOM");
  return module.createWildlifeLayer();
}
function meshes(group: THREE.Object3D) {
  const result: THREE.Mesh[] = [];
  group.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}
function animal(group: THREE.Group, species: AnimalSpecies) {
  const result = group.children.find(object => object.userData.species === species);
  assert.ok(result, `${species} model is present`);
  return result;
}
function features(group: THREE.Object3D): string[] {
  return meshes(group).flatMap(mesh => mesh.userData.features as string[]);
}
function pose(group: THREE.Object3D) {
  const result: number[][] = [];
  group.traverse(object => result.push([...object.position.toArray(), ...object.rotation.toArray().slice(0, 3) as number[]]));
  return result;
}

test("the 22 authored inhabitants render only in the requested zone with stable ray-picking IDs", async () => {
  const view = await layer(), state = campaign();
  const before = JSON.stringify(state);
  for (const [zone, count] of [["village", 10], ["wilderness", 12], ["mine", 0]] as const) {
    view.update(state, zone, 2);
    assert.equal(view.group.children.length, count);
    for (const root of view.group.children) {
      const saved = state.wildlife.animals[root.userData.animalId];
      assert.ok(saved && saved.zone === zone);
      assert.ok(Math.abs(root.position.x - saved.x / 24) < 1e-9);
      assert.ok(Math.abs(root.position.z - saved.y / 24) < 1e-9);
      assert.equal(root.position.y, 0);
      assert.ok(Math.abs(root.rotation.y - (Math.PI / 2 - saved.facing)) < 1e-9);
    }
  }
  assert.equal(JSON.stringify(state), before, "presentation cannot update authoritative animal state");
  view.dispose();
});

test("seven volumetric silhouettes have their defining anatomy, coloured geometry and sensible grounded proportions", async () => {
  const view = await layer(), state = campaign();
  const required: Record<AnimalSpecies, string[]> = {
    chicken: ["beak", "comb", "wing-left", "wing-right", "tail-feathers", "toe-left"],
    sheep: ["wool", "muzzle", "ear-left", "hoof-front-left"],
    cow: ["horn-left", "horn-right", "muzzle", "udder", "tail-tuft", "coat-patch"],
    dog: ["collar", "muzzle", "ear-left", "tail"],
    deer: ["ear-left", "white-rump", "hoof-front-left"],
    rabbit: ["long-ear-left", "long-ear-right", "hind-foot-left", "cotton-tail", "nose"],
    fox: ["pointed-ear-left", "pointed-ear-right", "white-tail-tip", "muzzle", "dark-stocking"],
  };
  const measured = new Map<string, THREE.Vector3>();
  for (const zone of ["village", "wilderness"] as Zone[]) {
    view.update(state, zone, 0);
    for (const root of view.group.children) {
      assert.ok(meshes(root).length <= 9, "articulation uses a bounded mesh budget");
      const names = features(root);
      for (const feature of required[root.userData.species as AnimalSpecies]) assert.ok(names.includes(feature), `${root.name} needs ${feature}`);
      const local = root.clone(); local.position.set(0, 0, 0); local.rotation.set(0, 0, 0);
      const bounds = new THREE.Box3().setFromObject(local);
      assert.ok(bounds.min.y >= -.015, `${root.name} clips ground at ${bounds.min.y}`);
      assert.ok(bounds.min.y < .07, `${root.name} feet should meet ground`);
      const size = bounds.getSize(new THREE.Vector3()); measured.set(root.userData.species, size);
      assert.ok(size.x > .2 && size.y > .4 && size.z > .4);
      for (const mesh of meshes(root)) {
        const positions = mesh.geometry.getAttribute("position");
        assert.ok(positions.count > 0 && [...positions.array].every(Number.isFinite));
        assert.ok(mesh.geometry.getAttribute("color"));
        assert.ok(mesh.material instanceof THREE.MeshStandardMaterial && mesh.material.vertexColors);
        assert.ok(mesh.geometry.boundingSphere === null || Number.isFinite(mesh.geometry.boundingSphere.radius));
      }
    }
    if (zone === "wilderness") assert.ok(view.group.children.some(root => features(root).includes("antler-left")), "the deer herd includes branched antlers");
  }
  assert.ok(measured.get("cow")!.y > measured.get("dog")!.y);
  assert.ok(measured.get("deer")!.y > measured.get("sheep")!.y);
  assert.ok(measured.get("rabbit")!.y < measured.get("deer")!.y);
  view.dispose();
});

test("actual behavior controls walk, grazing, folded rest and fleeing poses while the supplied time freezes animation", async () => {
  const view = await layer(), state = campaign();
  const subject = state.wildlife.animals["cow-1"];
  view.update(state, "village", .22);
  const root = animal(view.group, "cow"), leg = root.getObjectByName("leg-front-left")!, head = root.getObjectByName("head")!;
  const idle = pose(root), origin = root.position.toArray();
  const samples = new Map<AnimalBehavior, number[][]>();
  for (const behavior of ["walk", "approach", "graze", "rest", "flee"] as AnimalBehavior[]) {
    subject.behavior = behavior; view.update(state, "village", .22);
    samples.set(behavior, pose(root));
    assert.notDeepEqual(samples.get(behavior), idle, `${behavior} has an actual pose`);
    assert.deepEqual(root.position.toArray(), origin, "animation cannot drift the simulation root");
    if (behavior === "graze") assert.ok(head.rotation.x > .5, "grazing lowers the muzzle toward the ground");
    if (behavior === "rest") assert.ok(Math.abs(leg.rotation.x) > .8, "rest folds legs beneath the body");
  }
  assert.notDeepEqual(samples.get("walk"), samples.get("flee"));
  const frozen = pose(root); view.update(state, "village", .22); assert.deepEqual(pose(root), frozen);
  view.update(state, "village", .45); assert.notDeepEqual(pose(root), frozen);
  subject.behavior = "idle"; view.update(state, "village", .22); assert.deepEqual(pose(root), idle);
  view.dispose();
});

test("folded rest stays grounded for every authored animal without burying small species or floating deer", async () => {
  const view = await layer(), state = campaign();
  for (const saved of Object.values(state.wildlife.animals)) saved.behavior = "rest";
  for (const zone of ["village", "wilderness"] as Zone[]) {
    for (const time of [0, 1.7, 23]) {
      view.update(state, zone, time);
      for (const root of view.group.children) {
        const local = root.clone(); local.position.set(0, 0, 0);
        const bounds = new THREE.Box3().setFromObject(local);
        assert.ok(bounds.min.y >= -.015, `${root.name} rests underground at ${bounds.min.y}`);
        assert.ok(bounds.min.y < .07, `${root.name} floats while resting at ${bounds.min.y}`);
      }
    }
  }
  view.dispose();
});

test("stable IDs vary size and coats, share layer resources, and resolve replacement state without stale references", async () => {
  const view = await layer(), state = campaign(); view.update(state, "village", .4);
  const chickens = view.group.children.filter(root => root.userData.species === "chicken");
  assert.ok(new Set(chickens.map(root => root.scale.x)).size > 1);
  assert.ok(new Set(chickens.map(root => root.userData.coat)).size > 1);
  const resources = meshes(view.group);
  assert.equal(new Set(resources.map(mesh => mesh.material)).size, 1, "all coloured parts use one shared layer material");
  const replacement = structuredClone(state), id = "cow-1";
  replacement.wildlife.animals[id].x += 96; replacement.wildlife.animals[id].behavior = "rest";
  delete replacement.wildlife.animals["chicken-4"];
  view.update(replacement, "village", .4);
  assert.equal(view.group.children.length, 9);
  assert.ok(Math.abs(animal(view.group, "cow").position.x - replacement.wildlife.animals[id].x / 24) < 1e-9);
  view.update(state, "village", .4); assert.equal(view.group.children.length, 10);
  view.update(state, "village", NaN);
  assert.ok(pose(view.group).flat().every(Number.isFinite), "invalid presentation time cannot poison matrices");
  view.dispose();
});

test("each layer releases only its owned resources once, including cached off-zone models", async () => {
  const first = await layer(), second = await layer(), state = campaign();
  const owned = new Set<THREE.BufferGeometry | THREE.Material>(), other = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const zone of ["village", "wilderness"] as Zone[]) {
    first.update(state, zone, 0); second.update(state, zone, 0);
    for (const [view, into] of [[first, owned], [second, other]] as const) for (const mesh of meshes(view.group)) {
      into.add(mesh.geometry); into.add(mesh.material as THREE.Material);
    }
  }
  let disposals = 0, otherDisposals = 0;
  for (const resource of owned) { assert.ok(!other.has(resource)); resource.addEventListener("dispose", () => disposals++); }
  for (const resource of other) resource.addEventListener("dispose", () => otherDisposals++);
  first.dispose(); first.dispose(); first.update(state, "village", 10);
  assert.equal(disposals, owned.size); assert.equal(otherDisposals, 0); assert.equal(first.group.children.length, 0);
  second.update(state, "village", 10); assert.equal(second.group.children.length, 10);
  second.dispose(); assert.equal(otherDisposals, other.size);
});

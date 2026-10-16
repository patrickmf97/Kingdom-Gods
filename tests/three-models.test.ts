import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

const appearance = { skin: "#c9936f", hair: "#543b2b", eyes: "#729480", outfit: "#4d7961" };
async function create(kind: "human" | "skeleton" = "human") {
  const models = await import("../src/three/characters").catch(() => null);
  assert.ok(models, "real 3D character models must be available without a DOM or WebGL context");
  return models.createCharacterModel(appearance, kind);
}
function materialColor(object: THREE.Object3D | undefined) {
  assert.ok(object instanceof THREE.Mesh);
  assert.ok(object.material instanceof THREE.MeshStandardMaterial);
  return `#${object.material.color.getHexString()}`;
}

test("human characters preserve the saved appearance and stand with their feet at ground height", async () => {
  const model = await create();
  assert.equal(materialColor(model.group.getObjectByName("head")), appearance.skin);
  assert.equal(materialColor(model.group.getObjectByName("hair")), appearance.hair);
  assert.equal(materialColor(model.group.getObjectByName("iris-left")), appearance.eyes);
  assert.equal(materialColor(model.group.getObjectByName("tunic")), appearance.outfit);
  const bounds = new THREE.Box3().setFromObject(model.group);
  assert.ok(bounds.min.y >= -0.01 && bounds.min.y <= 0.01, `ground is ${bounds.min.y}`);
  assert.ok(bounds.max.y > 1.8 && bounds.max.y < 2.3, `height is ${bounds.max.y}`);
  const head = model.group.getObjectByName("head")!;
  assert.ok(model.group.getObjectByName("iris-left")!.position.z > head.position.z, "face looks along +Z");
  model.setEquipment(true);
  model.animate(0, false, false, false);
  const equippedBounds = new THREE.Box3().setFromObject(model.group);
  assert.ok(equippedBounds.min.y >= -0.000001, `equipped pose clips the ground at ${equippedBounds.min.y}`);
  model.dispose();
});

test("walk animation moves opposite legs, returns to rest and never moves the simulation root", async () => {
  const model = await create();
  model.group.position.set(40, 0, 60);
  const left = model.group.getObjectByName("leg-left")!;
  const right = model.group.getObjectByName("leg-right")!;
  model.animate(0.22, true, false, false);
  assert.ok(Math.abs(left.rotation.x) > 0.1);
  assert.ok(Math.abs(left.rotation.x + right.rotation.x) < 0.000001);
  assert.deepEqual(model.group.position.toArray(), [40, 0, 60]);
  model.animate(0.3, false, false, false);
  assert.equal(left.rotation.x, 0);
  assert.equal(right.rotation.x, 0);
  assert.equal(model.group.getObjectByName("arm-left")!.rotation.x, 0);
  assert.equal(model.group.getObjectByName("arm-right")!.rotation.x, 0);
  model.dispose();
});

test("equipment visibility follows actual equipment and work replaces the sword with a hand tool", async () => {
  const model = await create();
  const sword = model.group.getObjectByName("sword")!;
  const tool = model.group.getObjectByName("work-tool")!;
  assert.equal(sword.visible, false);
  model.setEquipment(true);
  assert.equal(sword.visible, true);
  model.animate(2, false, true, false);
  assert.equal(tool.visible, true);
  assert.equal(sword.visible, false);
  assert.ok(Math.abs(model.group.getObjectByName("arm-right")!.rotation.x) > 0.5);
  model.animate(3, false, false, true);
  assert.equal(tool.visible, false);
  assert.equal(sword.visible, true);
  const attackingPose = model.group.getObjectByName("arm-right")!.rotation.x;
  model.animate(3.13, false, false, true);
  assert.notEqual(model.group.getObjectByName("arm-right")!.rotation.x, attackingPose);
  model.setEquipment(false);
  assert.equal(sword.visible, false);
  model.dispose();
});

test("skeletons have a volumetric skull, exposed ribs and no human tunic or hair", async () => {
  const model = await create("skeleton");
  assert.ok(model.group.getObjectByName("skull"));
  assert.ok(model.group.getObjectByName("rib-left-0"));
  assert.ok(model.group.getObjectByName("rib-right-2"));
  assert.equal(model.group.getObjectByName("tunic"), undefined);
  assert.equal(model.group.getObjectByName("hair"), undefined);
  model.setEquipment(true);
  assert.equal(model.group.getObjectByName("sword")!.visible, true);
  model.animate(1, true, false, false);
  assert.ok(Math.abs(model.group.getObjectByName("leg-left")!.rotation.x) > 0.1);
  model.dispose();
});

test("disposing releases each owned resource once and does not dispose another actor's resources", async () => {
  const one = await create();
  const two = await create();
  const owned = new Set<THREE.BufferGeometry | THREE.Material>();
  const other = new Set<THREE.BufferGeometry | THREE.Material>();
  let otherDisposals = 0;
  let disposals = 0;
  const collect = (root: THREE.Object3D, into: Set<THREE.BufferGeometry | THREE.Material>) => root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      into.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) into.add(material);
    }
  });
  collect(one.group, owned);
  collect(two.group, other);
  for (const resource of owned) resource.addEventListener("dispose", () => disposals++);
  for (const resource of other) resource.addEventListener("dispose", () => otherDisposals++);
  one.dispose();
  one.dispose();
  assert.equal(disposals, owned.size);
  assert.equal(otherDisposals, 0);
  assert.equal(one.group.children.length, 0);
  two.dispose();
  assert.equal(otherDisposals, other.size);
});

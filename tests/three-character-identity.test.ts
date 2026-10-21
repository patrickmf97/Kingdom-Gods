import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCharacterModel } from "../src/three/characters";

const palette = { skin: "#c9936f", hair: "#543b2b", eyes: "#729480", outfit: "#4d7961" };
const roles = ["apostle", "matron", "merchant", "smith", "guard", "farmer", "baker", "miller", "innkeeper", "porter", "ranger", "fisher", "traveler", "pilgrim", "courier"];
function visibleMeshes(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = [];
  root.traverseVisible(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  return meshes;
}
function fingerprint(root: THREE.Object3D) {
  const positions: number[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) positions.push(...object.geometry.getAttribute("position").array); });
  return JSON.stringify(positions);
}
function visibleBounds(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return visibleMeshes(root).reduce((box, mesh) => box.union(new THREE.Box3().setFromObject(mesh)), new THREE.Box3());
}

test("every profession stays within articulated mesh and triangle budgets in all action states", () => {
  for (const role of [...roles, "skeleton"]) for (const variant of [0, 1, 2, 3]) for (const sex of ["female", "male"]) {
    const actor = createCharacterModel({ ...palette, role, sex, age: variant % 2 ? 70 : 22, variant }, role === "skeleton" ? "skeleton" : "human");
    let allocatedTriangles = 0;
    actor.group.traverse(object => {
      if (object instanceof THREE.Mesh) allocatedTriangles += object.geometry.getAttribute("position").count / 3;
    });
    assert.ok(allocatedTriangles <= 6500, `${role}: ${allocatedTriangles} allocated triangles including both hidden tools`);
    actor.setEquipment(true);
    for (const [moving, working, attacking] of [[false, false, false], [true, false, false], [false, true, false], [false, false, true]]) for (const time of [0, .04, .13, .22, .29, .44, .65]) {
      actor.animate(time, moving, working, attacking);
      const meshes = visibleMeshes(actor.group);
      const draws = meshes.reduce((sum, mesh) => sum + (Array.isArray(mesh.material) ? Math.max(1, mesh.geometry.groups.length) : 1), 0);
      const triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3, 0);
      assert.ok(draws <= 12, `${role}: ${draws} visible calls`);
      assert.ok(triangles <= 6500, `${role}: ${triangles} triangles`);
      assert.ok(visibleBounds(actor.group).min.y >= -0.000001, `${role} action clips ground`);
    }
    actor.dispose();
  }
});

test("professions change real geometry deterministically and age/sex/identity shape the face and hair", () => {
  const signatures = new Set<string>();
  for (const role of roles) {
    const one = createCharacterModel({ ...palette, role, variant: "stable-id" });
    const two = createCharacterModel({ ...palette, role, variant: "stable-id" });
    assert.equal(fingerprint(one.group), fingerprint(two.group));
    signatures.add(fingerprint(one.group));
    const bounds = visibleBounds(one.group);
    assert.ok(Math.abs(bounds.min.y) < 0.000001);
    assert.ok(bounds.max.y > 1.8 && bounds.max.y < 2.3);
    one.dispose(); two.dispose();
  }
  assert.equal(signatures.size, roles.length, "roles must have designed geometry beyond palette changes");
  const actors = [
    createCharacterModel({ ...palette, sex: "male", age: 22, variant: "a" }),
    createCharacterModel({ ...palette, sex: "female", age: 22, variant: "a" }),
    createCharacterModel({ ...palette, sex: "male", age: 78, variant: "a" }),
    createCharacterModel({ ...palette, sex: "male", age: 22, variant: "b" }),
  ];
  assert.equal(new Set(actors.map(actor => fingerprint(actor.group))).size, actors.length);
  actors.forEach(actor => actor.dispose());
});

test("batched surfaces use owned UV texture detail and dispose without touching world attachments", () => {
  const one = createCharacterModel({ ...palette, role: "ranger" });
  const two = createCharacterModel(palette);
  const material = visibleMeshes(one.group)[0].material as THREE.MeshStandardMaterial;
  assert.ok(material.vertexColors, "saved palette is baked into merged vertices");
  assert.ok(material.map instanceof THREE.DataTexture, "procedural atlas adds cloth/hair/leather surface detail");
  const bytes = material.map.image.data as Uint8Array;
  assert.ok(new Set(bytes).size > 4, "atlas has meaningful tonal detail");
  for (const mesh of visibleMeshes(one.group)) {
    const uv = mesh.geometry.getAttribute("uv");
    assert.ok(uv && uv.count === mesh.geometry.getAttribute("position").count);
    assert.ok(mesh.geometry.getAttribute("color"));
  }
  assert.notEqual(material.map, (visibleMeshes(two.group)[0].material as THREE.MeshStandardMaterial).map);
  let texturesDisposed = 0, worldDisposed = 0;
  material.map.addEventListener("dispose", () => texturesDisposed++);
  const world = new THREE.Mesh(new THREE.CircleGeometry(), new THREE.MeshBasicMaterial());
  world.geometry.addEventListener("dispose", () => worldDisposed++);
  (world.material as THREE.Material).addEventListener("dispose", () => worldDisposed++);
  one.group.add(world);
  one.dispose(); one.dispose(); one.setEquipment(true); one.animate(3, true, true, true);
  assert.equal(texturesDisposed, 1);
  assert.equal(worldDisposed, 0);
  two.dispose(); world.geometry.dispose(); (world.material as THREE.Material).dispose();
});

test("tailored garment and face planes have outward normals for front-face rendering", () => {
  const actor = createCharacterModel(palette);
  for (const part of ["tunic", "head"]) {
    let sideVertices = 0;
    actor.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const range = object.geometry.userData.parts?.[part];
      if (!range) return;
      const p = object.geometry.getAttribute("position"), n = object.geometry.getAttribute("normal");
      for (let i = range.start; i < range.start + range.count; i++) {
        if (Math.abs(n.getY(i)) > .99) continue;
        assert.ok(p.getX(i) * n.getX(i) + p.getZ(i) * n.getZ(i) > 0, `${part} has an inward plane`);
        sideVertices++;
      }
    });
    assert.ok(sideVertices > 30);
  }
  actor.dispose();
});

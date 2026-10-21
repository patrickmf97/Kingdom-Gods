import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createCharacterModel } from "../src/three/characters";

const appearance = { skin: "#c9936f", hair: "#543b2b", eyes: "#729480", outfit: "#4d7961", variant: "artist-sample" };
function part(root: THREE.Object3D, name: string) {
  let result: { mesh: THREE.Mesh; range: { start: number; count: number } } | undefined;
  root.traverse(object => {
    if (object instanceof THREE.Mesh && object.geometry.userData.parts?.[name])
      result = { mesh: object, range: object.geometry.userData.parts[name] };
  });
  assert.ok(result, `real rendered ${name}`);
  return result;
}
function bounds(root: THREE.Object3D, name: string, world = false) {
  const { mesh, range } = part(root, name), position = mesh.geometry.getAttribute("position"), box = new THREE.Box3();
  if (world) root.updateMatrixWorld(true);
  for (let i = range.start; i < range.start + range.count; i++) {
    const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
    box.expandByPoint(world ? vertex.applyMatrix4(mesh.matrixWorld) : vertex);
  }
  return box;
}

test("refined bodies use natural stylized head scale and soft shared surface normals", () => {
  const actor = createCharacterModel(appearance), head = bounds(actor.group, "head");
  const height = new THREE.Box3().setFromObject(actor.group).max.y;
  assert.ok(height / (head.max.y - head.min.y) >= 5.3, "head proportion should be near five and a half, not four heads");
  const { mesh, range } = part(actor.group, "head"), normals = mesh.geometry.getAttribute("normal");
  let smooth = 0;
  for (let i = range.start; i < range.start + range.count - 2; i += 3) {
    const first = new THREE.Vector3().fromBufferAttribute(normals, i), next = new THREE.Vector3().fromBufferAttribute(normals, i + 1);
    if (first.distanceTo(next) > .015) smooth++;
  }
  assert.ok(smooth > 20, "normals interpolate around cheeks instead of one flat normal per triangle");
  actor.dispose();
});

test("hair is sculpted as curved locks and palms have distinct thumbs", () => {
  const actor = createCharacterModel(appearance);
  assert.ok(actor.group.getObjectByName("hair-lock-0"));
  assert.ok(actor.group.getObjectByName("thumb-left"));
  assert.ok(actor.group.getObjectByName("thumb-right"));
  const eyes = bounds(actor.group, "eye-white-left");
  assert.ok(eyes.max.z - eyes.min.z < .02, "eyes sit close to the face");
  const palm = bounds(actor.group, "hand-left");
  assert.ok(palm.max.y - palm.min.y >= .185, "palms have a proportionate length instead of tiny beads");
  actor.dispose();
});

test("a young founder has no adult beard and curved surfaces face outward", () => {
  const actor = createCharacterModel({ ...appearance, age: 16, variant: 3 });
  assert.equal(actor.group.getObjectByName("beard"), undefined);
  for (const name of ["hair", "hair-lock-0", "head", "tunic"]) {
    const { mesh, range } = part(actor.group, name), position = mesh.geometry.getAttribute("position"), normals = mesh.geometry.getAttribute("normal");
    let checked = 0;
    for (let i = range.start; i < range.start + range.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, i), b = new THREE.Vector3().fromBufferAttribute(position, i + 1), c = new THREE.Vector3().fromBufferAttribute(position, i + 2);
      const cross = b.sub(a).cross(c.sub(a));
      if (cross.lengthSq() < 1e-12) continue;
      const normal = new THREE.Vector3().fromBufferAttribute(normals, i).add(new THREE.Vector3().fromBufferAttribute(normals, i + 1)).add(new THREE.Vector3().fromBufferAttribute(normals, i + 2));
      assert.ok(cross.dot(normal) > 0, `${name} must not disappear with front-face rendering`);
      checked++;
    }
    assert.ok(checked > 20);
  }
  actor.dispose();
});

test("helmets contain the scalp without swept locks or long hairstyles piercing metal", () => {
  for (let variant = 0; variant < 8; variant++) {
    const actor = createCharacterModel({ ...appearance, role: "guard", variant });
    const hair = bounds(actor.group, "hair"), helmet = bounds(actor.group, "helmet");
    assert.ok(helmet.max.y > hair.max.y && helmet.min.z < hair.min.z);
    assert.equal(actor.group.getObjectByName("hair-lock-0"), undefined);
    assert.equal(actor.group.getObjectByName("hair-bun"), undefined);
    assert.equal(actor.group.getObjectByName("braid-0"), undefined);
    assert.equal(actor.group.getObjectByName("hair-wave-1"), undefined);
    actor.dispose();
  }
});

test("walk and run follow travel speed while pause and speed changes preserve the gait phase", () => {
  const walker = createCharacterModel(appearance), runner = createCharacterModel(appearance);
  const hip = (model: typeof walker) => model.group.getObjectByName("leg-left")!.rotation.x;
  walker.animate(0, true, false, false, 1.8);
  runner.animate(0, true, false, false, 7);
  for (let frame = 1; frame <= 10; frame++) {
    walker.animate(frame / 60, true, false, false, 1.8);
    runner.animate(frame / 60, true, false, false, 7);
  }
  assert.ok(Math.abs(hip(walker) - hip(runner)) > .2, "walking and running have different pace and stride");
  const pausedHip = hip(walker);
  walker.animate(10 / 60, true, false, false, 1.8);
  assert.equal(hip(walker), pausedHip, "a paused clock does not advance a step");
  walker.animate(10 / 60, true, false, false, 7);
  assert.ok(Math.abs(hip(walker) / .59 - pausedHip / .32) < 1e-10, "changing speed changes stride without jumping to a new phase");
  for (const speed of [1.8, 7, NaN, Infinity]) {
    for (let frame = 11; frame <= 35; frame++) {
      walker.animate(frame / 60, true, false, false, speed);
      const left = bounds(walker.group, "boot-left", true), right = bounds(walker.group, "boot-right", true);
      assert.ok(Number.isFinite(hip(walker)));
      assert.ok(left.min.y >= -.001 && right.min.y >= -.001, "neither boot penetrates the ground");
      assert.ok(Math.min(left.min.y, right.min.y) < .04, "a supporting foot remains close to the ground");
    }
  }
  walker.dispose(); runner.dispose();
});

test("night and indoor character fill are independent per actor and stop changing after disposal", () => {
  const one = createCharacterModel(appearance), two = createCharacterModel(appearance);
  const material = (model: typeof one) => part(model.group, "head").mesh.material as THREE.MeshStandardMaterial;
  const uniforms = (model: typeof one) => {
    const shader = { uniforms: {} as Record<string, { value: number }>, fragmentShader: "#include <lights_fragment_end>" };
    material(model).onBeforeCompile(shader as never, {} as THREE.WebGLRenderer);
    return shader.uniforms;
  };
  const first = uniforms(one), second = uniforms(two);
  one.setLighting(0, false);
  assert.equal(first.uCharacterFillStrength.value, .18);
  assert.equal(second.uCharacterFillStrength.value, .025);
  two.setLighting(0, true);
  assert.equal(second.uCharacterFillStrength.value, .06);
  one.dispose(); one.setLighting(1, false);
  assert.equal(first.uCharacterFillStrength.value, .18);
  two.dispose();
});

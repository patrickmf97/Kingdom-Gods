import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRiggedCharacter, riggedCharactersReady, wardrobe } from "../src/three/rigged-characters";

const base = { skin: "#c9936f", hair: "#543b2b", eyes: "#729480", outfit: "#4d7961" };

test("each trade dresses its people, and hats never stack with hoods or helmets", () => {
  const guard = wardrobe({ ...base, role: "guard", variant: "g" });
  assert.ok(guard.visible.has("helmet") && guard.visible.has("pauldrons") && guard.visible.has("tabard"));
  assert.ok(![...guard.visible].some(item => item.startsWith("hair-")), "helmets cover the hair");
  const matron = wardrobe({ ...base, role: "matron", sex: "female", age: 64 });
  assert.ok(matron.visible.has("robe") && matron.visible.has("hood") && matron.visible.has("cape"));
  assert.ok(!matron.visible.has("tunic") && !matron.visible.has("beard"));
  const baker = wardrobe({ ...base, role: "baker", sex: "female" });
  assert.ok(baker.visible.has("apron") && baker.visible.has("cap") && !baker.visible.has("hat"));
  const farmer = wardrobe({ ...base, role: "farmer", variant: "x" });
  assert.ok(farmer.visible.has("hat"));
  for (const role of ["apostle", "smith", "merchant", "porter", "ranger", "pilgrim", "courier", "fisher", "miller"]) {
    const look = wardrobe({ ...base, role, variant: role });
    assert.equal(["hat", "cap", "hood", "helmet"].filter(item => look.visible.has(item)).length <= 1, true, role);
    assert.ok(look.visible.has("body") && look.visible.has("boots"));
  }
});

test("young founders never get a beard and the choice is stable per person", () => {
  for (let i = 0; i < 30; i++) {
    assert.equal(wardrobe({ ...base, age: 16, variant: i }).visible.has("beard"), false);
    const once = [...wardrobe({ ...base, age: 40, variant: i }).visible].sort().join();
    assert.equal([...wardrobe({ ...base, age: 40, variant: i }).visible].sort().join(), once);
  }
});

test("without loaded art the procedural figure is used", () => {
  assert.equal(riggedCharactersReady(), false);
  assert.equal(createRiggedCharacter(base), null);
});

test("both character files carry the six actions and every garment", () => {
  for (const sex of ["male", "female"]) {
    const data = readFileSync(new URL(`../public/models/characters-${sex}.glb`, import.meta.url));
    const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString("utf8"));
    assert.deepEqual(json.animations.map((a: { name: string }) => a.name).sort(), ["attack", "idle", "run", "talk", "walk", "work"]);
    const names = new Set(json.nodes.map((n: { name: string }) => n.name));
    for (const garment of ["body", "head", "tunic", "robe", "trousers", "boots", "hair-short", "hair-long", "hair-bun", "hair-braid", "hood", "helmet", "hat", "cap", "apron", "cape", "sword", "tool"])
      assert.ok(names.has(`${garment}-${sex}`), `${garment}-${sex}`);
    const materials = new Set(json.materials.map((m: { name: string }) => m.name));
    for (const tinted of ["skin", "hair", "eyes", "outfit", "trousers"]) assert.ok(materials.has(tinted), tinted);
  }
});

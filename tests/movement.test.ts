import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "../src/simulation";
import { saveGame } from "../src/persistence";

function game() {
  const g = new GameStore();
  g.create({ name: "Rowan", surname: "Valen", sex: "male", skin: "#d3a17b", hair: "#493327", eyes: "#7ca078", outfit: "#6d8866", blessing: "vigor" });
  g.choose("leave-orphanage");
  g.state.apostle.x = 450; g.state.apostle.y = 790;
  g.interact("exit");
  return g;
}

test("local movement cannot tunnel north through the market counter during a dodge", () => {
  const g = game();
  Object.assign(g.state.apostle, { x: 1280, y: 825 });
  g.dodge();
  g.move(0, -1, 0.36);
  assert.ok(g.state.apostle.y >= 819, "feet must stop south of the counter including their radius");
});

test("movement slides along a wall instead of entering or freezing diagonally", () => {
  const g = game();
  Object.assign(g.state.apostle, { x: 1280, y: 825 });
  g.move(1, -1, 0.3);
  assert.ok(g.state.apostle.y >= 819);
  assert.ok(g.state.apostle.x > 1300, "unblocked sideways movement should continue");
});

test("Lina walks to evening meetings without crossing Mira's home", () => {
  const g = game();
  g.state.minutes = 18 * 60;
  g.state.timeScale = 0.01;
  const lina = g.state.npcs.find(n => n.id === "farmer")!;
  for (let frame = 0; frame < 500; frame++) {
    g.tick(0.1);
    assert.ok(!(lina.x > 1563 && lina.x < 1717 && lina.y > 1004 && lina.y < 1090), `Lina entered a house at ${lina.x},${lina.y}`);
  }
  assert.ok(lina.x < 1300, "routine should still reach the evening gathering");
});

test("evening NPC meetings preserve personal space", () => {
  const g = game();
  g.state.minutes = 18 * 60;
  g.state.timeScale = 0.01;
  for (let frame = 0; frame < 1600; frame++) g.tick(0.1);
  const residents = g.state.npcs.filter(n => n.id !== "matron");
  for (let i = 0; i < residents.length; i++) for (let j = i + 1; j < residents.length; j++) {
    assert.ok(Math.hypot(residents[i].x - residents[j].x, residents[i].y - residents[j].y) >= 65, "meetings should not put all labels and bodies in the same line");
  }
});

test("the built homestead remains physically interactive at its new doorway", () => {
  const g = game();
  g.state.property.owned = true;
  g.state.property.building = true;
  Object.assign(g.state.apostle, { x: 2090, y: 815 });
  assert.equal(g.getNearest()?.label, "Porta da casa da linhagem");
  assert.ok(g.interact("property"));
  g.state.economy.condition = 50;
  g.state.inventory.wood = 2;
  g.state.inventory.stone = 1;
  g.act("repair");
  assert.equal(g.state.economy.condition, 75);
});

test("loading an older position inside a new wall recovers only position and retains the campaign", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try {
    const before = game();
    Object.assign(before.state.apostle, { x: 1280, y: 800 });
    before.state.gold = 237;
    before.state.inventory.wheat = 9;
    const snapshot = JSON.parse(JSON.stringify(before.state));
    await saveGame(before.state);
    const after = new GameStore();
    assert.equal(await after.load(), true);
    assert.ok(Math.hypot(after.state.apostle.x - 1280, after.state.apostle.y - 800) < 100);
    assert.ok(after.state.apostle.y >= 819 || after.state.apostle.y <= 751);
    assert.deepEqual(after.state.inventory, snapshot.inventory);
    assert.equal(after.state.gold, 237);
    assert.deepEqual(after.state.apostle.memories, snapshot.apostle.memories);
    assert.deepEqual(after.state.family, snapshot.family);
    assert.deepEqual(after.state.economy, snapshot.economy);
    assert.equal(after.state.day, snapshot.day);
    assert.equal(after.state.minutes, snapshot.minutes);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

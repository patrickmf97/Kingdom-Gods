import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "../src/simulation";
import { validateState } from "../src/persistence";
import { restPreview, formatRestPreview } from "../src/rest";

function game() {
  const g = new GameStore();
  g.create({ name: "Aelia", surname: "Valen", sex: "female", skin: "#d3a17b", hair: "#493327", eyes: "#7ca078", outfit: "#6d8866", blessing: "vigor" });
  g.choose("leave-orphanage");
  g.state.zone = "farmhouse-room";
  Object.assign(g.state.apostle, { x: 630, y: 350, hp: 30, stamina: 10 });
  Object.assign(g.state.property, { owned: true, building: true });
  g.state.economy.condition = 100;
  g.state.inventory.bread = 5;
  g.state.inventory.wheat = 0;
  g.state.gold = 100;
  g.state.minutes = 600;
  return g;
}

test("rest preview reports the next date and current provisions without advancing the campaign", () => {
  const g = game(); g.state.minutes = 1410;
  const before = structuredClone(g.state);
  assert.deepEqual(restPreview(g.state, 8), { day: 2, minutes: 450, rollovers: 1, bread: 1, wheat: 0, missingMeals: 0 });
  assert.match(formatRestPreview(g.state, 8), /07:30/);
  assert.deepEqual(g.state, before);
  g.state.inventory.bread = 0;
  assert.equal(restPreview(g.state, 8).missingMeals, 1);
});

test("the actual home bed rests eight hours and applies one daily meal and property tax", () => {
  const g = game(); g.state.minutes = 1410;
  const dialogue = g.interact("home-bed");
  assert.ok(dialogue?.options.some(option => option.action === "home-rest" && !option.disabled));
  g.act("home-rest");
  assert.equal(g.state.day, 2); assert.equal(g.state.minutes, 450);
  assert.equal(g.state.inventory.bread, 4); assert.equal(g.state.gold, 98);
  assert.equal(g.state.economy.condition, 97);
  assert.equal(g.state.apostle.stamina, g.state.apostle.maxStamina);
  assert.ok(validateState(g.state));
});

test("home rest rejects remote coordinates, another room, missing ownership and a damaged home", () => {
  for (const setup of [
    (g: GameStore) => { g.state.zone = "inn-room"; },
    (g: GameStore) => { g.state.apostle.x = 200; g.state.apostle.y = 680; },
    (g: GameStore) => { g.state.property.owned = false; },
    (g: GameStore) => { g.state.property.building = false; },
    (g: GameStore) => { g.state.economy.condition = 24; },
  ]) {
    const g = game(); setup(g);
    const before = { minutes: g.state.minutes, gold: g.state.gold, hp: g.state.apostle.hp, stamina: g.state.apostle.stamina };
    g.act("home-rest");
    assert.deepEqual({ minutes: g.state.minutes, gold: g.state.gold, hp: g.state.apostle.hp, stamina: g.state.apostle.stamina }, before);
  }
});

test("inn hospitality transfers eight crowns to its real till with one ledger entry", () => {
  const g = game(); g.state.zone = "inn-room";
  Object.assign(g.state.apostle, { x: 235, y: 330 });
  const till = g.state.merchantGold;
  const dialogue = g.interact("inn");
  assert.match(dialogue!.text, /18:00/);
  g.act("rest");
  assert.equal(g.state.gold, 92); assert.equal(g.state.merchantGold, till + 8);
  assert.equal(g.state.minutes, 1080);
  const entries = g.state.economy.ledger.filter(entry => entry.type === "hospitality");
  assert.equal(entries.length, 1); assert.equal(entries[0].goldDelta, -8);
  assert.equal(g.state.apostle.hp, g.state.apostle.maxHp);
});

test("an inn whose till cannot receive the payment leaves the purse and clock unchanged", () => {
  const g = game(); g.state.zone = "inn-room";
  Object.assign(g.state.apostle, { x: 235, y: 330 });
  g.state.merchantGold = Number.MAX_SAFE_INTEGER;
  g.act("rest");
  assert.equal(g.state.gold, 100); assert.equal(g.state.minutes, 600);
  assert.equal(g.state.merchantGold, Number.MAX_SAFE_INTEGER);
});

test("death during a rest stops at midnight and never heals or completes the remaining hours", () => {
  const g = game(); g.state.day = 360; g.state.minutes = 1410;
  g.state.apostle.age = 89; g.state.apostle.birthDay = 1 - 89 * 360;
  g.act("home-rest");
  assert.equal(g.state.phase, "dead"); assert.equal(g.state.day, 361);
  assert.equal(g.state.minutes, 0); assert.equal(g.state.apostle.hp, 0);
  assert.equal(g.state.apostle.alive, false);
  assert.ok(validateState(g.state));
});

test("a shelter interrupted by death consumes its firewood but never reports a completed rest", () => {
  const g = game(); g.state.zone = "wilderness";
  Object.assign(g.state.apostle, { x: 1100, y: 1740 });
  g.state.property.owned = false; g.state.property.building = false;
  g.state.gold = 300; g.act("estate-buy:oak-hollow");
  g.state.inventory.wood = 10; g.state.inventory.stone = 4;
  g.act("estate-build:oak-hollow:shelter");
  const wood = g.state.inventory.wood;
  g.state.day = 360; g.state.minutes = 1410;
  g.state.apostle.age = 89; g.state.apostle.birthDay = 1 - 89 * 360;
  g.act("estate-rest:oak-hollow");
  assert.equal(g.state.phase, "dead"); assert.equal(g.state.minutes, 0);
  assert.equal(g.state.inventory.wood, wood - 1);
  assert.equal(g.state.messages.some(message => /fogueira aqueceu o abrigo/.test(message.text)), false);
  assert.ok(validateState(g.state));
});

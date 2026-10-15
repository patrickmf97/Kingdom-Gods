import test from "node:test";
import assert from "node:assert/strict";
import { GameStore } from "../src/simulation";
import { validateState } from "../src/persistence";
import { isWalkable } from "../src/navigation";

function game() {
  const g = new GameStore();
  g.create({ name: "Aelia", surname: "Valen", sex: "female", skin: "#d3a17b", hair: "#493327", eyes: "#7ca078", outfit: "#6d8866", blessing: "vigor" });
  g.choose("leave-orphanage");
  Object.assign(g.state.apostle, { x: 450, y: 790 });
  g.interact("exit");
  return g;
}

test("estate interactions require a physical sign and construction persists as a collision", () => {
  const g = game();
  g.state.gold = 300;
  g.act("estate-buy:oak-hollow");
  assert.equal(g.state.territory.parcels["oak-hollow"].owned, false);
  g.state.zone = "wilderness";
  Object.assign(g.state.apostle, { x: 1100, y: 1740 });
  assert.equal(g.interact("oak-hollow")?.options[0].action, "open-property");
  g.act("estate-buy:oak-hollow");
  g.state.inventory.wood = 12;
  g.state.inventory.stone = 8;
  g.act("estate-build:oak-hollow:warehouse");
  assert.equal(g.state.territory.parcels["oak-hollow"].building, "warehouse");
  assert.equal(isWalkable({ x: 1100, y: 1640 }, { zone: "wilderness", building: false, estates: ["oak-hollow"] }), false);
  g.act("estate-deposit:oak-hollow:wood:1");
  assert.equal(g.state.territory.parcels["oak-hollow"].storage.wood, 1);
  assert.ok(validateState(g.state));
});

test("shelter rest advances the actual calendar, charges taxes once and cannot become free time", () => {
  const g = game();
  g.state.gold = 300;
  g.state.zone = "wilderness";
  Object.assign(g.state.apostle, { x: 1100, y: 1740 });
  g.act("estate-buy:oak-hollow");
  g.state.inventory.wood = 10;
  g.state.inventory.stone = 4;
  g.act("estate-build:oak-hollow:shelter");
  g.state.minutes = 1380;
  g.state.apostle.hp = 50;
  const gold = g.state.gold;
  g.act("estate-rest:oak-hollow");
  assert.equal(g.state.day, 2);
  assert.equal(g.state.minutes, 180);
  assert.equal(g.state.gold, gold - 1);
  assert.equal(g.state.territory.lastTaxDay, 2);
  assert.equal(g.state.territory.parcels["oak-hollow"].condition, 98);
  assert.ok(g.state.apostle.hp > 50);
  assert.ok(validateState(g.state));
});

test("family succession preserves land, warehouse goods and recognition while enforcing regency", () => {
  const g = game();
  const mira = g.state.npcs.find(npc => npc.id === "mira")!;
  mira.relation = 100; mira.trust = 100;
  Object.assign(g.state.apostle, { x: mira.x, y: mira.y });
  g.act("marry:mira");
  g.state.day = 17;
  g.state.property.owned = true; g.state.property.building = true;
  Object.assign(g.state.apostle, { x: 2090, y: 815 });
  g.act("child");
  const child = g.state.family.find(person => person.parents.includes(g.state.apostle.id))!;
  g.state.gold = 300;
  g.state.zone = "wilderness";
  Object.assign(g.state.apostle, { x: 1100, y: 1740 });
  g.act("estate-buy:oak-hollow");
  g.state.inventory.wood = 12; g.state.inventory.stone = 8;
  g.act("estate-build:oak-hollow:warehouse");
  g.act("estate-deposit:oak-hollow:wood:1");
  const before = structuredClone(g.state.territory);
  g.damage(g.state.apostle.maxHp);
  g.act(`succeed:${child.id}`);
  assert.deepEqual(g.state.territory, before);
  assert.equal(g.state.apostle.id, child.id);
  g.state.zone = "wilderness";
  Object.assign(g.state.apostle, { x: 1880, y: 1370 });
  g.act("estate-buy:stone-rise");
  assert.equal(g.state.territory.parcels["stone-rise"].owned, false);
  assert.ok(validateState(g.state));
});

test("earned recognition grants a real second-land right and an adult spouse inherits the charter", () => {
  const g = game();
  const mira = g.state.npcs.find(npc => npc.id === "mira")!;
  mira.relation = 100; mira.trust = 100;
  Object.assign(g.state.apostle, { x: mira.x, y: mira.y });
  g.act("marry:mira");
  // Fixture: two already completed services and the original built home.
  g.state.frontier.jobs[0].status = "claimed";
  g.state.frontier.jobs[1].status = "claimed";
  g.state.property.owned = true; g.state.property.building = true;
  g.state.gold = 400;
  g.state.zone = "wilderness";
  Object.assign(g.state.apostle, { x: 1100, y: 1740 });
  g.act("estate-buy:oak-hollow");
  g.state.inventory.wood = 12; g.state.inventory.stone = 8;
  g.act("estate-build:oak-hollow:warehouse");
  assert.equal(g.state.territory.influence, 12);
  Object.assign(g.state.apostle, { x: 1880, y: 1370 });
  g.act("estate-buy:stone-rise");
  assert.equal(g.state.territory.parcels["stone-rise"].owned, false);
  g.state.zone = "village";
  Object.assign(g.state.apostle, { x: 1390, y: 1120 });
  const before = g.state.gold + g.state.economy.civicFunds;
  g.act("realm-charter");
  assert.equal(g.state.territory.charter, true);
  assert.equal(g.state.gold + g.state.economy.civicFunds, before);
  g.state.zone = "wilderness";
  Object.assign(g.state.apostle, { x: 1880, y: 1370 });
  g.act("estate-buy:stone-rise");
  assert.equal(g.state.territory.parcels["stone-rise"].owned, true);
  g.damage(g.state.apostle.maxHp);
  g.act("succeed:mira");
  assert.equal(g.state.apostle.title, "Guardião de Alvor");
  assert.equal(g.state.territory.charter, true);
  assert.ok(validateState(g.state));
});

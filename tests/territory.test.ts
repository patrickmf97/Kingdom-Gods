import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import { ITEMS, OBJECTS } from "../src/data";
import { carriedWeight, carryingCapacity } from "../src/frontier";
import type { EstateId, ExpansionHooks, GameState, ItemId } from "../src/types";

async function fixture() {
  const rules = await import("../src/territory").catch(() => null);
  assert.ok(rules, "territory rules must exist");
  const data = await import("../src/territory-data");
  const state = initialState() as GameState;
  state.territory = rules.createTerritoryState(state.day);
  state.phase = "playing";
  state.zone = "wilderness";
  state.gold = 500;
  const messages: string[] = [];
  const rest: [number, number][] = [];
  const hooks: ExpansionHooks = {
    message: (text) => messages.push(text),
    remember: (title, text, emotion, intensity = 50) => state.apostle.memories.push({ id: `${title}-${state.day}`, day: state.day, title, text, emotion, intensity }),
    practice: (skill, amount) => { state.apostle.skills[skill] = (state.apostle.skills[skill] || 0) + amount; },
    nearObject: () => true,
    nearNpc: () => false,
    rest: (hours, healing) => rest.push([hours, healing]),
  };
  const at = (id: EstateId | "sign") => {
    const point = id === "sign" ? OBJECTS.find(object => object.id === id)! : data.estateObject(id);
    state.zone = id === "sign" ? "village" : "wilderness";
    state.apostle.x = point.x;
    state.apostle.y = point.y;
  };
  const buy = (id: EstateId = "oak-hollow") => {
    at(id);
    rules.executeTerritoryAction(state, `estate-buy:${id}`, hooks);
  };
  const materials = () => {
    state.inventory.wood = 20;
    state.inventory.stone = 10;
    state.apostle.stamina = 100;
  };
  const money = () => state.gold + state.merchantGold + state.economy.civicFunds + state.frontier.escrow;
  return { rules, data, state, hooks, messages, rest, at, buy, materials, money };
}

test("new territory state has two finite Auren plots and independent empty stores", async () => {
  const f = await fixture();
  assert.equal(f.data.ESTATE_DEFS.length, 2);
  assert.deepEqual(f.data.ESTATE_DEFS.map(def => [def.id, def.cost, def.kingdom]), [["oak-hollow", 80, "Auren"], ["stone-rise", 120, "Auren"]]);
  assert.equal(f.state.territory.lastTaxDay, 1);
  assert.equal(f.state.territory.influence, 0);
  assert.equal(f.state.territory.charter, false);
  assert.equal(f.state.territory.arrears, 0);
  assert.notEqual(f.state.territory.parcels["oak-hollow"].storage, f.state.territory.parcels["stone-rise"].storage);
  assert.deepEqual(Object.values(f.state.territory.parcels).map(plot => [plot.owned, plot.building, plot.condition]), [[false, "none", 0], [false, "none", 0]]);
});

test("legal purchases require physical land, majority, money and conserve finite currency", async () => {
  const f = await fixture();
  const total = f.money();
  f.rules.executeTerritoryAction(f.state, "estate-buy:oak-hollow", f.hooks);
  assert.equal(f.state.territory.parcels["oak-hollow"].owned, false);
  f.at("oak-hollow");
  f.state.zone = "mine";
  f.rules.executeTerritoryAction(f.state, "estate-buy:oak-hollow", f.hooks);
  assert.equal(f.state.gold, 500);
  f.at("oak-hollow");
  f.state.apostle.x += 141;
  f.rules.executeTerritoryAction(f.state, "estate-buy:oak-hollow", f.hooks);
  assert.equal(f.state.gold, 500);
  f.at("oak-hollow");
  f.state.apostle.age = 15;
  f.rules.executeTerritoryAction(f.state, "estate-buy:oak-hollow", f.hooks);
  assert.equal(f.state.gold, 500);
  f.state.apostle.age = 16;
  f.state.gold = 79;
  f.rules.executeTerritoryAction(f.state, "estate-buy:oak-hollow", f.hooks);
  assert.equal(f.state.territory.parcels["oak-hollow"].owned, false);
  f.state.gold = 500;
  f.buy();
  assert.equal(f.state.gold, 420);
  assert.equal(f.state.territory.parcels["oak-hollow"].registeredDay, 1);
  assert.equal(f.money(), total);
  f.buy();
  assert.equal(f.state.gold, 420, "ownership cannot be purchased twice");
});

test("base land limit is one extra plot and the earned charter opens the second", async () => {
  const f = await fixture();
  f.buy();
  f.buy("stone-rise");
  assert.equal(f.state.territory.parcels["stone-rise"].owned, false);
  for (const job of f.state.frontier.jobs) job.status = "claimed";
  f.rules.syncTerritoryDeeds(f.state);
  assert.equal(f.state.territory.influence, 12);
  f.at("sign");
  const total = f.money();
  f.rules.executeTerritoryAction(f.state, "realm-charter", f.hooks);
  assert.equal(f.state.territory.charter, true);
  assert.equal(f.state.apostle.title, "Guardião de Alvor");
  assert.equal(f.state.gold, 360);
  assert.equal(f.money(), total);
  f.rules.executeTerritoryAction(f.state, "realm-charter", f.hooks);
  assert.equal(f.state.gold, 360);
  f.buy("stone-rise");
  assert.equal(f.state.territory.parcels["stone-rise"].owned, true);
  assert.equal(f.state.gold, 240);
});

test("charter rejects remote petitions, missing land, insufficient service, youth and debt", async () => {
  const f = await fixture();
  for (const job of f.state.frontier.jobs) job.status = "claimed";
  f.rules.syncTerritoryDeeds(f.state);
  f.at("sign");
  f.rules.executeTerritoryAction(f.state, "realm-charter", f.hooks);
  assert.equal(f.state.territory.charter, false, "service alone grants no land rights");
  f.state.property.owned = true;
  f.state.zone = "wilderness";
  f.rules.executeTerritoryAction(f.state, "realm-charter", f.hooks);
  assert.equal(f.state.territory.charter, false);
  f.at("sign");
  f.state.apostle.age = 15;
  f.rules.executeTerritoryAction(f.state, "realm-charter", f.hooks);
  assert.equal(f.state.territory.charter, false);
  f.state.apostle.age = 16;
  f.state.territory.arrears = 1;
  f.rules.executeTerritoryAction(f.state, "realm-charter", f.hooks);
  assert.equal(f.state.territory.charter, false);
  f.state.territory.arrears = 0;
  f.state.territory.influence = 0;
  f.state.territory.deeds = [];
  for (const job of f.state.frontier.jobs) job.status = "available";
  f.rules.executeTerritoryAction(f.state, "realm-charter", f.hooks);
  assert.equal(f.state.territory.charter, false);
});

test("buildings consume real materials and energy, use a fixed footprint and cannot replace one another", async () => {
  const f = await fixture();
  f.buy();
  f.materials();
  const plot = f.state.territory.parcels["oak-hollow"];
  f.state.apostle.stamina = 9;
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:warehouse", f.hooks);
  assert.equal(plot.building, "none");
  f.state.apostle.stamina = 100;
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:warehouse", f.hooks);
  assert.equal(plot.building, "warehouse");
  assert.equal(plot.condition, 100);
  assert.equal(f.state.inventory.wood, 12);
  assert.equal(f.state.inventory.stone, 6);
  assert.equal(f.state.apostle.stamina, 90);
  assert.ok(f.state.apostle.skills.building > 0);
  assert.deepEqual(f.data.estateBuildings(f.state), ["oak-hollow"]);
  const solid = f.data.estateSolid("oak-hollow");
  const object = f.data.estateObject("oak-hollow");
  assert.deepEqual(solid, { left: object.x - 60, right: object.x + 60, top: object.y - 130, bottom: object.y - 65 });
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:shelter", f.hooks);
  assert.equal(plot.building, "warehouse");
  assert.equal(f.state.inventory.wood, 12);
});

test("storage transfers only permitted exact quantities and enforces both weight capacities", async () => {
  const f = await fixture();
  f.buy();
  f.materials();
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:warehouse", f.hooks);
  const plot = f.state.territory.parcels["oak-hollow"];
  f.state.inventory.wood = 60;
  for (let i = 0; i < 12; i++) f.rules.executeTerritoryAction(f.state, "estate-deposit:oak-hollow:wood:5", f.hooks);
  assert.equal(plot.storage.wood, 60);
  assert.equal(f.state.inventory.wood, 0);
  f.state.inventory.bread = 1;
  f.rules.executeTerritoryAction(f.state, "estate-deposit:oak-hollow:bread:1", f.hooks);
  assert.equal(f.state.inventory.bread, 1, "120 weight store is full");
  f.state.inventory.wood = 34;
  assert.ok(carriedWeight(f.state) + 10 > carryingCapacity(f.state));
  f.rules.executeTerritoryAction(f.state, "estate-withdraw:oak-hollow:wood:5", f.hooks);
  assert.equal(plot.storage.wood, 60);
  f.state.inventory = Object.fromEntries(Object.keys(ITEMS).map(id => [id, 0])) as Record<ItemId, number>;
  f.rules.executeTerritoryAction(f.state, "estate-withdraw:oak-hollow:wood:5", f.hooks);
  assert.equal(plot.storage.wood, 55);
  assert.equal(f.state.inventory.wood, 5);
  const before = JSON.stringify([plot.storage, f.state.inventory]);
  for (const suffix of ["wood:0", "wood:-1", "wood:1.5", "wood:NaN", "wood:Infinity", "wood:9007199254740992", "wood:01", "wood:2", "invented:1", "__proto__:1", "wood:1:extra"]) {
    f.rules.executeTerritoryAction(f.state, `estate-withdraw:oak-hollow:${suffix}`, f.hooks);
    f.rules.executeTerritoryAction(f.state, `estate-deposit:oak-hollow:${suffix}`, f.hooks);
  }
  assert.equal(JSON.stringify([plot.storage, f.state.inventory]), before);
});

test("minor heirs may retrieve inherited goods and ruins never trap stored goods", async () => {
  const f = await fixture();
  f.buy();
  f.materials();
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:warehouse", f.hooks);
  const plot = f.state.territory.parcels["oak-hollow"];
  f.rules.executeTerritoryAction(f.state, "estate-deposit:oak-hollow:wood:5", f.hooks);
  plot.condition = 0;
  f.state.territory.arrears = 50;
  f.state.apostle.age = 10;
  f.rules.executeTerritoryAction(f.state, "estate-withdraw:oak-hollow:wood:5", f.hooks);
  assert.equal(plot.storage.wood, 0);
  f.rules.executeTerritoryAction(f.state, "estate-deposit:oak-hollow:wood:1", f.hooks);
  assert.equal(plot.storage.wood, 0);
});

test("depositing the last equipped sword removes it from combat until retrieved and equipped", async () => {
  const f = await fixture();
  f.buy();
  f.materials();
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:warehouse", f.hooks);
  f.state.inventory.sword = 1;
  f.state.apostle.equipment = "sword";
  f.rules.executeTerritoryAction(f.state, "estate-deposit:oak-hollow:sword:1", f.hooks);
  assert.equal(f.state.inventory.sword, 0);
  assert.equal(f.state.territory.parcels["oak-hollow"].storage.sword, 1);
  assert.equal(f.state.apostle.equipment, null);
  f.rules.executeTerritoryAction(f.state, "estate-withdraw:oak-hollow:sword:1", f.hooks);
  assert.equal(f.state.inventory.sword, 1);
  assert.equal(f.state.apostle.equipment, null);
});

test("shelter rest spends wood and invokes actual four-hour recovery only while maintained", async () => {
  const f = await fixture();
  f.buy();
  f.materials();
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:shelter", f.hooks);
  assert.equal(f.state.inventory.wood, 14);
  assert.equal(f.state.inventory.stone, 7);
  f.rules.executeTerritoryAction(f.state, "estate-rest:oak-hollow", f.hooks);
  assert.deepEqual(f.rest, [[4, 20]]);
  assert.equal(f.state.inventory.wood, 13);
  const plot = f.state.territory.parcels["oak-hollow"];
  plot.condition = 24;
  f.rules.executeTerritoryAction(f.state, "estate-rest:oak-hollow", f.hooks);
  assert.equal(f.rest.length, 1);
  plot.condition = 25;
  const hooks = { ...f.hooks, rest: undefined };
  f.rules.executeTerritoryAction(f.state, "estate-rest:oak-hollow", hooks);
  assert.equal(f.state.inventory.wood, 13, "missing recovery integration cannot consume materials");
});

test("daily obligations age buildings, conserve taxes, create debt and cannot charge the same day twice", async () => {
  const f = await fixture();
  f.buy();
  f.materials();
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:shelter", f.hooks);
  f.state.gold = 2;
  f.state.day = 6;
  const total = f.money();
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.gold, 0);
  assert.equal(f.state.territory.arrears, 3);
  assert.equal(f.state.territory.lastTaxDay, 6);
  assert.equal(f.state.territory.parcels["oak-hollow"].condition, 90);
  assert.equal(f.money(), total);
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.territory.arrears, 3);
  assert.equal(f.state.territory.parcels["oak-hollow"].condition, 90);
  f.state.day = 1_000_006;
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.territory.arrears, 1_000_003);
  assert.equal(f.state.territory.parcels["oak-hollow"].condition, 0);
});

test("charter adds a real daily obligation and arrears payment is local and partial", async () => {
  const f = await fixture();
  f.buy();
  f.state.territory.charter = true;
  f.state.day = 2;
  const total = f.money();
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.gold, 418, "one plot plus one charter duty per day");
  assert.equal(f.money(), total);
  f.state.territory.arrears = 8;
  f.state.gold = 3;
  f.rules.executeTerritoryAction(f.state, "realm-pay-debt", f.hooks);
  assert.equal(f.state.territory.arrears, 8);
  f.at("sign");
  const before = f.money();
  f.rules.executeTerritoryAction(f.state, "realm-pay-debt", f.hooks);
  assert.equal(f.state.territory.arrears, 5);
  assert.equal(f.state.gold, 0);
  assert.equal(f.money(), before);
});

test("debt blocks expansion, rest and new deposits but allows maintenance and withdrawals", async () => {
  const f = await fixture();
  f.buy();
  f.materials();
  const plot = f.state.territory.parcels["oak-hollow"];
  f.state.territory.arrears = 5;
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:warehouse", f.hooks);
  assert.equal(plot.building, "none");
  f.state.territory.arrears = 0;
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:warehouse", f.hooks);
  f.rules.executeTerritoryAction(f.state, "estate-deposit:oak-hollow:wood:5", f.hooks);
  f.state.territory.arrears = 5;
  plot.condition = 60;
  const wood = f.state.inventory.wood;
  f.rules.executeTerritoryAction(f.state, "estate-repair:oak-hollow", f.hooks);
  assert.equal(plot.condition, 100);
  assert.equal(f.state.inventory.wood, wood - 3);
  f.rules.executeTerritoryAction(f.state, "estate-deposit:oak-hollow:wood:1", f.hooks);
  assert.equal(plot.storage.wood, 5);
  f.rules.executeTerritoryAction(f.state, "estate-withdraw:oak-hollow:wood:1", f.hooks);
  assert.equal(plot.storage.wood, 4);
});

test("deeds backfill real achievements exactly once and cap rotating civic service", async () => {
  const f = await fixture();
  f.state.property.owned = true;
  f.state.property.building = true;
  f.state.property.harvests = 3;
  for (const job of f.state.frontier.jobs) job.status = "claimed";
  for (let index = 1; index <= 12; index++) f.state.economy.orders.push({ id: `order-${index}-bread`, title: "Pão", item: "bread", quantity: 6, reward: 20, createdDay: index, deadline: index + 3, status: "fulfilled" });
  for (const holding of Object.values(f.state.territory.parcels)) {
    holding.owned = true;
    holding.building = "shelter";
    holding.condition = 100;
  }
  f.rules.syncTerritoryDeeds(f.state, f.hooks);
  assert.equal(f.state.territory.influence, 38);
  assert.equal(f.state.territory.deeds.length, 13);
  assert.equal(f.state.territory.deeds.filter(id => id.startsWith("civic:")).length, 6);
  const before = JSON.stringify(f.state.territory.deeds);
  f.state.economy.orders = [];
  f.rules.syncTerritoryDeeds(f.state, f.hooks);
  f.rules.syncTerritoryDeeds(f.state, f.hooks);
  assert.equal(JSON.stringify(f.state.territory.deeds), before);
  assert.equal(f.state.territory.influence, 38);
  assert.equal(f.data.territoryDeedValue("frontier:invented"), null);
  assert.equal(f.data.territoryDeedValue("civic:order-0-bread"), null);
  assert.equal(f.data.territoryDeedValue("civic:order-2-bread"), 3);
});

test("malformed actions, dead apostles and overflow transfers leave state untouched", async () => {
  const f = await fixture();
  f.at("oak-hollow");
  const before = JSON.stringify([f.state.territory, f.state.gold, f.state.inventory]);
  assert.equal(f.rules.executeTerritoryAction(f.state, "plant", f.hooks), false);
  for (const action of ["estate-buy:__proto__", "estate-buy:oak-hollow:extra", "estate-build:oak-hollow:castle", "realm-charter:extra", "estate-repair:unknown"]) {
    assert.equal(f.rules.executeTerritoryAction(f.state, action, f.hooks), true);
  }
  assert.equal(JSON.stringify([f.state.territory, f.state.gold, f.state.inventory]), before);
  f.state.apostle.alive = false;
  f.buy();
  assert.equal(f.state.territory.parcels["oak-hollow"].owned, false);
  f.state.apostle.alive = true;
  f.state.economy.civicFunds = Number.MAX_SAFE_INTEGER;
  f.buy();
  assert.equal(f.state.territory.parcels["oak-hollow"].owned, false);
  assert.equal(f.state.gold, 500);
});

test("registration settles the previous ownership and never bills days before a new purchase", async () => {
  const f = await fixture();
  f.state.day = 10;
  f.buy();
  assert.equal(f.state.territory.lastTaxDay, 10);
  assert.equal(f.state.gold, 420, "the first plot cannot owe nine retroactive tributes");
  f.state.day = 12;
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.gold, 418);
  for (const job of f.state.frontier.jobs) job.status = "claimed";
  f.rules.syncTerritoryDeeds(f.state);
  f.at("sign");
  f.state.day = 15;
  f.rules.executeTerritoryAction(f.state, "realm-charter", f.hooks);
  assert.equal(f.state.gold, 355, "three old plot tributes and sixty charter coins, no past charter tributes");
  f.state.day = 16;
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.gold, 353);
  f.state.territory.lastTaxDay = 10;
  f.state.territory.parcels["stone-rise"].owned = true;
  f.state.territory.parcels["stone-rise"].registeredDay = 15;
  const before = f.state.gold;
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.gold, before - 13, "six charter days, six old plot days, one newly owned plot day");
});

test("construction settles previous taxes before creating a new building's maintenance clock", async () => {
  const f = await fixture();
  f.buy();
  f.materials();
  f.state.day = 10;
  f.rules.executeTerritoryAction(f.state, "estate-build:oak-hollow:shelter", f.hooks);
  assert.equal(f.state.territory.parcels["oak-hollow"].condition, 100);
  assert.equal(f.state.territory.lastTaxDay, 10);
  assert.equal(f.state.gold, 411);
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.territory.parcels["oak-hollow"].condition, 100);
  f.state.day = 11;
  f.rules.processTerritoryDay(f.state, f.hooks);
  assert.equal(f.state.territory.parcels["oak-hollow"].condition, 98);
});

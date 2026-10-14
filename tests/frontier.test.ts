import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import { OBJECTS } from "../src/data";
import type { ExpansionHooks, GameState, ToolId } from "../src/types";

async function fixture() {
  const module = await import("../src/frontier").catch(() => null);
  assert.ok(module, "the frontier simulation module must exist");
  const regions = await import("../src/regions");
  const state = initialState() as GameState;
  state.frontier = module.createFrontierState(1);
  state.phase = "playing";
  state.zone = "village";
  state.gold = 200;
  const messages: string[] = [];
  const hooks: ExpansionHooks = {
    message: text => messages.push(text),
    remember: (title, text, emotion, intensity = 50) => state.apostle.memories.push({ id: `${title}-${state.day}`, day: state.day, title, text, emotion, intensity }),
    practice: (skill, amount) => { state.apostle.skills[skill] = (state.apostle.skills[skill] || 0) + amount; },
    nearObject: id => {
      const point = [...OBJECTS, ...regions.objectsForZone(state.zone)].find(object => object.id === id);
      return !!point && Math.hypot(state.apostle.x - point.x, state.apostle.y - point.y) <= 120;
    },
    nearNpc: () => false,
  };
  const at = (id: string) => {
    const node = regions.resourceNode(id);
    const point = node || [...OBJECTS, ...regions.objectsForZone(state.zone)].find(object => object.id === id);
    assert.ok(point, `fixture location ${id} must exist`);
    if (node) state.zone = node.zone;
    state.apostle.x = point.x;
    state.apostle.y = point.y;
  };
  const tool = (id: ToolId) => { state.frontier.tools[id] = { owned: true, durability: 100 }; };
  const money = () => state.gold + state.merchantGold + state.economy.civicFunds + state.frontier.escrow;
  return { module, regions, state, hooks, messages, at, tool, money };
}

test("new campaigns have finite tools, renewable nodes and three optional jobs", async () => {
  const module = await import("../src/frontier").catch(() => null);
  assert.ok(module, "the frontier simulation module must exist");
  const state = module.createFrontierState(10);
  assert.deepEqual(state.tools, {
    axe: { owned: false, durability: 0 },
    pickaxe: { owned: false, durability: 0 },
  });
  assert.deepEqual(state.toolStock, { axe: 3, pickaxe: 3 });
  assert.equal(state.escrow, 0);
  assert.equal(state.work, null);
  assert.deepEqual(state.discovered, []);
  assert.equal(state.jobs.length, 3);
  assert.equal(state.jobs.find(job => job.id === "survey-trails")?.deadline, 18);
});

test("tools have real proximity, finite stock and conserved merchant payment", async () => {
  const f = await fixture();
  const total = f.money();
  f.module.executeFrontierAction(f.state, "buy-tool:pickaxe", f.hooks);
  assert.equal(f.state.frontier.tools.pickaxe.owned, false);
  f.at("market");
  f.module.executeFrontierAction(f.state, "buy-tool:pickaxe", f.hooks);
  assert.deepEqual(f.state.frontier.tools.pickaxe, { owned: true, durability: 100 });
  assert.equal(f.state.gold, 172);
  assert.equal(f.state.frontier.toolStock.pickaxe, 2);
  assert.equal(f.money(), total);
  f.module.executeFrontierAction(f.state, "buy-tool:pickaxe", f.hooks);
  assert.equal(f.state.gold, 172, "a duplicate purchase cannot charge money");
  f.state.frontier.toolStock.axe = 0;
  f.module.executeFrontierAction(f.state, "buy-tool:axe", f.hooks);
  assert.equal(f.state.frontier.tools.axe.owned, false);
  f.state.gold = 0;
  f.state.frontier.toolStock.axe = 3;
  f.module.executeFrontierAction(f.state, "buy-tool:axe", f.hooks);
  assert.equal(f.state.frontier.toolStock.axe, 3);
});

test("forge repair consumes ore, wood and a finite fee and caps durability", async () => {
  const f = await fixture();
  f.tool("axe");
  f.state.frontier.tools.axe.durability = 70;
  f.state.inventory.ore = 1;
  f.state.inventory.wood = 1;
  f.at("market");
  f.module.executeFrontierAction(f.state, "repair-tool:axe", f.hooks);
  assert.equal(f.state.frontier.tools.axe.durability, 70);
  f.at("forge");
  const total = f.money();
  f.module.executeFrontierAction(f.state, "repair-tool:axe", f.hooks);
  assert.equal(f.state.frontier.tools.axe.durability, 100);
  assert.equal(f.state.inventory.ore, 0);
  assert.equal(f.state.inventory.wood, 0);
  assert.equal(f.state.gold, 197);
  assert.equal(f.money(), total);
  f.module.executeFrontierAction(f.state, "repair-tool:axe", f.hooks);
  assert.equal(f.state.gold, 197);
});

test("mining rejects remote actions, missing tools, exhausted energy and young children", async () => {
  const f = await fixture();
  f.at("mine-iron-west");
  f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
  assert.equal(f.state.frontier.work, null);
  f.tool("pickaxe");
  f.state.apostle.x += 130;
  f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
  assert.equal(f.state.frontier.work, null);
  f.at("mine-iron-west");
  f.state.apostle.stamina = 7;
  f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
  assert.equal(f.state.frontier.work, null);
  f.state.apostle.stamina = 100;
  f.state.apostle.age = 11;
  f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
  assert.equal(f.state.frontier.work, null);
  f.state.apostle.age = 12;
  f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
  assert.ok(f.state.frontier.work);
});

test("work yields once after its duration, wears the tool and develops the real skill", async () => {
  const f = await fixture();
  f.at("mine-iron-west");
  f.tool("pickaxe");
  const energy = f.state.apostle.stamina;
  f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
  assert.equal(f.state.apostle.stamina, energy - 8);
  assert.equal(f.state.inventory.ore, 0);
  f.module.updateFrontierWork(f.state, 3.9, f.hooks);
  assert.equal(f.state.inventory.ore, 0);
  f.module.updateFrontierWork(f.state, 0.1, f.hooks);
  assert.equal(f.state.inventory.ore, 2);
  assert.equal(f.state.frontier.work, null);
  assert.equal(f.state.frontier.resources["mine-iron-west"].remaining, 3);
  assert.equal(f.state.frontier.tools.pickaxe.durability, 97);
  assert.ok(f.state.apostle.skills.mining > 0);
  f.module.updateFrontierWork(f.state, 20, f.hooks);
  assert.equal(f.state.inventory.ore, 2);
});

test("cancelled work loses its effort without granting resources and reload resumes remaining time", async () => {
  const f = await fixture();
  f.at("wild-oak");
  f.tool("axe");
  f.module.executeFrontierAction(f.state, "start-work:wild-oak", f.hooks);
  f.module.updateFrontierWork(f.state, 1, f.hooks);
  f.module.cancelWork(f.state, f.hooks, "A caminhada interrompeu o trabalho.");
  assert.equal(f.state.frontier.work, null);
  assert.equal(f.state.inventory.wood, 0);
  assert.equal(f.state.frontier.resources["wild-oak"].remaining, 4);
  f.module.executeFrontierAction(f.state, "start-work:wild-oak", f.hooks);
  f.module.updateFrontierWork(f.state, 1, f.hooks);
  const resumed = JSON.parse(JSON.stringify(f.state)) as GameState;
  f.module.updateFrontierWork(resumed, 1.9, f.hooks);
  assert.equal(resumed.inventory.wood, 0);
  f.module.updateFrontierWork(resumed, 0.1, f.hooks);
  assert.equal(resumed.inventory.wood, 3);
  assert.equal(resumed.frontier.tools.axe.durability, 97);
});

test("movement, zone changes, death and non-finite ticks cannot finish a resource action", async () => {
  for (const cause of ["distance", "zone", "death"] as const) {
    const f = await fixture();
    f.at("wild-herbs");
    f.module.executeFrontierAction(f.state, "start-work:wild-herbs", f.hooks);
    if (cause === "distance") f.state.apostle.x += 130;
    if (cause === "zone") f.state.zone = "village";
    if (cause === "death") f.state.apostle.alive = false;
    f.module.updateFrontierWork(f.state, 2, f.hooks);
    assert.equal(f.state.frontier.work, null);
    assert.equal(f.state.inventory.herb, 0);
  }
  const f = await fixture();
  f.at("wild-herbs");
  f.module.executeFrontierAction(f.state, "start-work:wild-herbs", f.hooks);
  for (const delta of [-1, NaN, Infinity]) f.module.updateFrontierWork(f.state, delta, f.hooks);
  assert.equal(f.state.frontier.work?.elapsed, 0);
  assert.equal(f.state.inventory.herb, 0);
});

test("carry capacity checks the promised yield and skill bonuses stay bounded", async () => {
  const f = await fixture();
  f.at("mine-iron-west");
  f.tool("pickaxe");
  f.state.inventory.wood = 34;
  f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
  assert.equal(f.state.frontier.work, null, "68 carried plus 4 ore weight exceeds 70");
  f.state.inventory.wood = 0;
  f.state.apostle.skills.mining = 100;
  f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
  f.module.updateFrontierWork(f.state, 4, f.hooks);
  assert.ok(f.state.inventory.ore >= 2 && f.state.inventory.ore <= 4);
});

test("depleted nodes stay depleted across reload until their calendar respawn day", async () => {
  const f = await fixture();
  f.at("mine-iron-west");
  f.tool("pickaxe");
  for (let attempt = 0; attempt < 4; attempt++) {
    f.module.executeFrontierAction(f.state, "start-work:mine-iron-west", f.hooks);
    f.module.updateFrontierWork(f.state, 4, f.hooks);
  }
  assert.deepEqual(f.state.frontier.resources["mine-iron-west"], { remaining: 0, readyDay: 4 });
  const resumed = JSON.parse(JSON.stringify(f.state)) as GameState;
  f.module.executeFrontierAction(resumed, "start-work:mine-iron-west", f.hooks);
  assert.equal(resumed.frontier.work, null);
  resumed.day = 3;
  f.module.processFrontierDay(resumed, f.hooks);
  assert.equal(resumed.frontier.resources["mine-iron-west"].remaining, 0);
  resumed.day = 4;
  f.module.processFrontierDay(resumed, f.hooks);
  assert.deepEqual(resumed.frontier.resources["mine-iron-west"], { remaining: 4, readyDay: null });
});

test("discoveries require physical landmarks and stay unique across repeated interaction", async () => {
  const f = await fixture();
  f.module.discoverLocation(f.state, "wild-camp", f.hooks);
  assert.deepEqual(f.state.frontier.discovered, []);
  f.state.zone = "wilderness";
  f.at("wild-camp");
  f.module.discoverLocation(f.state, "wild-camp", f.hooks);
  f.module.discoverLocation(f.state, "wild-camp", f.hooks);
  f.module.discoverLocation(f.state, "invented-palace", f.hooks);
  assert.deepEqual(f.state.frontier.discovered, ["wild-camp"]);
  assert.equal(f.state.apostle.memories.length, 1);
});

test("accepting optional work transfers escrow and protects existing civic order reserves", async () => {
  const f = await fixture();
  const total = f.money();
  f.module.executeFrontierAction(f.state, "frontier-accept:mine-supply", f.hooks);
  assert.equal(f.state.frontier.escrow, 0);
  f.at("sign");
  f.state.economy.orders.push({ id: "reserved", title: "Pedido", item: "bread", quantity: 6, reward: 150, createdDay: 1, deadline: 3, status: "available" });
  f.module.executeFrontierAction(f.state, "frontier-accept:mine-supply", f.hooks);
  assert.equal(f.state.frontier.escrow, 0, "reserved order budget cannot fund a new contract");
  f.state.economy.orders = [];
  f.module.executeFrontierAction(f.state, "frontier-accept:mine-supply", f.hooks);
  assert.equal(f.state.frontier.escrow, 52);
  assert.equal(f.state.economy.civicFunds, 128);
  assert.equal(f.money(), total);
  f.module.executeFrontierAction(f.state, "frontier-accept:mine-supply", f.hooks);
  assert.equal(f.state.frontier.escrow, 52);
});

test("delivery consumes real goods and pays escrow exactly once at the market", async () => {
  const f = await fixture();
  f.at("sign");
  f.module.executeFrontierAction(f.state, "frontier-accept:mine-supply", f.hooks);
  const total = f.money();
  f.state.inventory.ore = 3;
  f.at("market");
  f.module.executeFrontierAction(f.state, "frontier-claim:mine-supply", f.hooks);
  assert.equal(f.state.frontier.escrow, 52);
  f.state.inventory.ore = 4;
  const market = f.state.market.ore;
  f.module.executeFrontierAction(f.state, "frontier-claim:mine-supply", f.hooks);
  assert.equal(f.state.inventory.ore, 0);
  assert.equal(f.state.market.ore, market + 4);
  assert.equal(f.state.frontier.escrow, 0);
  assert.equal(f.state.gold, 252);
  assert.equal(f.state.frontier.jobs.find(job => job.id === "mine-supply")?.status, "claimed");
  assert.equal(f.money(), total);
  f.module.executeFrontierAction(f.state, "frontier-claim:mine-supply", f.hooks);
  assert.equal(f.state.gold, 252);
});

test("survey becomes claimable only after all four actual discoveries", async () => {
  const f = await fixture();
  f.at("sign");
  f.module.executeFrontierAction(f.state, "frontier-accept:survey-trails", f.hooks);
  const job = f.state.frontier.jobs.find(candidate => candidate.id === "survey-trails")!;
  f.state.zone = "wilderness";
  for (const id of job.targets.slice(0, 3)) {
    f.at(id);
    f.module.discoverLocation(f.state, id, f.hooks);
  }
  assert.equal(job.status, "accepted");
  f.at(job.targets[3]);
  f.module.discoverLocation(f.state, job.targets[3], f.hooks);
  assert.equal(job.status, "complete");
  f.at("wild-camp");
  f.module.executeFrontierAction(f.state, "frontier-claim:survey-trails", f.hooks);
  assert.equal(job.status, "claimed");
  assert.equal(f.state.gold, 218);
  assert.equal(f.state.frontier.escrow, 0);
});

test("expired contracts refund real escrow and ignored deliveries consume market stock", async () => {
  const f = await fixture();
  f.at("sign");
  f.module.executeFrontierAction(f.state, "frontier-accept:mine-supply", f.hooks);
  const total = f.money();
  f.state.day = 7;
  f.state.market.herb = 5;
  f.state.market.ore = 4;
  f.module.processFrontierDay(f.state, f.hooks);
  assert.equal(f.state.frontier.jobs.find(job => job.id === "mine-supply")?.status, "failed");
  assert.equal(f.state.frontier.jobs.find(job => job.id === "healing-herbs")?.status, "resolved");
  assert.equal(f.state.market.herb, 0);
  assert.equal(f.state.market.ore, 4, "accepted but failed goods are never silently consumed");
  assert.equal(f.state.frontier.escrow, 0);
  assert.equal(f.money(), total);
  assert.ok(f.state.apostle.memories.some(memory => memory.emotion === "Arrependimento"));
});

test("invalid identities, dead apostles and unrelated actions cannot mutate contracts", async () => {
  const f = await fixture();
  f.at("market");
  const before = JSON.stringify(f.state.frontier);
  assert.equal(f.module.executeFrontierAction(f.state, "plant", f.hooks), false);
  assert.equal(f.module.executeFrontierAction(f.state, "frontier-accept:unknown", f.hooks), true);
  assert.equal(f.module.executeFrontierAction(f.state, "buy-tool:sword", f.hooks), true);
  f.state.apostle.alive = false;
  f.module.executeFrontierAction(f.state, "buy-tool:axe", f.hooks);
  f.module.executeFrontierAction(f.state, "frontier-accept:mine-supply", f.hooks);
  assert.equal(JSON.stringify(f.state.frontier), before);
});

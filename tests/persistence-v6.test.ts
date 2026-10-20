import test from "node:test";
import { removeV7Fields, historicalProjection } from "./historical-state";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import { migrateState, validateState, saveGame, loadGame, clearSavedGame } from "../src/persistence";
import { RESOURCE_NODES, REGIONS } from "../src/regions";
import { ANIMAL_DEFS } from "../src/wildlife-data";
import type { GameState } from "../src/types";

function historicalV5(): Record<string, any> {
  const state = structuredClone(initialState()) as unknown as Record<string, any>;
  removeV7Fields(state as unknown as GameState);
  state.version = 5;
  delete state.wildlife;
  return state;
}

function livedV5(): Record<string, any> {
  const state = historicalV5();
  state.started = true;
  state.intro = false;
  state.phase = "playing";
  state.day = 31;
  state.minutes = 803.5;
  state.savedAt = 17000;
  state.gold = 237;
  state.inventory.ore = 9;
  state.frontier.resources["wild-oak"] = { remaining: 0, readyDay: 29 };
  const node = RESOURCE_NODES.find((entry) => entry.id === "mine-iron-west")!;
  state.zone = node.zone;
  state.apostle.x = node.x;
  state.apostle.y = node.y + 40;
  state.frontier.tools.pickaxe = { owned: true, durability: 67 };
  state.frontier.work = { nodeId: node.id, zone: node.zone,
    duration: node.duration, elapsed: 1.75 };
  state.frontier.resources[node.id] = { remaining: 2, readyDay: null };
  state.futureExtension = { route: ["wild-mine"], optional: undefined,
    observedAt: new Date("2026-10-17T12:00:00Z") };
  return state;
}

function currentCampaign(): GameState {
  const state = migrateState(livedV5());
  assert.ok(state, "a valid v5 campaign migrates");
  assert.equal(state.version, 8);
  return state;
}

test("v5 migration adds wildlife, NPC regions and highland reserves and preserves every prior field in an independent copy", () => {
  const old = livedV5();
  const before = structuredClone(old);
  const migrated = migrateState(old);
  assert.ok(migrated);
  assert.equal(migrated.version, 8);
  assert.equal(validateState(migrated), true);
  assert.equal(Object.keys(migrated.wildlife.animals).length, 22);
  assert.deepEqual(Object.keys(migrated.wildlife.animals).sort(), ANIMAL_DEFS.map(def => def.id).sort());
  assert.deepEqual(migrated.wildlife.observed, []);
  const wildlife = migrated.wildlife;
  assert.deepEqual(historicalProjection(migrated, 5), before,
    "time, depleted reserves, partial work, tools, holdings and extensions must not change");
  assert.deepEqual(old, before);
  migrated.frontier.resources["wild-oak"].remaining = 1;
  (migrated as unknown as typeof old).futureExtension.route.push("mine-exit");
  assert.deepEqual(old, before);
  assert.deepEqual(migrateState(old)?.wildlife, wildlife, "migration creates deterministic wildlife");
});

test("v5 damage is rejected before adding wildlife or repairing prior fields", () => {
  const mutations: ((state: Record<string, any>) => void)[] = [
    state => { delete state.frontier.resources["wild-oak"]; },
    state => { state.frontier.resources.fake = { remaining: 1, readyDay: null }; },
    state => { state.frontier.resources["wild-oak"].readyDay = null; },
    state => { state.frontier.work.elapsed = state.frontier.work.duration + 1; },
    state => { state.frontier.tools.pickaxe.durability = -1; },
    state => { state.frontier.escrow = 1; },
    state => { state.gold = 0.5; },
    state => { state.inventory.ore = -1; },
    state => { delete state.life.needs.mira; },
    state => { state.territory.influence = 1; },
    state => { state.economy.civicFunds = -1; },
  ];
  for (const mutate of mutations) {
    const invalid = livedV5();
    mutate(invalid);
    const before = structuredClone(invalid);
    assert.equal(migrateState(invalid), null, String(mutate));
    assert.deepEqual(invalid, before);
  }
});

test("v5 snapshots with a conflicting wildlife extension are rejected without overwriting it", () => {
  for (const wildlife of [undefined, null, {}, { animals: {}, observed: [] }, initialState().wildlife]) {
    const invalid = { ...livedV5(), wildlife };
    const before = structuredClone(invalid);
    assert.equal(migrateState(invalid), null);
    assert.deepEqual(invalid, before);
  }
});

test("v8 requires every wildlife field and the complete authored animal catalog", () => {
  const valid = currentCampaign();
  const mutations: ((state: GameState) => void)[] = [
    state => { delete (state as Partial<GameState>).wildlife; },
    state => { (state as unknown as Record<string, unknown>).wildlife = null; },
    state => { delete (state.wildlife as Partial<GameState["wildlife"]>).animals; },
    state => { delete (state.wildlife as Partial<GameState["wildlife"]>).observed; },
    state => { delete state.wildlife.animals["chicken-1"]; },
    state => { state.wildlife.animals.fake = structuredClone(state.wildlife.animals["chicken-1"]); },
    state => { delete state.wildlife.animals["chicken-1"];
      state.wildlife.animals.fake = structuredClone(state.wildlife.animals["chicken-2"]); },
    state => { state.wildlife.observed = ["fake"]; },
    state => { state.wildlife.observed = ["chicken-1", "chicken-1"]; },
    state => { state.wildlife.observed = new Array<string>(1); },
  ];
  for (const key of Object.keys(valid.wildlife.animals["chicken-1"])) {
    mutations.push(state => { delete (state.wildlife.animals["chicken-1"] as unknown as Record<string, unknown>)[key]; });
  }
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    const before = structuredClone(invalid);
    assert.equal(validateState(invalid), false, String(mutate));
    assert.equal(migrateState(invalid), null, String(mutate));
    assert.deepEqual(invalid, before);
  }
});

test("v8 validates identity, behavior, bounds, timers, trust, feeding dates and random seed", () => {
  const valid = currentCampaign();
  const animal = valid.wildlife.animals["chicken-1"];
  const invalidFields: Record<string, unknown[]> = {
    id: ["chicken-2", "fake", null],
    species: ["fox", "dragon", null],
    zone: ["wilderness", "mine", null],
    x: [-1, Number.NaN, Number.POSITIVE_INFINITY, REGIONS.village.width + 1],
    y: [-1, Number.NaN, Number.POSITIVE_INFINITY, REGIONS.village.height + 1],
    facing: [-0.1, Math.PI * 2, Math.PI * 2 + 0.1, Number.NaN, Number.POSITIVE_INFINITY],
    behavior: ["sleep", null, 1],
    target: [{ x: -1, y: 1 }, { x: 1, y: -1 }, { x: Number.NaN, y: 1 },
      { x: animal.x, y: Number.POSITIVE_INFINITY }, { x: animal.x }, [],
      { x: REGIONS.village.width + 1, y: animal.y }, { x: animal.x, y: REGIONS.village.height + 1 },
      { x: 100, y: 100 }],
    wait: [-1, 30.01, Number.NaN, Number.POSITIVE_INFINITY],
    trust: [-1, 100.01, Number.NaN, Number.POSITIVE_INFINITY],
    fear: [-1, 100.01, Number.NaN, Number.POSITIVE_INFINITY],
    lastFedDay: [-1, 0, 1.5, valid.day + 1, Number.NaN, Number.POSITIVE_INFINITY],
    seed: [-1, 0.5, 0x100000000, Number.NaN, Number.POSITIVE_INFINITY],
  };
  for (const [field, values] of Object.entries(invalidFields)) {
    for (const value of values) {
      const invalid = structuredClone(valid);
      (invalid.wildlife.animals["chicken-1"] as unknown as Record<string, unknown>)[field] = value;
      const before = structuredClone(invalid);
      assert.equal(validateState(invalid), false, `${field}=${JSON.stringify(value)}`);
      assert.equal(migrateState(invalid), null, `${field}=${JSON.stringify(value)}`);
      assert.deepEqual(invalid, before);
    }
  }
});

test("v8 wildlife round trip preserves movement, feeding, observations and paused world time", async () => {
  await clearSavedGame();
  try {
    const state = currentCampaign();
    const chicken = state.wildlife.animals["chicken-1"];
    chicken.target = { x: chicken.x, y: chicken.y };
    chicken.behavior = "walk";
    chicken.lastFedDay = state.day;
    chicken.trust = 100;
    chicken.fear = 0;
    chicken.wait = 30;
    chicken.facing = Math.PI * 2 - 1e-6;
    chicken.seed = 0xffffffff;
    state.wildlife.animals["chicken-2"].seed = 0;
    state.wildlife.observed = ["chicken-1", "deer-4", "fox-2"];
    assert.equal(validateState(state), true);
    await saveGame(state);
    const loaded = await loadGame();
    assert.ok(loaded);
    assert.equal(loaded.version, 8);
    assert.equal(loaded.day, state.day);
    assert.equal(loaded.minutes, state.minutes);
    assert.deepEqual(loaded.wildlife, state.wildlife);
    loaded.wildlife.observed.push("rabbit-6");
    loaded.wildlife.animals["chicken-1"].trust = 10;
    assert.deepEqual((await loadGame())?.wildlife, state.wildlife);
  } finally {
    await clearSavedGame();
  }
});

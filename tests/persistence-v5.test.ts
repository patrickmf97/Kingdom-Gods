import test from "node:test";
import { removeV7Fields, historicalProjection } from "./historical-state";
import assert from "node:assert/strict";
import { initialState, type PersistentGameState } from "../src/simulation";
import { migrateState, validateState } from "../src/persistence";
import { RESOURCE_NODES, V5_RESOURCE_NODES } from "../src/regions";
import type { GameState } from "../src/types";

// Historical files contain exactly these ten reserves, independently of the
// live catalog used to build a new campaign.
const ORIGINAL_RESOURCE_IDS = ["tree1", "herb1", "stone1", "wild-oak", "wild-herbs",
  "wild-stone", "mine-iron-west", "mine-iron-east", "mine-iron-deep", "mine-stone"];
const originalIds = new Set(ORIGINAL_RESOURCE_IDS);

function historicalV4(): PersistentGameState {
  const state = structuredClone(initialState());
  removeV7Fields(state as unknown as GameState);
  state.version = 4;
  delete (state as Partial<GameState>).wildlife;
  state.frontier.resources = Object.fromEntries(ORIGINAL_RESOURCE_IDS.map((id) =>
    [id, structuredClone(state.frontier.resources[id])]));
  return state;
}

function livedV4(): PersistentGameState & { futureExtension: { routes: string[] } } {
  const state = historicalV4();
  state.started = true;
  state.intro = false;
  state.phase = "playing";
  state.day = 18;
  state.minutes = 739.5;
  state.savedAt = 1000;
  state.gold = 237;
  state.inventory.wood = 7;
  state.inventory.ore = 3;
  state.apostle.memories.push({ id: "remember-mine", day: 8, title: "A mina",
    text: "O caminho foi encontrado.", emotion: "esperança", intensity: 61 });
  const node = RESOURCE_NODES.find((entry) => entry.id === "mine-iron-west")!;
  state.zone = node.zone;
  state.apostle.x = node.x;
  state.apostle.y = node.y + 40;
  state.frontier.tools.pickaxe = { owned: true, durability: 73 };
  state.frontier.toolStock.pickaxe = 2;
  state.frontier.resources[node.id] = { remaining: 2, readyDay: null };
  state.frontier.resources["wild-oak"] = { remaining: 0, readyDay: 17 };
  state.frontier.resources["mine-stone"] = { remaining: 0, readyDay: 21 };
  state.frontier.work = { nodeId: node.id, zone: node.zone, duration: node.duration, elapsed: 1.75 };
  state.frontier.discovered = ["wild-camp", "wild-ruins", "wild-lake", "wild-mine", "tree1"];
  const survey = state.frontier.jobs.find((entry) => entry.id === "survey-trails")!;
  survey.status = "complete";
  const delivery = state.frontier.jobs.find((entry) => entry.id === "mine-supply")!;
  delivery.status = "accepted";
  state.frontier.escrow = survey.reward + delivery.reward;
  state.simulation = { ...state.simulation, gathering: { tree1: 25900 },
    npcMemories: { mira: [...state.apostle.memories] },
    futureExtension: { observedAt: new Date("2026-10-01T12:00:00Z"), route: ["mine"] } } as PersistentGameState["simulation"];
  return { ...state, futureExtension: { routes: ["wild-mine", "mine-exit"] } };
}

test("new campaigns use complete v8 reserves for all 67 authored resources", () => {
  const state = initialState();
  assert.equal(state.version, 8);
  assert.equal(RESOURCE_NODES.length, 67);
  assert.equal(Object.keys(state.frontier.resources).length, 67);
  for (const node of RESOURCE_NODES) {
    assert.deepEqual(state.frontier.resources[node.id], { remaining: node.capacity, readyDay: null });
  }
  assert.equal(validateState(state), true);
});

test("v4 adds only new reserves while preserving depleted nodes, partial work and every saved field", () => {
  const old = livedV4();
  const before = structuredClone(old);
  const migrated = migrateState(old);
  assert.ok(migrated);
  assert.equal(migrated.version, 8);
  assert.equal(validateState(migrated), true);
  assert.equal(Object.keys(migrated.frontier.resources).length, 67);
  const added = RESOURCE_NODES.filter((node) => !originalIds.has(node.id));
  assert.equal(added.length, 57);
  for (const node of added) {
    assert.deepEqual(migrated.frontier.resources[node.id], { remaining: node.capacity, readyDay: null });
  }
  const restored = historicalProjection(migrated, 4);
  assert.deepEqual(restored, before, "migration must not tick time, replenish old nodes or alter commitments");
  assert.deepEqual(old, before);
  migrated.frontier.resources["wild-oak"].readyDay = 99;
  migrated.apostle.memories[0].text = "changed";
  assert.deepEqual(old, before, "migrated data is an independent copy");
});

test("v3 chains territory and reserve migrations without advancing an overdue reserve", () => {
  const old = livedV4() as unknown as Record<string, any>;
  old.version = 3;
  delete old.territory;
  old.property.owned = true;
  old.property.building = true;
  const before = structuredClone(old);
  const migrated = migrateState(old);
  assert.ok(migrated);
  assert.equal(migrated.version, 8);
  assert.equal(validateState(migrated), true);
  assert.equal(Object.keys(migrated.frontier.resources).length, 67);
  assert.deepEqual(migrated.frontier.resources["wild-oak"], { remaining: 0, readyDay: 17 });
  assert.equal(migrated.territory.lastTaxDay, old.day);
  assert.deepEqual(migrated.territory.deeds, ["house:first"]);
  const restored = historicalProjection(migrated, 3);
  assert.deepEqual(restored, before);
  assert.deepEqual(old, before);
});

test("v1 and v2 migrate through the historical ten-node schema into complete v8 reserves", () => {
  for (const version of [1, 2]) {
    const old = historicalV4() as unknown as Record<string, any>;
    old.version = version;
    old.day = 47;
    old.minutes = 1131;
    old.savedAt = 2000;
    delete old.frontier;
    delete old.life;
    delete old.territory;
    delete old.apostle.skills.woodcutting;
    delete old.apostle.skills.herbalism;
    if (version === 1) {
      delete old.economy;
      delete old.inventory.flour;
      delete old.market.flour;
      delete old.apostle.skills.cooking;
      delete old.apostle.skills.smithing;
    }
    const before = structuredClone(old);
    const migrated = migrateState(old);
    assert.ok(migrated, `v${version}`);
    assert.equal(migrated.version, 8);
    assert.equal(validateState(migrated), true);
    assert.equal(Object.keys(migrated.frontier.resources).length, 67);
    assert.equal(migrated.day, old.day);
    assert.equal(migrated.minutes, old.minutes);
    assert.equal(migrated.savedAt, old.savedAt);
    assert.deepEqual(old, before);
  }
});

test("v3 and v4 reject historical corruption before any resource defaults are added", () => {
  const mutations: ((state: GameState) => void)[] = [
    (state) => { delete state.frontier.resources["wild-oak"]; },
    (state) => { state.frontier.resources.fake = { remaining: 1, readyDay: null }; },
    (state) => { state.frontier.resources["wild-oak"].remaining = 5; },
    (state) => { state.frontier.resources["wild-oak"].readyDay = null; },
    (state) => { state.frontier.resources["mine-iron-west"].remaining = 0.5; },
    (state) => { state.frontier.work!.elapsed = state.frontier.work!.duration + 1; },
    (state) => { state.frontier.work!.nodeId = "future-resource"; },
    (state) => { state.frontier.discovered.push("future-resource"); },
    (state) => { state.frontier.escrow++; },
    (state) => { state.inventory.ore = -1; },
    (state) => { state.economy.civicFunds = -1; },
    (state) => { delete state.life.needs.mira; },
  ];
  for (const version of [3, 4]) {
    for (const mutate of mutations) {
      const invalid = livedV4();
      invalid.version = version;
      if (version === 3) delete (invalid as Partial<GameState>).territory;
      mutate(invalid);
      const before = structuredClone(invalid);
      assert.equal(migrateState(invalid), null, `v${version}: ${mutate}`);
      assert.deepEqual(invalid, before);
    }
  }
  const badTerritory = livedV4();
  badTerritory.territory.influence = 1;
  assert.equal(migrateState(badTerritory), null);
});

test("legacy versions cannot claim discovery or work at newly authored resource nodes", () => {
  const node = RESOURCE_NODES.find((entry) => !originalIds.has(entry.id));
  assert.ok(node, "expanded catalog includes a new resource");
  for (const version of [3, 4]) {
    for (const use of ["reserve", "discovery", "work"]) {
      const invalid = livedV4();
      invalid.version = version;
      if (version === 3) delete (invalid as Partial<GameState>).territory;
      if (use === "reserve") {
        delete invalid.frontier.resources["tree1"];
        invalid.frontier.resources[node.id] = { remaining: node.capacity, readyDay: null };
      }
      if (use === "discovery") invalid.frontier.discovered.push(node.id);
      if (use === "work") {
        invalid.zone = node.zone;
        invalid.apostle.x = node.x;
        invalid.apostle.y = node.y + 40;
        invalid.frontier.work = { nodeId: node.id, zone: node.zone, duration: node.duration, elapsed: 0.5 };
      }
      assert.equal(migrateState(invalid), null, `v${version}: ${use}`);
    }
  }
});

test("v5 rejects missing, extra and damaged reserves without repairing current saves", () => {
  const valid = migrateState(livedV4());
  assert.ok(valid);
  removeV7Fields(valid);
  valid.version = 5;
  delete (valid as Partial<GameState>).wildlife;
  const node = RESOURCE_NODES.find((entry) => !originalIds.has(entry.id));
  assert.ok(node);
  const mutations: ((state: GameState) => void)[] = [
    (state) => { delete state.frontier.resources[node.id]; },
    (state) => { delete state.frontier.resources["tree1"]; },
    (state) => { state.frontier.resources.fake = { remaining: 1, readyDay: null }; },
    (state) => { state.frontier.resources[node.id].remaining = node.capacity + 1; },
    (state) => { state.frontier.resources[node.id].remaining = 0.5; },
    (state) => { state.frontier.resources[node.id] = { remaining: 0, readyDay: null }; },
    (state) => { state.frontier.resources[node.id].readyDay = 19; },
  ];
  assert.equal(validateState(valid), false, "v5 is historical, not a complete current snapshot");
  assert.ok(migrateState(valid));
  for (const mutate of mutations) {
    const invalid: GameState = structuredClone(valid);
    mutate(invalid);
    const before = structuredClone(invalid);
    assert.equal(validateState(invalid), false, String(mutate));
    assert.equal(migrateState(invalid), null, String(mutate));
    assert.deepEqual(invalid, before);
  }
  const upgraded = migrateState(valid);
  assert.ok(upgraded);
  assert.deepEqual(historicalProjection(upgraded, 5), valid);
});

test("v5 accepts discovery, independent depletion and resumed work at a new resource", () => {
  const state = migrateState(livedV4());
  assert.ok(state);
  const added = V5_RESOURCE_NODES.filter((node) => !originalIds.has(node.id));
  assert.equal(added.length, 45);
  removeV7Fields(state as unknown as GameState);
  state.version = 5;
  delete (state as Partial<GameState>).wildlife;
  const [working, depleted] = added;
  state.zone = working.zone;
  state.apostle.x = working.x;
  state.apostle.y = working.y + 40;
  if (working.tool) state.frontier.tools[working.tool] = { owned: true, durability: 61 };
  state.frontier.work = { nodeId: working.id, zone: working.zone,
    duration: working.duration, elapsed: working.duration / 2 };
  state.frontier.resources[depleted.id] = { remaining: 0, readyDay: state.day + depleted.respawnDays };
  state.frontier.discovered.push(working.id, depleted.id);
  const upgraded = migrateState(state);
  assert.ok(upgraded);
  assert.equal(validateState(upgraded), true);
  assert.deepEqual(historicalProjection(upgraded, 5), state);
});

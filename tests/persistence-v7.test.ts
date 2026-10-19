import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initialState } from "../src/simulation";
import { migrateState, validateState, saveGame, loadGame, clearSavedGame } from "../src/persistence";
import { RESOURCE_NODES, V5_RESOURCE_NODES, REGIONS } from "../src/regions";
import { ANIMAL_DEFS } from "../src/wildlife-data";
import type { GameState, Zone } from "../src/types";
import { historicalProjection } from "./historical-state";

function historicalV6(): Record<string, any> {
  return historicalProjection(initialState(), 6);
}

function migrated(state: unknown): GameState {
  const result = migrateState(state);
  assert.ok(result);
  assert.equal(result.version, 7);
  assert.equal(validateState(result), true);
  return result;
}

const addedNodes = RESOURCE_NODES.filter(node => !V5_RESOURCE_NODES.some(old => old.id === node.id));

test("new v7 campaigns persist all NPC regions, 67 resources and the original 22 animals", () => {
  const state = initialState();
  assert.equal(state.version, 7);
  assert.equal(validateState(state), true);
  assert.equal(RESOURCE_NODES.length, 67);
  assert.equal(V5_RESOURCE_NODES.length, 55);
  assert.equal(addedNodes.length, 12);
  assert.equal(Object.keys(state.frontier.resources).length, 67);
  assert.equal(Object.keys(state.wildlife.animals).length, 22);
  assert.deepEqual(Object.keys(state.wildlife.animals).sort(), ANIMAL_DEFS.map(def => def.id).sort());
  assert.equal(state.npcs.find(npc => npc.id === "matron")?.zone, "orphanage");
  assert.ok(state.npcs.every(npc => Object.hasOwn(REGIONS, npc.zone)));
});

test("v6 migration adds only NPC regions and the 12 finite highland reserves", () => {
  const old = historicalV6();
  old.started = true; old.phase = "playing"; old.intro = false;
  old.day = 46; old.minutes = 1323.75; old.savedAt = 32100;
  old.gold = 283; old.inventory.wood = 19; old.inventory.ore = 7;
  old.frontier.resources["wild-oak"] = { remaining: 0, readyDay: 44 };
  old.frontier.tools.pickaxe = { owned: true, durability: 57 };
  old.zone = "mine";
  const node = V5_RESOURCE_NODES.find(node => node.id === "mine-iron-west")!;
  Object.assign(old.apostle, { x: node.x, y: node.y + 40 });
  old.frontier.work = { nodeId: node.id, zone: node.zone, duration: node.duration, elapsed: 1.75 };
  old.frontier.resources[node.id] = { remaining: 2, readyDay: null };
  old.futureExtension = { route: ["wild-mine"], observedAt: new Date("2026-10-17T12:00:00Z") };
  const before = structuredClone(old);
  const result = migrated(old);
  assert.deepEqual(historicalProjection(result, 6), before,
    "migration preserves saved time, family, money, old reserves, tools, work, fauna and extensions");
  assert.deepEqual(old, before);
  for (const node of addedNodes) {
    assert.deepEqual(result.frontier.resources[node.id], { remaining: node.capacity, readyDay: null });
  }
  assert.ok(result.npcs.every(npc => npc.zone === (npc.id === "matron" ? "orphanage" : "village")));
  result.frontier.resources["wild-oak"].readyDay = 99;
  result.wildlife.animals["chicken-1"].trust = 80;
  result.npcs[0].name = "Changed";
  assert.deepEqual(old, before);
});

test("the historical companion alone retains the dungeon context during migration", () => {
  const old = historicalV6();
  old.zone = "dungeon";
  const friend = old.npcs.find((npc: { id: string }) => npc.id !== "matron");
  old.simulation.companionId = friend.id;
  const result = migrated(old);
  assert.equal(result.npcs.find(npc => npc.id === friend.id)?.zone, "dungeon");
  assert.equal(result.npcs.find(npc => npc.id === "matron")?.zone, "orphanage");
  assert.ok(result.npcs.filter(npc => npc.id !== friend.id && npc.id !== "matron").every(npc => npc.zone === "village"));
  assert.deepEqual(historicalProjection(result, 6), old);
});

test("v6 validates its 55-resource, original-zone contract before adding defaults", () => {
  const mutations: ((state: Record<string, any>) => void)[] = [
    state => { delete state.frontier.resources["wild-oak"]; },
    state => { state.frontier.resources[addedNodes[0].id] = { remaining: addedNodes[0].capacity, readyDay: null }; },
    state => { state.frontier.discovered.push(addedNodes[0].id); },
    state => { state.frontier.discovered.push("highland-ranger-lodge"); },
    state => { state.zone = "highlands"; },
    state => { state.zone = "inn-room"; },
    state => { state.npcs[0].zone = "orphanage"; },
    state => { state.npcs[1].zone = undefined; },
    state => { delete state.wildlife.animals["fox-2"]; },
    state => { state.wildlife.animals.fake = structuredClone(state.wildlife.animals["fox-2"]); },
    state => { state.economy.civicFunds = -1; },
  ];
  for (const mutate of mutations) {
    const invalid = historicalV6();
    mutate(invalid);
    const before = structuredClone(invalid);
    assert.equal(migrateState(invalid), null, String(mutate));
    assert.deepEqual(invalid, before);
  }
});

test("v7 requires each NPC zone and guards matron and dungeon companion contexts", () => {
  const valid = initialState();
  const mutations: ((state: GameState) => void)[] = [
    state => { delete (state.npcs[0] as unknown as Record<string, unknown>).zone; },
    state => { state.npcs[0].zone = "unknown" as Zone; },
    state => { state.npcs.find(npc => npc.id === "matron")!.zone = "village"; },
    state => { state.npcs.find(npc => npc.id !== "matron")!.zone = "dungeon"; },
    state => { delete state.frontier.resources[addedNodes[0].id]; },
    state => { state.frontier.resources[addedNodes[0].id].remaining = addedNodes[0].capacity + 1; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(validateState(invalid), false, String(mutate));
    assert.equal(migrateState(invalid), null, String(mutate));
  }
  const friend = valid.npcs.find(npc => npc.id !== "matron")!;
  valid.zone = "dungeon"; valid.simulation!.companionId = friend.id; friend.zone = "dungeon";
  assert.equal(validateState(valid), true);
  valid.simulation!.companionId = "missing-friend";
  assert.equal(validateState(valid), false);
});

test("v7 accepts all authored player zones and keeps known NPC room and outdoor regions", () => {
  const state = initialState();
  const friend = state.npcs.find(npc => npc.id !== "matron")!;
  for (const zone of Object.keys(REGIONS) as Zone[]) {
    state.zone = zone;
    if (zone !== "dungeon") friend.zone = zone;
    else { state.simulation!.companionId = friend.id; friend.zone = "dungeon"; }
    assert.equal(validateState(state), true, zone);
  }
});

test("v7 preserves partial work and discoveries at the new highland resources", () => {
  for (const node of addedNodes) {
    const state = initialState();
    state.started = true; state.phase = "playing"; state.intro = false;
    state.zone = node.zone;
    Object.assign(state.apostle, { x: node.x, y: node.y + 40 });
    if (node.tool) state.frontier.tools[node.tool] = { owned: true, durability: 72 };
    state.frontier.work = { nodeId: node.id, zone: node.zone,
      duration: node.duration, elapsed: node.duration / 2 };
    state.frontier.discovered = [node.id, "highland-ranger-lodge"];
    assert.equal(validateState(state), true, node.id);
    assert.deepEqual(migrateState(state), state, node.id);
  }
});

test("an earned v6 campaign preserves feeding, observation, movement and all fauna on upgrade", () => {
  const old = JSON.parse(readFileSync(new URL("./fixtures/v6-earned-campaign.json", import.meta.url), "utf8"));
  assert.equal(old.version, 6);
  assert.equal(Object.keys(old.frontier.resources).length, 55);
  assert.equal(Object.keys(old.wildlife.animals).length, 22);
  assert.ok(old.wildlife.observed.includes("chicken-1"));
  assert.equal(old.wildlife.animals["chicken-1"].lastFedDay, old.day);
  assert.ok(old.wildlife.animals["chicken-1"].trust > 25);
  const result = migrated(old);
  assert.deepEqual(historicalProjection(result, 6), old);
  assert.deepEqual(result.wildlife, old.wildlife);
});

test("a v7 fixture and durable round trip retain NPC rooms without advancing saved time", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/v7-baseline-campaign.json", import.meta.url), "utf8"));
  assert.equal(validateState(fixture), true);
  const state = migrated(fixture);
  const friend = state.npcs.find(npc => npc.id !== "matron")!;
  friend.zone = "inn-room";
  state.zone = "highlands";
  await clearSavedGame();
  try {
    const stored = await saveGame(state);
    const loaded = await loadGame();
    assert.deepEqual(loaded, stored);
    assert.equal(loaded?.npcs.find(npc => npc.id === friend.id)?.zone, "inn-room");
    assert.equal(loaded?.day, state.day);
    assert.equal(loaded?.minutes, state.minutes);
    assert.deepEqual(loaded?.wildlife, state.wildlife);
  } finally { await clearSavedGame(); }
});

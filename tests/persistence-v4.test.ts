import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import { migrateState, validateState, saveGame, loadGame, getPersistenceError } from "../src/persistence";
import { exportCampaign, parseCampaign, importCampaign } from "../src/campaign-files";
import type { GameState, TerritoryState } from "../src/types";
import { LEGACY_RESOURCE_NODES } from "../src/regions";

const emptyStorage = () => ({ bread: 0, wood: 0, stone: 0, wheat: 0, flour: 0,
  seed: 0, sword: 0, herb: 0, ore: 0 });
const emptyTerritory = (day = 1): TerritoryState => ({
  parcels: {
    "oak-hollow": { owned: false, registeredDay: null, building: "none", condition: 0, storage: emptyStorage() },
    "stone-rise": { owned: false, registeredDay: null, building: "none", condition: 0, storage: emptyStorage() },
  },
  influence: 0, deeds: [], charter: false, arrears: 0, lastTaxDay: day,
});

function historicalV3(): Record<string, any> {
  const state = structuredClone(initialState()) as unknown as Record<string, any>;
  state.version = 3;
  state.frontier.resources = Object.fromEntries(LEGACY_RESOURCE_NODES.map((node) =>
    [node.id, structuredClone(state.frontier.resources[node.id])]));
  delete state.territory;
  return state;
}

function currentCampaign(): GameState {
  return { ...initialState(), territory: emptyTerritory() };
}

function estateCampaign(): GameState {
  const state = currentCampaign();
  state.started = true;
  state.phase = "playing";
  state.intro = false;
  state.day = 12;
  state.minutes = 715;
  state.gold = 57;
  state.zone = "wilderness";
  state.territory.lastTaxDay = 11;
  state.territory.parcels["oak-hollow"] = {
    owned: true, registeredDay: 6, building: "warehouse", condition: 83,
    storage: { ...emptyStorage(), wood: 21, ore: 8, bread: 10 },
  };
  state.territory.deeds = ["building:oak-hollow", "frontier:mine-supply", "civic:order-8-bread"];
  state.territory.influence = 9;
  state.territory.arrears = 4;
  return state;
}

test("upgrades a strict v3 snapshot without moving time, resources, memories or extensions", () => {
  const old = historicalV3();
  old.day = 178;
  old.minutes = 922;
  old.gold = 268;
  old.futureExtension = { routes: ["wild-mine"] };
  old.frontier.tools.pickaxe = { owned: true, durability: 71 };
  old.frontier.resources["mine-iron-west"].remaining = 1;
  const before = structuredClone(old);
  const result = migrateState(old);
  assert.ok(result);
  assert.equal(result.version, 5);
  assert.equal(validateState(result), true);
  assert.deepEqual(result.territory, emptyTerritory(old.day));
  const { territory, ...restored } = result;
  const historicalResources = Object.fromEntries(LEGACY_RESOURCE_NODES.map((node) =>
    [node.id, restored.frontier.resources[node.id]]));
  assert.deepEqual({ ...restored, version: 3,
    frontier: { ...restored.frontier, resources: historicalResources } }, before);
  assert.deepEqual(old, before);
  result.frontier.tools.pickaxe.durability = 1;
  assert.equal(old.frontier.tools.pickaxe.durability, 71);
});

test("v3 migration records completed historical services once without creating property or currency", () => {
  const old = historicalV3();
  old.day = 15;
  old.property.owned = true;
  old.property.building = true;
  old.property.harvests = 5;
  old.frontier.jobs.find((job: { id: string }) => job.id === "mine-supply").status = "claimed";
  old.economy.orders = [{ id: "order-4-bread", title: "Pão", item: "bread", quantity: 4,
    reward: 24, createdDay: 4, deadline: 7, status: "fulfilled" }];
  const migrated = migrateState(old);
  assert.ok(migrated);
  assert.deepEqual([...migrated.territory.deeds].sort(), ["civic:order-4-bread", "frontier:mine-supply", "harvest:first", "house:first"].sort());
  assert.equal(migrated.territory.influence, 11);
  assert.equal(migrated.gold, old.gold);
  assert.equal(migrated.territory.parcels["oak-hollow"].owned, false);
  assert.deepEqual(migrateState(migrated), migrated);
});

test("damaged v3 frontier, life or economics cannot be concealed by territory defaults", () => {
  for (const mutate of [
    (state: Record<string, any>) => { delete state.frontier.resources["wild-oak"]; },
    (state: Record<string, any>) => { state.frontier.escrow = 1; },
    (state: Record<string, any>) => { delete state.life.needs.mira; },
    (state: Record<string, any>) => { state.economy.civicFunds = -1; },
    (state: Record<string, any>) => { state.apostle.skills.woodcutting = -1; },
  ]) {
    const invalid = historicalV3();
    mutate(invalid);
    assert.equal(migrateState(invalid), null, mutate.toString());
  }
});

test("v5 requires every territory field and each authored parcel instead of repairing current data", () => {
  const valid = currentCampaign();
  assert.equal(validateState(valid), true);
  const absent = structuredClone(valid) as unknown as Record<string, any>;
  delete absent.territory;
  assert.equal(migrateState(absent), null);
  for (const key of Object.keys(valid.territory)) {
    const invalid = structuredClone(valid) as unknown as Record<string, any>;
    delete invalid.territory[key];
    assert.equal(validateState(invalid), false, `missing territory.${key}`);
    assert.equal(migrateState(invalid), null, `missing territory.${key}`);
  }
  for (const id of ["oak-hollow", "stone-rise"]) {
    const invalid = structuredClone(valid) as unknown as Record<string, any>;
    delete invalid.territory.parcels[id];
    assert.equal(migrateState(invalid), null, `missing parcel ${id}`);
  }
});

test("v5 parcel ownership, construction, dates and warehouse stock satisfy legal and physical limits", () => {
  const valid = estateCampaign();
  assert.equal(validateState(valid), true);
  const mutations: ((state: GameState) => void)[] = [
    (state) => { state.territory.parcels["oak-hollow"].owned = false; },
    (state) => { state.territory.parcels["oak-hollow"].registeredDay = null; },
    (state) => { state.territory.parcels["oak-hollow"].registeredDay = 13; },
    (state) => { state.territory.parcels["oak-hollow"].registeredDay = 0; },
    (state) => { state.territory.parcels["oak-hollow"].building = "none"; },
    (state) => { state.territory.parcels["oak-hollow"].building = "shelter"; },
    (state) => { state.territory.parcels["oak-hollow"].condition = 101; },
    (state) => { state.territory.parcels["oak-hollow"].storage.wood = -1; },
    (state) => { state.territory.parcels["oak-hollow"].storage.wood = 0.5; },
    (state) => { state.territory.parcels["oak-hollow"].storage.stone = 80; },
    (state) => { delete (state.territory.parcels["oak-hollow"].storage as Partial<GameState["inventory"]>).herb; },
    (state) => { (state.territory.parcels["oak-hollow"].storage as Record<string, number>).dragon = 1; },
    (state) => { state.territory.parcels["stone-rise"].registeredDay = 1; },
    (state) => { state.territory.parcels["stone-rise"].condition = 1; },
    (state) => { state.territory.parcels["stone-rise"].owned = true; state.territory.parcels["stone-rise"].registeredDay = 8; },
    (state) => { state.territory.lastTaxDay = 13; },
    (state) => { state.territory.arrears = 0.5; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(migrateState(invalid), null, mutate.toString());
  }
  const full = structuredClone(valid);
  full.territory.parcels["oak-hollow"].storage = { ...emptyStorage(), stone: 40 };
  assert.equal(validateState(full), true, "exactly 120 weight fits a warehouse");
  full.territory.parcels["oak-hollow"].storage.herb = 1;
  assert.equal(validateState(full), false, "stock exceeding 120 weight is rejected");
  const overdue = structuredClone(valid);
  overdue.territory.parcels["oak-hollow"].condition = 0;
  overdue.territory.arrears = 40;
  assert.equal(validateState(overdue), true, "decay and unpaid taxes preserve the warehouse goods");
  valid.territory.charter = true;
  valid.territory.deeds.push("frontier:survey-trails");
  valid.territory.influence = 13;
  valid.territory.parcels["stone-rise"] = { owned: true, registeredDay: 9, building: "shelter", condition: 75, storage: emptyStorage() };
  assert.equal(validateState(valid), true, "a charter permits the second authored estate");
});

test("canonical deeds are unique, bounded and agree with earned influence", () => {
  const valid = estateCampaign();
  const mutations: ((state: GameState) => void)[] = [
    (state) => { state.territory.influence++; },
    (state) => { state.territory.influence = Number.NaN; },
    (state) => { state.territory.deeds.push(state.territory.deeds[0]); },
    (state) => { state.territory.deeds.push("frontier:fake-job"); },
    (state) => { state.territory.deeds.push("civic:order-0-bread"); },
    (state) => { state.territory.deeds.push("civic:order-1-sword"); },
    (state) => { state.territory.deeds = Array.from({ length: 7 }, (_, index) => `civic:order-${index + 1}-bread`); state.territory.influence = 21; },
    (state) => { state.territory.deeds = ["civic:order-9007199254740992-bread"]; state.territory.influence = 3; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(validateState(invalid), false, mutate.toString());
    assert.equal(migrateState(invalid), null, mutate.toString());
  }
  const unlanded = currentCampaign();
  unlanded.territory.deeds = ["frontier:survey-trails", "frontier:mine-supply", "frontier:healing-herbs"];
  unlanded.territory.influence = 12;
  unlanded.territory.charter = true;
  assert.equal(validateState(unlanded), false, "a charter cannot exist without landed property");
  const unearned = estateCampaign();
  unearned.territory.charter = true;
  assert.equal(validateState(unearned), false, "the charter requires at least 12 lasting influence");
  const debtWithoutEstate = currentCampaign();
  debtWithoutEstate.territory.arrears = 1;
  assert.equal(validateState(debtWithoutEstate), false, "territorial debt requires an estate or a charter");
});

test("territory round trips preserve goods, debt and earned services in JSON and durable storage", async () => {
  const state = estateCampaign();
  const text = exportCampaign(state);
  const parsed = parseCampaign(text);
  assert.deepEqual(parsed, state);
  parsed.territory.parcels["oak-hollow"].storage.ore = 0;
  assert.equal(state.territory.parcels["oak-hollow"].storage.ore, 8);
  const stored = await saveGame(state);
  assert.deepEqual(await loadGame(), stored);
  assert.deepEqual(stored.territory, state.territory);
  const imported = await importCampaign(text);
  assert.deepEqual(imported.territory, state.territory);
  assert.equal(imported.day, state.day);
  assert.equal(imported.minutes, state.minutes);
});

test("a damaged v5 current record recovers a historical v3 backup without modifying either file", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const old = historicalV3();
  old.savedAt = 1000;
  old.gold = 93;
  const invalid = estateCampaign();
  invalid.savedAt = 2000;
  invalid.territory.parcels["oak-hollow"].storage.stone = 999;
  const values = new Map([["kingdom-gods:save", JSON.stringify(invalid)], ["kingdom-gods:backup", JSON.stringify(old)]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try {
    const restored = await loadGame();
    assert.equal(restored?.version, 5);
    assert.equal(restored?.gold, 93);
    assert.match(getPersistenceError() ?? "", /backup/);
    assert.equal(values.get("kingdom-gods:save"), JSON.stringify(invalid));
    assert.equal(values.get("kingdom-gods:backup"), JSON.stringify(old));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

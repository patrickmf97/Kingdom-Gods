import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import { migrateState, validateState } from "../src/persistence";
import { loadGame, saveGame, clearSavedGame } from "../src/persistence";
import { exportCampaign, parseCampaign, importCampaign, MAX_CAMPAIGN_BYTES } from "../src/campaign-files";
import { RESOURCE_NODES } from "../src/regions";
import type { GameState, Person } from "../src/types";

function v2Snapshot() {
  const state = structuredClone(initialState()) as unknown as Record<string, any>;
  state.version = 2;
  delete state.wildlife;
  delete state.frontier;
  delete state.life;
  delete state.territory;
  delete state.apostle.skills.woodcutting;
  delete state.apostle.skills.herbalism;
  return state;
}

test("upgrades a valid v2 campaign to v6 without changing saved time or holdings", () => {
  const old = v2Snapshot();
  old.day = 187;
  old.minutes = 712;
  old.gold = 317;
  old.futureExtension = { route: ["market"] };
  const before = structuredClone(old);
  const upgraded = migrateState(old);
  assert.ok(upgraded);
  assert.equal(upgraded.version, 6);
  assert.equal(validateState(upgraded), true);
  assert.equal(upgraded.day, 187);
  assert.equal(upgraded.minutes, 712);
  assert.equal(upgraded.gold, 317);
  assert.deepEqual(old, before);
  assert.equal(upgraded.apostle.skills.woodcutting, 0);
  assert.equal(upgraded.apostle.skills.herbalism, 0);
  assert.ok(upgraded.frontier);
  assert.ok(upgraded.life);
});

test("migration preserves valid numeric skill extensions introduced ahead of the current schema", () => {
  const old = v2Snapshot();
  old.apostle.skills.woodcutting = 37;
  old.apostle.skills.herbalism = 18;
  old.apostle.skills.fishing = 12.5;
  const before = structuredClone(old);
  const upgraded = migrateState(old);
  assert.ok(upgraded);
  assert.deepEqual(upgraded.apostle.skills, old.apostle.skills);
  assert.deepEqual(old, before);
  upgraded.apostle.skills.fishing = 40;
  assert.equal(old.apostle.skills.fishing, 12.5);
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, "37"]) {
    const invalid = structuredClone(old);
    invalid.apostle.skills.woodcutting = value;
    assert.equal(migrateState(invalid), null, `invalid extension ${value}`);
  }
});

test("migration keeps every historically valid NPC identifier in persistent needs", () => {
  for (const id of ["farmer-" + "a".repeat(200), ""]) {
    const old = v2Snapshot();
    old.npcs[0].id = id;
    const upgraded = migrateState(old);
    assert.ok(upgraded, `valid legacy identifier length ${id.length}`);
    assert.equal(validateState(upgraded), true);
    assert.deepEqual(upgraded.life.needs[id], { hunger: 20, fatigue: 10, goal: "work" });
  }
});

test("portable campaign files have export, preview and durable import APIs", async () => {
  const module = await import("../src/campaign-files").catch(() => null);
  assert.ok(module, "portable campaign module is available");
  assert.equal(typeof module.exportCampaign, "function");
  assert.equal(typeof module.parseCampaign, "function");
  assert.equal(typeof module.importCampaign, "function");
});

function currentCampaign(): GameState {
  const state = migrateState(v2Snapshot());
  assert.ok(state);
  state.phase = "playing";
  state.started = true;
  state.intro = false;
  return state;
}

function livedCampaign(): GameState {
  const state = currentCampaign();
  const partner: Person = {
    id: "mira", name: "Mira", surname: "Valen", sex: "female", skin: "#d3a17b",
    hair: "#493327", eyes: "#7ca078", outfit: "#a9806d", age: 22, birthDay: -7919,
    alive: true, generation: 1, parents: [], title: "Companheira", partnerId: state.apostle.id,
  };
  const child: Person = {
    ...partner, id: "child-1", name: "Aelia", age: 8, birthDay: -2879,
    generation: 2, parents: [state.apostle.id, partner.id], partnerId: undefined,
    title: "Herdeira",
  };
  delete child.partnerId;
  state.family = [partner, child];
  state.apostle.partnerId = partner.id;
  state.life.heirId = child.id;
  state.life.education[child.id] = {
    focus: "mining", guardianId: partner.id, practice: 12, bond: 64, lessons: 3, lastLessonDay: 1,
  };
  state.life.history = [{ day: 1, kind: "birth", personId: child.id,
    relatedId: state.apostle.id, text: "Aelia nasceu na Casa Valen.", gold: 0, property: false }];
  const node = RESOURCE_NODES.find((entry) => entry.id === "mine-iron-west")!;
  state.zone = "mine";
  state.apostle.x = node.x;
  state.apostle.y = node.y + 40;
  state.frontier.tools.pickaxe = { owned: true, durability: 84 };
  state.frontier.resources[node.id].remaining = 2;
  state.frontier.work = { nodeId: node.id, zone: node.zone, duration: node.duration, elapsed: 1.25 };
  state.frontier.discovered = ["wild-camp", "wild-ruins", "wild-lake", "wild-mine"];
  const survey = state.frontier.jobs.find((entry) => entry.id === "survey-trails")!;
  survey.status = "complete";
  state.frontier.escrow = survey.reward;
  return state;
}

test("rejects damaged v2 saves before creating tools, needs or new skill defaults", () => {
  const mutations: ((state: ReturnType<typeof v2Snapshot>) => void)[] = [
    (state) => { delete state.economy; },
    (state) => { delete state.inventory.flour; },
    (state) => { delete state.apostle.skills.smithing; },
    (state) => { state.economy.civicFunds = -1; },
    (state) => { state.zone = "mine"; },
    (state) => { state.gold = 0.5; },
  ];
  for (const mutate of mutations) {
    const old = v2Snapshot();
    mutate(old);
    assert.equal(migrateState(old), null, mutate.toString());
  }
});

test("current v5 requires complete frontier and life state instead of repairing corruption", () => {
  const valid = livedCampaign();
  assert.equal(validateState(valid), true);
  for (const root of ["frontier", "life"] as const) {
    for (const key of Object.keys(valid[root])) {
      const invalid = structuredClone(valid);
      delete (invalid[root] as unknown as Record<string, unknown>)[key];
      assert.equal(validateState(invalid), false, `missing ${root}.${key}`);
      assert.equal(migrateState(invalid), null, `missing ${root}.${key}`);
    }
  }
  for (const skill of ["woodcutting", "herbalism"]) {
    const invalid = structuredClone(valid);
    delete invalid.apostle.skills[skill];
    assert.equal(migrateState(invalid), null, `missing ${skill}`);
  }
});

test("resource reserves, tools and discovery must match authored resource limits", () => {
  const valid = livedCampaign();
  const mutations: ((state: GameState) => void)[] = [
    (state) => { delete state.frontier.resources["wild-oak"]; },
    (state) => { state.frontier.resources.fake = { remaining: 1, readyDay: null }; },
    (state) => { state.frontier.resources["wild-oak"].remaining = 999; },
    (state) => { state.frontier.resources["wild-oak"].remaining = 0.5; },
    (state) => { state.frontier.resources["wild-oak"].remaining = 0; },
    (state) => { state.frontier.resources["wild-oak"].readyDay = 2; },
    (state) => { state.frontier.tools.pickaxe.durability = 101; },
    (state) => { state.frontier.tools.axe.durability = 50; },
    (state) => { state.frontier.toolStock.axe = 4; },
    (state) => { state.frontier.toolStock.pickaxe = 0.5; },
    (state) => { state.frontier.discovered.push("imaginary-lake"); },
    (state) => { state.frontier.discovered.push("wild-camp"); },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(validateState(invalid), false, mutate.toString());
  }
  valid.frontier.resources["wild-oak"] = { remaining: 0, readyDay: 1 };
  valid.day = 10;
  assert.equal(validateState(valid), true, "a regeneration date already due is valid until the next tick");
});

test("interrupted work can resume only for its real nearby resource and usable tool", () => {
  const valid = livedCampaign();
  const mutations: ((state: GameState) => void)[] = [
    (state) => { state.frontier.work!.nodeId = "fake-ore"; },
    (state) => { state.frontier.work!.duration = 1; },
    (state) => { state.frontier.work!.elapsed = -1; },
    (state) => { state.frontier.work!.elapsed = 4.1; },
    (state) => { state.frontier.work!.elapsed = Infinity; },
    (state) => { state.frontier.work!.zone = "village"; },
    (state) => { state.zone = "wilderness"; },
    (state) => { state.apostle.x += 1000; },
    (state) => { state.frontier.tools.pickaxe.durability = 0; },
    (state) => { state.frontier.tools.pickaxe = { owned: false, durability: 0 }; },
    (state) => { state.apostle.alive = false; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(migrateState(invalid), null, mutate.toString());
  }
});

test("job escrow records exactly the finite preset rewards still reserved for the apostle", () => {
  const valid = livedCampaign();
  const mutations: ((state: GameState) => void)[] = [
    (state) => { state.frontier.escrow++; },
    (state) => { state.frontier.jobs[0].reward++; },
    (state) => { state.frontier.jobs[0].targets.push("wild-oak"); },
    (state) => { state.frontier.jobs[1].quantity = 400; },
    (state) => { state.frontier.jobs[1].item = "sword"; },
    (state) => { state.frontier.jobs[1].kind = "survey"; },
    (state) => { state.frontier.jobs[1].deadline = 999999; },
    (state) => { state.frontier.jobs[1].id = state.frontier.jobs[0].id; },
    (state) => { state.frontier.jobs.pop(); },
    (state) => { state.frontier.discovered = []; },
    (state) => { state.gold = Number.MAX_SAFE_INTEGER - state.merchantGold - state.economy.civicFunds; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(validateState(invalid), false, mutate.toString());
  }
});

test("education, guardian and heir records preserve family rules and bounded needs", () => {
  const valid = livedCampaign();
  const mutations: ((state: GameState) => void)[] = [
    (state) => { delete state.life.needs.mira; },
    (state) => { delete state.life.education["child-1"]; },
    (state) => { state.life.needs.mira.hunger = 101; },
    (state) => { state.life.needs.mira.fatigue = -1; },
    (state) => { state.life.education["child-1"].practice = 101; },
    (state) => { state.life.education["child-1"].bond = -1; },
    (state) => { state.life.education["child-1"].lessons = 0.5; },
    (state) => { state.life.education["child-1"].guardianId = "missing"; },
    (state) => { state.life.guardianId = state.apostle.id; },
    (state) => { state.life.guardianId = "child-1"; },
    (state) => { state.life.heirId = "guard"; },
    (state) => { state.family[1].alive = false; },
    (state) => { state.family[0].alive = false; },
    (state) => { state.life.history[0].gold = -1; },
    (state) => { state.life.history[0].personId = "unknown-child"; },
    (state) => { state.life.history = Array.from({ length: 81 }, () => state.life.history[0]); },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(validateState(invalid), false, mutate.toString());
  }
});

test("portable JSON round trip retains mine work, family, escrow and independent extensions", () => {
  const state = livedCampaign() as GameState & { futureExtension?: { route: string[] } };
  state.futureExtension = { route: ["wild-mine", "mine-iron-west"] };
  const before = structuredClone(state);
  const text = exportCampaign(state);
  const envelope = JSON.parse(text);
  assert.equal(envelope.format, "kingdom-gods-campaign");
  assert.equal(envelope.version, 1);
  assert.equal(envelope.campaign.version, 6);
  const restored = parseCampaign(text) as typeof state;
  assert.deepEqual(restored, state);
  restored.futureExtension!.route.push("mine-exit");
  assert.deepEqual(state, before);
  assert.deepEqual(parseCampaign(text), before);
});

test("portable parser accepts raw historical JSON and rejects unsafe or malformed files", () => {
  const legacy = v2Snapshot();
  const restored = parseCampaign(JSON.stringify(legacy));
  assert.equal(restored.version, 6);
  assert.equal(restored.day, legacy.day);
  assert.equal(restored.gold, legacy.gold);
  const invalid = livedCampaign();
  invalid.frontier.jobs[0].reward++;
  for (const text of ["{", "null", "[]", JSON.stringify(invalid),
    JSON.stringify({ format: "another-game", version: 1, exportedAt: 1, campaign: livedCampaign() }),
    JSON.stringify({ format: "kingdom-gods-campaign", version: 999, exportedAt: 1, campaign: livedCampaign() })]) {
    assert.throws(() => parseCampaign(text), /campanha|JSON/);
  }
  assert.throws(() => parseCampaign(" ".repeat(MAX_CAMPAIGN_BYTES + 1)), /2 MiB/);
  assert.throws(() => parseCampaign("á".repeat(MAX_CAMPAIGN_BYTES / 2 + 1)), /2 MiB/);
});

function storageHarness(failCurrent = false) {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failCurrent && key === "kingdom-gods:save") throw new Error("quota");
      values.set(key, String(value));
    },
    removeItem: (key: string) => values.delete(key),
  } });
  return { values, restore() {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  } };
}

test("import writes validated campaign atomically and keeps the previous campaign as backup", async () => {
  const storage = storageHarness();
  try {
    const previous = currentCampaign();
    previous.gold = 48;
    previous.savedAt = 1200;
    storage.values.set("kingdom-gods:save", JSON.stringify(previous));
    const incoming = livedCampaign();
    incoming.gold = 217;
    const imported = await importCampaign(exportCampaign(incoming));
    assert.equal(imported.gold, 217);
    assert.ok(imported.savedAt! > previous.savedAt);
    assert.deepEqual(JSON.parse(storage.values.get("kingdom-gods:backup")!), previous);
    assert.deepEqual(await loadGame(), imported);
    assert.deepEqual(imported.frontier.work, incoming.frontier.work);
    assert.deepEqual(imported.life, incoming.life);
    assert.equal(imported.minutes, incoming.minutes);
  } finally { storage.restore(); }
});

test("invalid import or a storage failure leaves the previous playable campaign intact", async () => {
  for (const failCurrent of [false, true]) {
    const storage = storageHarness(failCurrent);
    try {
      const previous = currentCampaign();
      previous.gold = 48;
      storage.values.set("kingdom-gods:save", JSON.stringify(previous));
      if (failCurrent) await assert.rejects(importCampaign(exportCampaign(livedCampaign())), /quota/);
      else await assert.rejects(importCampaign('{"version":3}'), /campanha válida/);
      assert.deepEqual(JSON.parse(storage.values.get("kingdom-gods:save")!), previous);
      assert.equal((await loadGame())!.gold, 48);
    } finally { storage.restore(); }
  }
});

test("persistent v5 round trip never advances time or discards unfinished physical work", async () => {
  await clearSavedGame();
  const state = livedCampaign();
  const stored = await saveGame(state);
  const loaded = await loadGame();
  assert.deepEqual(loaded, stored);
  assert.equal(loaded!.version, 6);
  assert.equal(loaded!.day, state.day);
  assert.equal(loaded!.minutes, state.minutes);
  assert.deepEqual(loaded!.frontier, state.frontier);
  assert.deepEqual(loaded!.life, state.life);
  assert.notEqual(stored.savedAt, state.savedAt);
  loaded!.frontier.work!.elapsed = 0;
  assert.equal((await loadGame())!.frontier.work!.elapsed, 1.25);
  await clearSavedGame();
});

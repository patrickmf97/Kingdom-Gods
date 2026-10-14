import test from "node:test";
import assert from "node:assert/strict";
import * as persistence from "../src/persistence";
import type { GameState } from "../src/types";
import { createFrontierState } from "../src/frontier";
import { createLifeState } from "../src/life";

// The original eight-item/six-skill format from commit 0bb2e8f, advanced to a
// lived-in campaign so migration has actual family, crops and memories to retain.
function legacySnapshot() {
  const memory = {
    id: "old-farewell",
    day: 1,
    title: "A despedida",
    text: "Elara confiou em Rowan.",
    emotion: "gratidão",
    intensity: 65,
  };
  return {
    version: 1,
    started: true,
    intro: false,
    phase: "playing",
    apostle: {
      id: "apostle-1",
      name: "Rowan",
      surname: "Valen",
      sex: "male",
      skin: "#d3a17b",
      hair: "#493327",
      eyes: "#7ca078",
      outfit: "#6d8866",
      age: 16,
      birthDay: -5759,
      alive: true,
      generation: 1,
      parents: [],
      partnerId: "mira",
      title: "Órfão de Valeverde",
      x: 1900,
      y: 1030,
      hp: 109,
      maxHp: 125,
      stamina: 92,
      maxStamina: 120,
      blessing: "vigor",
      attributes: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        perception: 10,
        will: 10,
        vitality: 125,
        endurance: 13,
        energy: 120,
      },
      skills: {
        sword: 3,
        farming: 6,
        mining: 1,
        trading: 2,
        building: 4,
        leadership: 0,
      },
      personality: { compassion: 55, courage: 50, loyalty: 60, anger: 15 },
      memories: [memory],
      equipment: "sword",
    },
    gold: 237,
    inventory: {
      bread: 6,
      wood: 4,
      stone: 3,
      wheat: 9,
      seed: 2,
      sword: 1,
      herb: 1,
      ore: 5,
    },
    minutes: 731,
    day: 185,
    timeScale: 6,
    zone: "village",
    npcs: [
      {
        id: "farmer",
        name: "Lina",
        role: "Lavradora",
        x: 1830,
        y: 1040,
        homeX: 1770,
        homeY: 1210,
        color: "#9ca677",
        relation: 40,
        trust: 35,
        mood: "Esperançosa",
      },
    ],
    enemies: [
      { id: "skeleton-1", x: 360, y: 330, hp: 0, maxHp: 44, alive: false },
    ],
    market: {
      bread: 20,
      wood: 20,
      stone: 15,
      wheat: 18,
      seed: 12,
      sword: 3,
      herb: 10,
      ore: 4,
    },
    merchantGold: 450,
    property: {
      owned: true,
      id: "property",
      name: "Parcela do Moinho",
      cost: 180,
      kingdom: "Auren",
      plantedAt: 184,
      harvests: 4,
      building: true,
    },
    family: [
      {
        id: "mira",
        name: "Mira",
        surname: "Valen",
        sex: "female",
        skin: "#c69b76",
        hair: "#50362a",
        eyes: "#779787",
        outfit: "#a9806d",
        age: 23,
        birthDay: -8279,
        alive: true,
        generation: 1,
        parents: [],
        partnerId: "apostle-1",
        title: "Companheira",
      },
    ],
    quest: "claimed",
    kills: 3,
    messages: [{ id: 1, text: "Sua parcela floresce.", type: "success" }],
    savedAt: 1000,
    deaths: 0,
    simulation: {
      marriedAt: { mira: 4 },
      gathering: { tree1: 265731 },
      npcMemories: { farmer: [memory] },
      lastChildDay: -100,
      companionId: "farmer",
      autonomousUntil: 265740,
      autonomousReason: "Preservar a própria vida",
      futureExtension: { route: ["mill", "home"] },
    },
  };
}

function currentSnapshot(): GameState {
  const legacy = legacySnapshot();
  return {
    ...legacy,
    version: 3,
    apostle: {
      ...legacy.apostle,
      skills: { ...legacy.apostle.skills, cooking: 0, smithing: 0, woodcutting: 0, herbalism: 0 },
    },
    frontier: createFrontierState(legacy.day),
    life: createLifeState(legacy.npcs, legacy.family, legacy.apostle as GameState["apostle"]),
    inventory: { ...legacy.inventory, flour: 0 },
    market: { ...legacy.market, flour: 8 },
    economy: {
      condition: 100,
      crop: { season: "Outono", readyDay: 186, yield: 8 },
      worker: null,
      npcSavings: {},
      ledger: [],
      orders: [],
      civicFunds: 180,
      prosperity: 55,
      lastOrderDay: 0,
    },
  } as GameState;
}

test("migrates a populated original v1 campaign without mutating or losing saved life", () => {
  const legacy = legacySnapshot();
  const before = structuredClone(legacy);
  assert.equal(
    typeof persistence.migrateState,
    "function",
    "v1 snapshots need a migration entrypoint",
  );
  const migrated = persistence.migrateState(legacy);
  assert.ok(migrated);
  assert.equal(persistence.validateState(migrated), true);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.inventory.flour, 0);
  assert.equal(migrated.market.flour, 8);
  assert.equal(migrated.apostle.skills.cooking, 0);
  assert.equal(migrated.apostle.skills.smithing, 0);
  assert.deepEqual(migrated.economy, currentSnapshot().economy);
  assert.deepEqual(legacy, before);
  const { economy, frontier, life, ...rest } = migrated;
  const restoredLegacy = {
    ...rest,
    version: 1,
    inventory: { ...rest.inventory },
    market: { ...rest.market },
    apostle: { ...rest.apostle, skills: { ...rest.apostle.skills } },
  };
  delete (restoredLegacy.inventory as Partial<GameState["inventory"]>).flour;
  delete (restoredLegacy.market as Partial<GameState["market"]>).flour;
  delete restoredLegacy.apostle.skills.cooking;
  delete restoredLegacy.apostle.skills.smithing;
  delete restoredLegacy.apostle.skills.woodcutting;
  delete restoredLegacy.apostle.skills.herbalism;
  assert.deepEqual(restoredLegacy, before);
  migrated.apostle.memories[0].text = "Changed only in loaded game";
  assert.equal(
    legacy.apostle.memories[0].text,
    before.apostle.memories[0].text,
  );
});

test("migrates empty legacy crop and absent or partial simulation metadata", () => {
  const legacy = legacySnapshot();
  legacy.property.plantedAt = null as unknown as number;
  const { simulation, ...withoutSimulation } = legacy;
  const migrated = persistence.migrateState(withoutSimulation);
  assert.ok(migrated);
  assert.equal(migrated.economy.crop, null);
  assert.equal(Object.hasOwn(migrated, "simulation"), false);
  assert.ok(persistence.migrateState({ ...legacy, simulation: {} }));
});

test("preserves unknown legacy extensions in an independent migrated snapshot", () => {
  const legacy = {
    ...legacySnapshot(),
    futureExtension: { route: ["mill", "home"], optional: undefined },
    apostle: {
      ...legacySnapshot().apostle,
      futureExtension: { reputation: 17 },
    },
  };
  const migrated = persistence.migrateState(legacy);
  assert.ok(migrated);
  assert.deepEqual(
    (migrated as unknown as typeof legacy).futureExtension,
    legacy.futureExtension,
  );
  assert.deepEqual(
    (migrated.apostle as unknown as typeof legacy.apostle).futureExtension,
    legacy.apostle.futureExtension,
  );
  (migrated as unknown as typeof legacy).futureExtension.route.push("forge");
  assert.deepEqual(legacy.futureExtension.route, ["mill", "home"]);
});

test("v1 migration preserves preexisting valid numeric skills and item extensions", () => {
  const legacy = legacySnapshot();
  const skills = { ...legacy.apostle.skills, cooking: 11, smithing: 9,
    woodcutting: 37, herbalism: 18, fishing: 12.5 };
  const extended = { ...legacy,
    apostle: { ...legacy.apostle, skills },
    inventory: { ...legacy.inventory, flour: 6 },
    market: { ...legacy.market, flour: 11 },
  };
  const before = structuredClone(extended);
  const upgraded = persistence.migrateState(extended);
  assert.ok(upgraded);
  assert.deepEqual(upgraded.apostle.skills, skills);
  assert.equal(upgraded.inventory.flour, 6);
  assert.equal(upgraded.market.flour, 11);
  assert.deepEqual(extended, before);
  const invalid = structuredClone(extended);
  invalid.apostle.skills.cooking = -1;
  assert.equal(persistence.migrateState(invalid), null);
});

test("a legacy crop keeps its planting season across a calendar boundary", () => {
  const legacy = legacySnapshot();
  legacy.day = 271;
  legacy.property.plantedAt = 270;
  const migrated = persistence.migrateState(legacy);
  assert.ok(migrated);
  assert.deepEqual(migrated.economy.crop, {
    season: "Outono",
    readyDay: 272,
    yield: 8,
  });
});

test("rejects damaged legacy saves before adding v2 defaults", () => {
  const mutations = [
    (s: ReturnType<typeof legacySnapshot>) => {
      delete (s.inventory as Partial<typeof s.inventory>).ore;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      delete (s.market as Partial<typeof s.market>).seed;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      delete (s.apostle.skills as Partial<typeof s.apostle.skills>).farming;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      s.gold = -1;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      s.minutes = Number.NaN;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      s.apostle.hp = s.apostle.maxHp + 1;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      s.apostle.skills.sword = Number.POSITIVE_INFINITY;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      s.simulation.lastChildDay = 1.5;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      s.day = 0;
    },
    (s: ReturnType<typeof legacySnapshot>) => {
      s.version = 3;
    },
  ];
  for (const mutate of mutations) {
    const state = legacySnapshot();
    mutate(state);
    assert.equal(persistence.migrateState(state), null, mutate.toString());
  }
});

test("validates every retained economy field in a current snapshot and rejects corruption rather than repairing it", () => {
  const valid = currentSnapshot();
  valid.economy.worker = {
    npcId: "farmer",
    wage: 5,
    hiredDay: 182,
    loyalty: 61,
    unpaidDays: 0,
  };
  valid.economy.npcSavings = { farmer: 15 };
  valid.economy.ledger = [
    { day: 184, type: "wage", text: "Lina recebeu 5 coroas.", goldDelta: -5 },
  ];
  valid.economy.orders = [
    {
      id: "order-184",
      title: "Pão para a vila",
      item: "bread",
      quantity: 4,
      reward: 24,
      createdDay: 184,
      deadline: 187,
      status: "accepted",
    },
  ];
  assert.equal(persistence.validateState(valid), true);
  const mutations: ((s: GameState) => void)[] = [
    (s) => {
      delete (s as Partial<GameState>).economy;
    },
    (s) => {
      delete (s.inventory as Partial<GameState["inventory"]>).flour;
    },
    (s) => {
      delete (s.market as Partial<GameState["market"]>).flour;
    },
    (s) => {
      delete s.apostle.skills.cooking;
    },
    (s) => {
      delete s.apostle.skills.smithing;
    },
    (s) => {
      s.inventory.flour = 0.5;
    },
    (s) => {
      s.economy.condition = Number.NaN;
    },
    (s) => {
      s.economy.condition = 101;
    },
    (s) => {
      s.economy.condition = -1;
    },
    (s) => {
      s.economy.prosperity = -1;
    },
    (s) => {
      s.economy.prosperity = 101;
    },
    (s) => {
      s.economy.civicFunds = -1;
    },
    (s) => {
      s.economy.npcSavings.farmer = Number.POSITIVE_INFINITY;
    },
    (s) => {
      s.economy.npcSavings.farmer = -1;
    },
    (s) => {
      s.economy.crop!.readyDay = Number.NaN;
    },
    (s) => {
      s.economy.crop!.readyDay = 0.5;
    },
    (s) => {
      s.economy.crop!.yield = -1;
    },
    (s) => {
      s.economy.crop!.yield = 2.5;
    },
    (s) => {
      s.economy.crop!.season = "Snow" as never;
    },
    (s) => {
      s.economy.worker!.wage = 5.5;
    },
    (s) => {
      s.economy.worker!.hiredDay = -1;
    },
    (s) => {
      s.economy.worker!.loyalty = 101;
    },
    (s) => {
      s.economy.worker!.unpaidDays = 0.5;
    },
    (s) => {
      s.economy.lastOrderDay = Number.NaN;
    },
    (s) => {
      s.economy.orders[0].item = "coin" as never;
    },
    (s) => {
      s.economy.orders[0].quantity = 0;
    },
    (s) => {
      s.economy.orders[0].reward = -1;
    },
    (s) => {
      s.economy.orders[0].status = "complete" as never;
    },
    (s) => {
      s.economy.orders[0].deadline = 1;
    },
    (s) => {
      s.economy.orders[0].createdDay = 0.5;
    },
    (s) => {
      s.economy.orders[0].reward = Number.POSITIVE_INFINITY;
    },
    (s) => {
      s.economy.ledger[0].goldDelta = Number.NaN;
    },
    (s) => {
      delete (s.economy as Partial<GameState["economy"]>).orders;
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(persistence.validateState(invalid), false, mutate.toString());
    assert.equal(persistence.migrateState(invalid), null, mutate.toString());
  }
});

test("requires every current economy field and accepts only supported snapshot versions", () => {
  const valid = currentSnapshot();
  for (const key of Object.keys(valid.economy)) {
    const invalid = structuredClone(valid);
    delete (invalid.economy as unknown as Record<string, unknown>)[key];
    assert.equal(persistence.validateState(invalid), false, `missing ${key}`);
    assert.equal(persistence.migrateState(invalid), null, `missing ${key}`);
  }
  assert.equal(persistence.validateState(legacySnapshot()), false);
  for (const version of [0, 4, "3", undefined]) {
    assert.equal(persistence.migrateState({ ...valid, version }), null);
  }
  assert.equal(persistence.migrateState(null), null);
  assert.equal(persistence.migrateState([]), null);
});

test("current crops must match an owned planting and retain a real growing period", () => {
  const valid = currentSnapshot();
  valid.property.building = false;
  valid.day = 200;
  assert.equal(
    persistence.validateState(valid),
    true,
    "mature crops do not need a built house",
  );
  const mutations: ((s: GameState) => void)[] = [
    (s) => {
      s.economy.crop = null;
    },
    (s) => {
      s.property.plantedAt = null;
    },
    (s) => {
      s.property.owned = false;
    },
    (s) => {
      s.economy.crop!.readyDay = s.property.plantedAt!;
    },
    (s) => {
      s.economy.crop!.readyDay = s.property.plantedAt! - 1;
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(persistence.validateState(invalid), false, mutate.toString());
    assert.equal(persistence.migrateState(invalid), null, mutate.toString());
  }
  const empty = currentSnapshot();
  empty.property.plantedAt = null;
  empty.economy.crop = null;
  empty.property.owned = false;
  assert.equal(persistence.validateState(empty), true);
});

test("worker saves require a paid contract on a built estate and an available person", () => {
  const valid = currentSnapshot();
  valid.economy.worker = {
    npcId: "farmer",
    wage: 5,
    hiredDay: 182,
    loyalty: 61,
    unpaidDays: 2,
  };
  valid.economy.condition = 0;
  valid.phase = "dead";
  valid.apostle.alive = false;
  assert.equal(
    persistence.validateState(valid),
    true,
    "a suspended estate contract survives the apostle's death",
  );
  const mutations: ((s: GameState) => void)[] = [
    (s) => {
      s.economy.worker!.wage = 0;
    },
    (s) => {
      s.property.building = false;
    },
    (s) => {
      s.property.owned = false;
      s.property.plantedAt = null;
      s.economy.crop = null;
    },
    (s) => {
      s.economy.worker!.npcId = "missing-person";
    },
    (s) => {
      s.npcs = [];
    },
    (s) => {
      s.apostle.id = "farmer";
    },
    (s) => {
      s.family.push({ ...s.family[0], id: "farmer", alive: false });
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(persistence.validateState(invalid), false, mutate.toString());
    assert.equal(persistence.migrateState(invalid), null, mutate.toString());
  }
});

test("only one funded active order can coexist with uniquely identified past orders", () => {
  const valid = currentSnapshot();
  const order = {
    id: "active",
    title: "Pão para a vila",
    item: "bread" as const,
    quantity: 4,
    reward: 180,
    createdDay: 184,
    deadline: 187,
    status: "accepted" as const,
  };
  valid.economy.orders = [
    order,
    { ...order, id: "fulfilled", reward: 300, status: "fulfilled" },
    { ...order, id: "resolved", reward: 300, status: "resolved" },
    { ...order, id: "failed", reward: 300, status: "failed" },
  ];
  assert.equal(
    persistence.validateState(valid),
    true,
    "closed orders do not reserve their past rewards",
  );
  const mutations: ((s: GameState) => void)[] = [
    (s) => {
      s.economy.orders[0].reward = 181;
    },
    (s) => {
      s.economy.orders[0].status = "available";
      s.economy.orders[0].reward = 181;
    },
    (s) => {
      s.economy.orders[0].reward = 0;
    },
    (s) => {
      s.economy.orders[0].reward = 24;
      s.economy.orders.push({
        ...s.economy.orders[0],
        id: "second",
        reward: 24,
      });
    },
    (s) => {
      s.economy.orders[0].reward = 120;
      s.economy.orders.push({
        ...s.economy.orders[0],
        id: "second",
        reward: 120,
      });
    },
    (s) => {
      s.economy.orders[2].id = s.economy.orders[1].id;
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    assert.equal(persistence.validateState(invalid), false, mutate.toString());
    assert.equal(persistence.migrateState(invalid), null, mutate.toString());
  }
});

test("all saved coin holdings and their combined supply must be safe whole amounts", () => {
  const valid = currentSnapshot();
  valid.gold =
    Number.MAX_SAFE_INTEGER - valid.merchantGold - valid.economy.civicFunds;
  assert.equal(
    persistence.validateState(valid),
    true,
    "the largest exactly representable total remains valid",
  );
  const mutations: ((s: GameState) => void)[] = [
    (s) => {
      s.gold = 1e20;
    },
    (s) => {
      s.gold = 0.5;
    },
    (s) => {
      s.merchantGold = 1e20;
    },
    (s) => {
      s.merchantGold = 0.5;
    },
    (s) => {
      s.economy.civicFunds = 1e20;
    },
    (s) => {
      s.economy.civicFunds = 0.5;
    },
    (s) => {
      s.economy.npcSavings.farmer = 1e20;
    },
    (s) => {
      s.economy.npcSavings.farmer = 0.5;
    },
    (s) => {
      s.gold = Number.MAX_SAFE_INTEGER;
    },
    (s) => {
      s.economy.npcSavings.farmer = Number.MAX_SAFE_INTEGER;
    },
  ];
  for (const mutate of mutations) {
    const invalid = currentSnapshot();
    mutate(invalid);
    assert.equal(persistence.validateState(invalid), false, mutate.toString());
    assert.equal(persistence.migrateState(invalid), null, mutate.toString());
  }
});

function withStorage() {
  const values = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return {
    values,
    restore: () => {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else delete (globalThis as { localStorage?: Storage }).localStorage;
    },
  };
}

test("loads the newest valid migrated backup and leaves offline time paused", async () => {
  const storage = withStorage();
  try {
    const corrupt = currentSnapshot();
    delete (corrupt.inventory as Partial<GameState["inventory"]>).flour;
    corrupt.savedAt = 9000;
    const old = legacySnapshot();
    old.savedAt = 2000;
    storage.values.set("kingdom-gods:save", JSON.stringify(corrupt));
    storage.values.set("kingdom-gods:backup", JSON.stringify(old));
    assert.equal(await persistence.hasSavedGame(), true);
    const loaded = await persistence.loadGame();
    assert.ok(loaded);
    assert.equal(loaded.version, 3);
    assert.equal(loaded.day, old.day);
    assert.equal(loaded.minutes, old.minutes);
    assert.equal(loaded.savedAt, old.savedAt);
    assert.equal(loaded.property.plantedAt, 184);
    assert.equal(loaded.economy.crop!.readyDay, 186);
    assert.equal(loaded.economy.crop!.yield, 8);
    assert.match(persistence.getPersistenceError() ?? "", /backup/);
    assert.deepEqual(
      JSON.parse(storage.values.get("kingdom-gods:backup")!),
      old,
    );
  } finally {
    storage.restore();
  }
});

test("selects a newer valid legacy backup over an older current save", async () => {
  const storage = withStorage();
  try {
    const current = currentSnapshot();
    current.savedAt = 1000;
    const backup = legacySnapshot();
    backup.savedAt = 2000;
    backup.gold = 321;
    storage.values.set("kingdom-gods:save", JSON.stringify(current));
    storage.values.set("kingdom-gods:backup", JSON.stringify(backup));
    const loaded = await persistence.loadGame();
    assert.equal(loaded?.gold, 321);
    assert.equal(loaded?.version, 3);
  } finally {
    storage.restore();
  }
});

test("saving legacy input writes v3 and preserves a recoverable migrated prior snapshot", async () => {
  const storage = withStorage();
  try {
    const previous = legacySnapshot();
    storage.values.set("kingdom-gods:save", JSON.stringify(previous));
    const legacy = legacySnapshot();
    legacy.gold = 307;
    const untouched = structuredClone(legacy);
    await persistence.saveGame(legacy as unknown as GameState);
    assert.deepEqual(legacy, untouched);
    const stored = JSON.parse(
      storage.values.get("kingdom-gods:save")!,
    ) as GameState;
    const backup = JSON.parse(
      storage.values.get("kingdom-gods:backup")!,
    ) as GameState;
    assert.equal(persistence.validateState(stored), true);
    assert.equal(persistence.validateState(backup), true);
    assert.equal(stored.version, 3);
    assert.equal(stored.gold, 307);
    assert.ok(stored.savedAt! > previous.savedAt);
    assert.equal(backup.gold, previous.gold);
    const loaded = await persistence.loadGame();
    assert.deepEqual(loaded, stored);
    assert.equal(loaded!.day, legacy.day);
    assert.equal(loaded!.minutes, legacy.minutes);
  } finally {
    storage.restore();
  }
});

test("invalid current save leaves the previous campaign intact", async () => {
  const storage = withStorage();
  try {
    const old = currentSnapshot();
    storage.values.set("kingdom-gods:save", JSON.stringify(old));
    const invalid = currentSnapshot();
    delete invalid.apostle.skills.smithing;
    await assert.rejects(persistence.saveGame(invalid), /inválido/);
    assert.deepEqual(JSON.parse(storage.values.get("kingdom-gods:save")!), old);
  } finally {
    storage.restore();
  }
});

test("v3 round trip through the nonbrowser fallback preserves economic commitments", async () => {
  await persistence.clearSavedGame();
  const state = currentSnapshot();
  state.economy.worker = {
    npcId: "farmer",
    wage: 5,
    hiredDay: 182,
    loyalty: 68,
    unpaidDays: 1,
  };
  state.economy.npcSavings = { farmer: 25 };
  state.economy.orders = [
    {
      id: "order-184",
      title: "Farinha para a vila",
      item: "flour",
      quantity: 3,
      reward: 18,
      createdDay: 184,
      deadline: 187,
      status: "accepted",
    },
  ];
  await persistence.saveGame(state);
  const loaded = await persistence.loadGame();
  assert.ok(loaded);
  assert.equal(loaded.version, 3);
  assert.equal(loaded.day, state.day);
  assert.equal(loaded.minutes, state.minutes);
  assert.deepEqual(loaded.economy, state.economy);
  assert.deepEqual(state.savedAt, 1000);
  await persistence.clearSavedGame();
});

test("nonbrowser save and load retain independent unknown extension values", async () => {
  await persistence.clearSavedGame();
  const state = {
    ...currentSnapshot(),
    futureExtension: {
      optional: undefined,
      observedAt: new Date("2026-01-01T00:00:00Z"),
      route: ["mill"],
    },
  };
  await persistence.saveGame(state);
  const loaded = (await persistence.loadGame()) as typeof state | null;
  assert.ok(loaded);
  assert.deepEqual(loaded.futureExtension, state.futureExtension);
  loaded.futureExtension.route.push("home");
  assert.deepEqual(state.futureExtension.route, ["mill"]);
  assert.deepEqual(
    ((await persistence.loadGame()) as typeof state).futureExtension.route,
    ["mill"],
  );
  await persistence.clearSavedGame();
});

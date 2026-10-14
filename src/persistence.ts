import type { GameState } from "./types";
import { createEconomyState } from "./economy";

const DATABASE = "kingdom-gods";
const STORE = "snapshots";
const CURRENT = "current";
const BACKUP = "backup";
const LOCAL_CURRENT = "kingdom-gods:save";
const LOCAL_BACKUP = "kingdom-gods:backup";
const LEGACY_ITEMS = [
  "bread",
  "wood",
  "stone",
  "wheat",
  "seed",
  "sword",
  "herb",
  "ore",
] as const;
const ITEMS = [...LEGACY_ITEMS, "flour"] as const;
const ATTRIBUTES = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma",
  "perception",
  "will",
  "vitality",
  "endurance",
  "energy",
] as const;
const LEGACY_SKILLS = [
  "sword",
  "farming",
  "mining",
  "trading",
  "building",
  "leadership",
] as const;
const SKILLS = [...LEGACY_SKILLS, "cooking", "smithing"] as const;

let lastPersistenceError: string | null = null;
let memoryCurrent: GameState | null = null;
let memoryBackup: GameState | null = null;
let operations: Promise<void> = Promise.resolve();

export function getPersistenceError(): string | null {
  return lastPersistenceError;
}

type ObjectValue = Record<string, unknown>;

const object = (value: unknown): value is ObjectValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === "string";
const boolean = (value: unknown): value is boolean =>
  typeof value === "boolean";
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown): value is number =>
  number(value) && value >= 0;
const integer = (value: unknown): value is number =>
  number(value) && Number.isSafeInteger(value);
const count = (value: unknown): value is number => integer(value) && value >= 0;
const day = (value: unknown): value is number => count(value) && value >= 1;
const percentage = (value: unknown): value is number =>
  nonnegative(value) && value <= 100;
const choice = (value: unknown, values: readonly string[]) =>
  string(value) && values.includes(value);
const array = (value: unknown, check: (entry: unknown) => boolean) =>
  Array.isArray(value) && value.every(check);

function numericRecord(
  value: unknown,
  keys: readonly string[],
  whole = false,
): boolean {
  return (
    object(value) &&
    keys.every(
      (key) =>
        Object.hasOwn(value, key) &&
        (whole ? count(value[key]) : nonnegative(value[key])),
    )
  );
}

function person(value: unknown): value is ObjectValue {
  return (
    object(value) &&
    [
      "id",
      "name",
      "surname",
      "sex",
      "skin",
      "hair",
      "eyes",
      "outfit",
      "title",
    ].every((key) => string(value[key])) &&
    nonnegative(value.age) &&
    integer(value.birthDay) &&
    boolean(value.alive) &&
    count(value.generation) &&
    array(value.parents, string) &&
    (value.partnerId === undefined || string(value.partnerId))
  );
}

function memory(value: unknown): boolean {
  return (
    object(value) &&
    string(value.id) &&
    count(value.day) &&
    string(value.title) &&
    string(value.text) &&
    string(value.emotion) &&
    nonnegative(value.intensity)
  );
}

function health(value: ObjectValue): boolean {
  return (
    nonnegative(value.hp) &&
    number(value.maxHp) &&
    value.maxHp > 0 &&
    value.hp <= value.maxHp
  );
}

function apostle(
  value: unknown,
  items: readonly string[],
  skills: readonly string[],
): boolean {
  if (
    !person(value) ||
    !nonnegative(value.x) ||
    !nonnegative(value.y) ||
    !health(value)
  )
    return false;
  return (
    nonnegative(value.stamina) &&
    number(value.maxStamina) &&
    value.maxStamina > 0 &&
    value.stamina <= value.maxStamina &&
    choice(value.blessing, ["vigor", "wisdom", "fortune"]) &&
    numericRecord(value.attributes, ATTRIBUTES) &&
    numericRecord(value.skills, skills) &&
    object(value.skills) &&
    Object.values(value.skills).every(nonnegative) &&
    numericRecord(value.personality, [
      "compassion",
      "courage",
      "loyalty",
      "anger",
    ]) &&
    array(value.memories, memory) &&
    (value.equipment === null || choice(value.equipment, items))
  );
}

function npc(value: unknown): boolean {
  return (
    object(value) &&
    ["id", "name", "role", "color", "mood"].every((key) =>
      string(value[key]),
    ) &&
    ["x", "y", "homeX", "homeY"].every((key) => nonnegative(value[key])) &&
    nonnegative(value.relation) &&
    value.relation <= 100 &&
    nonnegative(value.trust) &&
    value.trust <= 100
  );
}

function enemy(value: unknown): boolean {
  return (
    object(value) &&
    string(value.id) &&
    nonnegative(value.x) &&
    nonnegative(value.y) &&
    health(value) &&
    boolean(value.alive)
  );
}

function property(value: unknown): boolean {
  return (
    object(value) &&
    boolean(value.owned) &&
    string(value.id) &&
    string(value.name) &&
    nonnegative(value.cost) &&
    string(value.kingdom) &&
    (value.plantedAt === null || nonnegative(value.plantedAt)) &&
    count(value.harvests) &&
    boolean(value.building)
  );
}

function simulation(value: unknown): boolean {
  if (value === undefined) return true;
  if (!object(value)) return false;
  const map = (entries: unknown, check: (entry: unknown) => boolean) =>
    entries === undefined ||
    (object(entries) && Object.values(entries).every(check));
  return (
    map(value.marriedAt, count) &&
    map(value.gathering, nonnegative) &&
    map(value.npcMemories, (entries) => array(entries, memory)) &&
    (value.lastChildDay === undefined || integer(value.lastChildDay)) &&
    (value.companionId === undefined || string(value.companionId)) &&
    (value.autonomousReason === undefined || string(value.autonomousReason)) &&
    (value.autonomousUntil === undefined || nonnegative(value.autonomousUntil))
  );
}

function baseState(
  value: unknown,
  items: readonly string[],
  skills: readonly string[],
): value is ObjectValue {
  return (
      object(value) &&
      boolean(value.started) &&
      boolean(value.intro) &&
      choice(value.phase, ["title", "creation", "playing", "dead"]) &&
      apostle(value.apostle, items, skills) &&
      nonnegative(value.gold) &&
      numericRecord(value.inventory, items, true) &&
      nonnegative(value.minutes) &&
      value.minutes < 1440 &&
      day(value.day) &&
      nonnegative(value.timeScale) &&
      choice(value.zone, ["village", "orphanage", "dungeon"]) &&
      array(value.npcs, npc) &&
      array(value.enemies, enemy) &&
      numericRecord(value.market, items, true) &&
      nonnegative(value.merchantGold) &&
      property(value.property) &&
      array(value.family, person) &&
      choice(value.quest, [
        "available",
        "accepted",
        "complete",
        "claimed",
        "expired",
      ]) &&
      count(value.kills) &&
      array(
        value.messages,
        (entry) =>
          object(entry) &&
          count(entry.id) &&
          string(entry.text) &&
          string(entry.type),
      ) &&
      (value.savedAt === null || count(value.savedAt)) &&
      count(value.deaths) &&
      simulation(value.simulation)
  );
}

function economy(value: unknown): boolean {
  return (
    object(value) &&
    percentage(value.condition) &&
    (value.crop === null ||
      (object(value.crop) &&
        choice(value.crop.season, ["Primavera", "Verão", "Outono", "Inverno"]) &&
        day(value.crop.readyDay) &&
        count(value.crop.yield) &&
        value.crop.yield > 0)) &&
    (value.worker === null ||
      (object(value.worker) &&
        string(value.worker.npcId) &&
        count(value.worker.wage) &&
        value.worker.wage > 0 &&
        day(value.worker.hiredDay) &&
        percentage(value.worker.loyalty) &&
        count(value.worker.unpaidDays))) &&
    object(value.npcSavings) &&
    Object.values(value.npcSavings).every(count) &&
    array(value.ledger, (entry) =>
      object(entry) &&
      day(entry.day) &&
      string(entry.type) &&
      string(entry.text) &&
      number(entry.goldDelta)) &&
    array(value.orders, (order) =>
      object(order) &&
      string(order.id) &&
      string(order.title) &&
      choice(order.item, ITEMS) &&
      count(order.quantity) &&
      order.quantity > 0 &&
      count(order.reward) &&
      order.reward > 0 &&
      day(order.createdDay) &&
      day(order.deadline) &&
      order.deadline >= order.createdDay &&
      choice(order.status, ["available", "accepted", "fulfilled", "resolved", "failed"])) &&
    count(value.civicFunds) &&
    percentage(value.prosperity) &&
    count(value.lastOrderDay)
  );
}

function economicRelations(state: GameState): boolean {
  const { property, economy, apostle } = state;
  const { crop, worker } = economy;
  if (
    property.plantedAt === null
      ? crop !== null
      : !property.owned || crop === null || crop.readyDay <= property.plantedAt
  )
    return false;
  if (
    worker &&
    (!property.owned ||
      !property.building ||
      worker.npcId === apostle.id ||
      !state.npcs.some((npc) => npc.id === worker.npcId) ||
      state.family.some((person) => person.id === worker.npcId && !person.alive))
  )
    return false;

  const ids = new Set<string>();
  let activeOrders = 0;
  let reservedFunds = 0;
  for (const order of economy.orders) {
    if (ids.has(order.id)) return false;
    ids.add(order.id);
    if (order.status === "available" || order.status === "accepted") {
      activeOrders++;
      reservedFunds += order.reward;
    }
  }
  if (activeOrders > 1 || reservedFunds > economy.civicFunds) return false;

  const holdings = [
    state.gold,
    state.merchantGold,
    economy.civicFunds,
    ...Object.values(economy.npcSavings),
  ];
  return holdings.every(count) && count(holdings.reduce((sum, coins) => sum + coins, 0));
}

/** Current snapshots are complete v2 states; missing fields are never repaired. */
export function validateState(value: unknown): value is GameState {
  try {
    return (
      baseState(value, ITEMS, SKILLS) &&
      value.version === 2 &&
      economy(value.economy) &&
      economicRelations(value as unknown as GameState)
    );
  } catch {
    // Unknown input can contain getters or proxies; validation must never crash loading.
    return false;
  }
}

/** Validate the original format before any defaults can hide damaged data. */
function validateLegacyState(value: unknown): value is ObjectValue {
  return baseState(value, LEGACY_ITEMS, LEGACY_SKILLS) && value.version === 1;
}

/** Upgrade an independent copy, keeping saved time and all existing extensions. */
export function migrateState(value: unknown): GameState | null {
  try {
    if (!object(value)) return null;
    if (value.version === 2) {
      if (!validateState(value)) return null;
      const snapshot: unknown = structuredClone(value);
      return validateState(snapshot) ? snapshot : null;
    }
    if (!validateLegacyState(value)) return null;
    const legacy = structuredClone(value);
    const legacyApostle = legacy.apostle as ObjectValue;
    const legacyProperty = legacy.property as ObjectValue;
    const snapshot = {
      ...legacy,
      version: 2,
      apostle: {
        ...legacyApostle,
        skills: { ...(legacyApostle.skills as ObjectValue), cooking: 0, smithing: 0 },
      },
      inventory: { ...(legacy.inventory as ObjectValue), flour: 0 },
      market: { ...(legacy.market as ObjectValue), flour: 8 },
      economy: createEconomyState(
        legacy.day as number,
        legacyProperty.plantedAt as number | null,
      ),
    };
    return validateState(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

function clone(state: GameState): GameState {
  // Keep portable saves serializable without discarding extensions in IndexedDB
  // or the nonbrowser store, both of which support structured values.
  JSON.stringify(state);
  return structuredClone(state);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const result = operations.then(action, action);
  operations = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function browser(): boolean {
  return typeof window !== "undefined" || typeof document !== "undefined";
}

function localStorageAccess(errors: string[]): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch (error) {
    errors.push(
      `O armazenamento deste navegador está indisponível: ${describe(error)}`,
    );
    return null;
  }
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DATABASE, 1);
    const timer = setTimeout(
      () =>
        fail(
          new Error("O banco de salvamentos demorou demais para responder."),
        ),
      3000,
    );
    function fail(error: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onerror = () =>
      fail(
        request.error ??
          new Error("Não foi possível abrir o banco de salvamentos."),
      );
    request.onblocked = () =>
      fail(new Error("Outra aba está bloqueando o banco de salvamentos."));
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(timer);
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

interface Candidate {
  state: GameState;
  backup: boolean;
}
interface ReadResult {
  candidates: Candidate[];
  errors: string[];
  hasBackend: boolean;
}

function consider(
  value: unknown,
  source: string,
  backup: boolean,
  result: ReadResult,
): void {
  if (value === undefined || value === null) return;
  const migrated = migrateState(value);
  if (migrated) {
    try {
      const snapshot = clone(migrated);
      if (validateState(snapshot)) {
        result.candidates.push({ state: snapshot, backup });
        return;
      }
    } catch {
      // IndexedDB can hold circular structures that are unsuitable for a portable save.
    }
  }
  result.errors.push(
    `${backup ? "O backup" : "A campanha salva"} no ${source === "database" ? "banco local" : "navegador"} está danificado ou usa uma versão incompatível.`,
  );
}

async function readDatabase(db: IDBDatabase): Promise<[unknown, unknown]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const store = transaction.objectStore(STORE);
    const current = store.get(CURRENT);
    const backup = store.get(BACKUP);
    transaction.oncomplete = () => resolve([current.result, backup.result]);
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error("Não foi possível ler a campanha salva."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("A leitura da campanha foi interrompida."),
      );
  });
}

async function readAll(): Promise<ReadResult> {
  const result: ReadResult = { candidates: [], errors: [], hasBackend: false };
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    if (db) {
      result.hasBackend = true;
      const [current, backup] = await readDatabase(db);
      consider(current, "database", false, result);
      consider(backup, "database", true, result);
    }
  } catch (error) {
    result.errors.push(
      `O banco de salvamentos está indisponível: ${describe(error)}`,
    );
  } finally {
    db?.close();
  }

  const storage = localStorageAccess(result.errors);
  if (storage) {
    result.hasBackend = true;
    for (const [key, isBackup] of [
      [LOCAL_CURRENT, false],
      [LOCAL_BACKUP, true],
    ] as const) {
      try {
        const serialized = storage.getItem(key);
        if (serialized !== null)
          consider(JSON.parse(serialized), "browser storage", isBackup, result);
      } catch (error) {
        result.errors.push(
          `Não foi possível ler ${isBackup ? "o backup" : "a campanha"} no navegador: ${describe(error)}`,
        );
      }
    }
  }
  if (!result.hasBackend && !browser()) {
    consider(memoryCurrent, "memory", false, result);
    consider(memoryBackup, "memory", true, result);
  }
  return result;
}

function newest(candidates: Candidate[]): Candidate | undefined {
  return candidates.sort(
    (a, b) =>
      (b.state.savedAt ?? 0) - (a.state.savedAt ?? 0) ||
      Number(a.backup) - Number(b.backup),
  )[0];
}

async function writeDatabase(
  db: IDBDatabase,
  state: GameState,
  previous: GameState | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const request = store.get(CURRENT);
    request.onsuccess = () => {
      const current = migrateState(request.result);
      const prior =
        current &&
        (!previous || (current.savedAt ?? 0) >= (previous.savedAt ?? 0))
          ? current
          : previous;
      if (prior) store.put(prior, BACKUP);
      store.put(state, CURRENT);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(
        transaction.error ??
          new Error("Não foi possível gravar a campanha no banco."),
      );
    transaction.onabort = () =>
      reject(
        transaction.error ??
          new Error("A gravação da campanha foi interrompida."),
      );
  });
}

export function saveGame(state: GameState): Promise<void> {
  return enqueue(async () => {
    lastPersistenceError = null;
    const migrated = migrateState(state);
    if (!migrated) {
      lastPersistenceError =
        "O estado da campanha está inválido e não pôde ser salvo.";
      throw new Error(lastPersistenceError);
    }
    let snapshot: GameState;
    try {
      snapshot = clone(migrated);
      if (!validateState(snapshot))
        throw new Error("Não foi possível preparar os dados da campanha.");
    } catch (error) {
      lastPersistenceError = `Não foi possível preparar o salvamento: ${describe(error)}`;
      throw new Error(lastPersistenceError);
    }
    const existing = await readAll();
    const previous = newest(existing.candidates)?.state ?? null;
    snapshot.savedAt = Math.max(Date.now(), (previous?.savedAt ?? 0) + 1);
    let db: IDBDatabase | null = null;
    try {
      db = await openDatabase();
      if (db) {
        await writeDatabase(db, snapshot, previous);
        lastPersistenceError = existing.errors.join(" ") || null;
        return;
      }
    } catch (error) {
      existing.errors.push(
        `O banco de salvamentos está indisponível: ${describe(error)}`,
      );
    } finally {
      db?.close();
    }

    const storage = localStorageAccess(existing.errors);
    if (storage) {
      try {
        // Write the backup first: a quota failure must leave the previous main save intact.
        if (previous) storage.setItem(LOCAL_BACKUP, JSON.stringify(previous));
        storage.setItem(LOCAL_CURRENT, JSON.stringify(snapshot));
        lastPersistenceError = existing.errors.join(" ") || null;
        return;
      } catch (error) {
        existing.errors.push(
          `O navegador não conseguiu salvar a campanha: ${describe(error)}`,
        );
      }
    }
    if (
      !browser() &&
      !existing.hasBackend &&
      !storage &&
      typeof indexedDB === "undefined"
    ) {
      memoryBackup = previous ? clone(previous) : null;
      memoryCurrent = snapshot;
      return;
    }
    lastPersistenceError =
      existing.errors.join(" ") ||
      "O armazenamento do navegador está indisponível. A campanha não pôde ser salva.";
    throw new Error(lastPersistenceError);
  });
}

export function loadGame(): Promise<GameState | null> {
  return enqueue(async () => {
    const result = await readAll();
    const candidate = newest(result.candidates);
    if (candidate?.backup)
      result.errors.push(
        "Uma campanha válida anterior foi recuperada do backup.",
      );
    lastPersistenceError = result.errors.join(" ") || null;
    // Loading never advances time or mutates the stored snapshot.
    return candidate ? clone(candidate.state) : null;
  });
}

export async function hasSavedGame(): Promise<boolean> {
  return (await loadGame()) !== null;
}

export function clearSavedGame(): Promise<void> {
  return enqueue(async () => {
    const errors: string[] = [];
    let db: IDBDatabase | null = null;
    try {
      db = await openDatabase();
      if (db)
        await new Promise<void>((resolve, reject) => {
          const transaction = db!.transaction(STORE, "readwrite");
          transaction.objectStore(STORE).clear();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () =>
            reject(
              transaction.error ??
                new Error("Não foi possível apagar a campanha salva."),
            );
          transaction.onabort = () =>
            reject(
              transaction.error ??
                new Error("A exclusão da campanha foi interrompida."),
            );
        });
    } catch (error) {
      errors.push(
        `Não foi possível limpar o banco de salvamentos: ${describe(error)}`,
      );
    } finally {
      db?.close();
    }
    const storage = localStorageAccess(errors);
    if (storage) {
      try {
        storage.removeItem(LOCAL_CURRENT);
        storage.removeItem(LOCAL_BACKUP);
      } catch (error) {
        errors.push(
          `Não foi possível limpar o armazenamento do navegador: ${describe(error)}`,
        );
      }
    }
    memoryCurrent = null;
    memoryBackup = null;
    lastPersistenceError = errors.join(" ") || null;
    if (lastPersistenceError) throw new Error(lastPersistenceError);
  });
}

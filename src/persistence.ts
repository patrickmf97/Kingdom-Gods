import type { GameState, Apostle, Npc, Person, ResourceNodeDefinition } from "./types";
import { CROP_MAX_WATERING, createEconomyState } from "./economy";
import { createFrontierState, FRONTIER_JOB_DEFS } from "./frontier";
import { createLifeState } from "./life";
import { LEGACY_RESOURCE_NODES, V5_RESOURCE_NODES, REGIONS, RESOURCE_NODES } from "./regions";
import { ITEMS as ITEM_DEFINITIONS } from "./data";
import { createTerritoryState, syncTerritoryDeeds } from "./territory";
import { territoryDeedValue, territoryInfluence } from "./territory-data";
import { ANIMAL_DEFS } from "./wildlife-data";
import { createWildlifeState, isAnimalHabitatPoint } from "./wildlife";
import { initializePopulation, RESIDENT_DEFINITIONS, VISITOR_DEFINITIONS } from "./population";

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
const V2_SKILLS = [...LEGACY_SKILLS, "cooking", "smithing"] as const;
const SKILLS = [...V2_SKILLS, "woodcutting", "herbalism"] as const;
const LEGACY_ZONES = ["village", "orphanage", "dungeon"] as const;
const HISTORICAL_ZONES = [...LEGACY_ZONES, "wilderness", "mine"] as const;
const ZONES = Object.keys(REGIONS);

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

function npc(value: unknown): value is ObjectValue {
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

function historicalNpc(value: unknown): boolean {
  // A future location must never be silently replaced with a migration default.
  return npc(value) && !Object.hasOwn(value, "zone");
}

function currentNpc(value: unknown): boolean {
  return npc(value) && choice(value.zone, ZONES);
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
  zones: readonly string[] = LEGACY_ZONES,
  checkNpc: (entry: unknown) => boolean = historicalNpc,
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
      choice(value.zone, zones) &&
      array(value.npcs, checkNpc) &&
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
        value.crop.yield > 0 &&
        (value.crop.watered === undefined || (count(value.crop.watered) && value.crop.watered <= CROP_MAX_WATERING)) &&
        (value.crop.lastWatered === undefined || day(value.crop.lastWatered)) &&
        (value.crop.fertile === undefined || boolean(value.crop.fertile)))) &&
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

const DISCOVERABLE_IDS = new Set(
  Object.values(REGIONS).flatMap((region) => region.objects.map((entry) => entry.id)),
);
// Keep historical validation independent of additions to the live world catalog.
const LEGACY_DISCOVERABLE_IDS = new Set([
  "mill", "bakery", "orphanage", "market", "forge", "inn", "house1",
  "property", "well", "dungeon", "sign", "wild-gate", "exit",
  "wild-village", "wild-mine", "mine-exit", "wild-camp", "wild-ruins",
  "wild-lake", "oak-hollow", "stone-rise",
  ...LEGACY_RESOURCE_NODES.map((node) => node.id),
]);

const V5_DISCOVERABLE_IDS = new Set([
  ...LEGACY_DISCOVERABLE_IDS, ...V5_RESOURCE_NODES.map((node) => node.id),
]);

function frontier(
  state: GameState,
  nodes: readonly ResourceNodeDefinition[] = RESOURCE_NODES,
  discoverableIds: ReadonlySet<string> = DISCOVERABLE_IDS,
  zones: readonly string[] = ZONES,
): boolean {
  const value: unknown = state.frontier;
  if (!object(value) || !object(value.tools) || !object(value.toolStock) ||
    !object(value.resources) || !count(value.escrow) ||
    !array(value.discovered, (id) => string(id) && discoverableIds.has(id)) ||
    !Array.isArray(value.discovered) ||
    new Set(value.discovered).size !== value.discovered.length) return false;
  const discovered = value.discovered as string[];

  for (const toolId of ["axe", "pickaxe"] as const) {
    const tool = value.tools[toolId];
    const stock = value.toolStock[toolId];
    if (!object(tool) || !boolean(tool.owned) || !percentage(tool.durability) ||
      (!tool.owned && tool.durability !== 0) || !count(stock) || stock > 3) return false;
  }
  if (Object.keys(value.resources).length !== nodes.length) return false;
  for (const node of nodes) {
    if (!Object.hasOwn(value.resources, node.id)) return false;
    const reserve = value.resources[node.id];
    if (!object(reserve) || !count(reserve.remaining) || reserve.remaining > node.capacity ||
      (reserve.remaining > 0 ? reserve.readyDay !== null : !day(reserve.readyDay))) return false;
  }

  if (value.work !== null) {
    const work = value.work;
    if (!object(work) || !string(work.nodeId) || !nonnegative(work.elapsed) ||
      !number(work.duration) || !choice(work.zone, zones)) return false;
    const node = nodes.find((entry) => entry.id === work.nodeId);
    if (!node || node.zone !== work.zone || state.zone !== work.zone ||
      work.duration !== node.duration || work.elapsed > node.duration + 1e-7 ||
      state.phase !== "playing" || !state.apostle.alive ||
      Math.hypot(state.apostle.x - node.x, state.apostle.y - node.y) > 120 ||
      !((value.resources[node.id] as ObjectValue).remaining as number > 0)) return false;
    if (node.tool) {
      const tool = value.tools[node.tool] as ObjectValue;
      if (!tool.owned || (tool.durability as number) <= 0) return false;
    }
  }

  if (!Array.isArray(value.jobs) || value.jobs.length !== FRONTIER_JOB_DEFS.length) return false;
  const ids = new Set<string>();
  let reserved = 0;
  for (const job of value.jobs) {
    if (!object(job) || !string(job.id) || ids.has(job.id)) return false;
    ids.add(job.id);
    const definition = FRONTIER_JOB_DEFS.find((entry) => entry.id === job.id);
    if (!definition || !string(job.title) || !string(job.description) ||
      job.kind !== definition.kind || job.item !== definition.item ||
      job.quantity !== definition.quantity || job.reward !== definition.reward ||
      !day(job.deadline) || job.deadline > state.day + definition.deadlineOffset ||
      !Array.isArray(job.targets) || job.targets.length !== definition.targets.length ||
      !job.targets.every((target, index) => target === definition.targets[index]) ||
      !choice(job.status, ["available", "accepted", "complete", "claimed", "resolved", "failed"])) return false;
    if (job.status === "accepted" || job.status === "complete") reserved += definition.reward;
    if (job.status === "complete" && job.kind === "survey" &&
      !job.targets.every((target) => discovered.includes(target as string))) return false;
  }
  return count(reserved) && reserved === value.escrow;
}

function life(state: GameState): boolean {
  const value: unknown = state.life;
  if (!object(value) || !object(value.needs) || !object(value.education) ||
    !Array.isArray(value.history) || value.history.length > 80) return false;
  const needs = value.needs;
  const education = value.education;
  if (!state.npcs.every((npc) => Object.hasOwn(needs, npc.id)) ||
    ![...state.family, state.apostle].every((person) =>
      !person.alive || person.age >= 16 || Object.hasOwn(education, person.id))) return false;
  if (!Object.values(value.needs).every((need) =>
    object(need) && percentage(need.hunger) &&
    percentage(need.fatigue) && choice(need.goal, ["work", "eat", "rest", "socialize"]))) return false;

  const family = new Map(state.family.map((entry) => [entry.id, entry]));
  const knownPerson = (id: unknown) => string(id) &&
    (id === state.apostle.id || family.has(id) || state.npcs.some((entry) => entry.id === id));
  const guardian = (id: unknown) => id === null || (string(id) && id !== state.apostle.id &&
    ((family.get(id)?.alive && family.get(id)!.age >= 16) ||
      (state.npcs.some((entry) => entry.id === id) &&
        (!family.has(id) || (family.get(id)!.alive && family.get(id)!.age >= 16)))));
  for (const [id, profile] of Object.entries(value.education)) {
    if ((id !== state.apostle.id && !family.has(id)) || !object(profile) ||
      !choice(profile.focus, ["farming", "mining", "wisdom"]) || !guardian(profile.guardianId) ||
      !percentage(profile.practice) || !percentage(profile.bond) || !count(profile.lessons) ||
      !count(profile.lastLessonDay) || profile.lastLessonDay > state.day) return false;
  }
  if (!guardian(value.guardianId)) return false;
  if (value.heirId !== null) {
    const heir = string(value.heirId) ? family.get(value.heirId) : undefined;
    if (!heir || !heir.alive || heir.id === state.apostle.id ||
      !(state.apostle.partnerId === heir.id || heir.partnerId === state.apostle.id ||
        heir.parents.includes(state.apostle.id))) return false;
  }
  return value.history.every((entry) => object(entry) && count(entry.day) && entry.day <= state.day &&
    choice(entry.kind, ["birth", "marriage", "death", "inheritance", "education"]) &&
    knownPerson(entry.personId) && (entry.relatedId === null || knownPerson(entry.relatedId)) &&
    string(entry.text) && count(entry.gold) && boolean(entry.property));
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
    ...(state.version >= 3 ? [state.frontier.escrow] : []),
  ];
  return holdings.every(count) && count(holdings.reduce((sum, coins) => sum + coins, 0));
}

function territory(state: GameState): boolean {
  const value: unknown = state.territory;
  if (!object(value) || !object(value.parcels) ||
    Object.keys(value.parcels).length !== 2 ||
    !percentage(value.influence) || !boolean(value.charter) ||
    !count(value.arrears) || !day(value.lastTaxDay) || value.lastTaxDay > state.day ||
    !Array.isArray(value.deeds) || value.deeds.length > 13 ||
    !value.deeds.every((deed) => string(deed) && territoryDeedValue(deed) !== null) ||
    new Set(value.deeds).size !== value.deeds.length ||
    value.deeds.filter((deed: string) => deed.startsWith("civic:")).length > 6 ||
    value.influence !== territoryInfluence(value.deeds)) return false;

  let owned = 0;
  for (const id of ["oak-hollow", "stone-rise"] as const) {
    const holding = value.parcels[id];
    if (!object(holding) || !boolean(holding.owned) ||
      !choice(holding.building, ["none", "warehouse", "shelter"]) ||
      !percentage(holding.condition) || !numericRecord(holding.storage, ITEMS, true) ||
      !object(holding.storage) || Object.keys(holding.storage).length !== ITEMS.length) return false;
    const stock = holding.storage;
    const empty = ITEMS.every((item) => stock[item] === 0);
    if (!holding.owned) {
      if (holding.registeredDay !== null || holding.building !== "none" ||
        holding.condition !== 0 || !empty) return false;
      continue;
    }
    owned++;
    if (!day(holding.registeredDay) || holding.registeredDay > state.day) return false;
    if (holding.building === "none" && (holding.condition !== 0 || !empty)) return false;
    if (holding.building !== "warehouse" && !empty) return false;
    const weight = ITEMS.reduce((sum, item) => sum +
      (stock[item] as number) * ITEM_DEFINITIONS[item].weight, 0);
    if (!Number.isFinite(weight) || weight > 120 + 1e-7) return false;
  }
  return (owned <= 1 || value.charter) &&
    (!value.charter || value.influence >= 12) &&
    (owned > 0 || value.charter || value.arrears === 0) &&
    (!value.charter || state.property.owned || owned > 0);
}

function wildlife(state: GameState): boolean {
  const value: unknown = state.wildlife;
  if (!object(value) || !object(value.animals) ||
    Object.keys(value.animals).length !== ANIMAL_DEFS.length ||
    !Array.isArray(value.observed) ||
    // Array iteration must inspect holes too: a sparse observation cannot be
    // represented in portable JSON without changing its saved meaning.
    !Array.from(value.observed).every((id) => string(id) && ANIMAL_DEFS.some((definition) => definition.id === id)) ||
    new Set(value.observed).size !== value.observed.length) return false;

  for (const definition of ANIMAL_DEFS) {
    if (!Object.hasOwn(value.animals, definition.id)) return false;
    const animal = value.animals[definition.id];
    if (!object(animal) || animal.id !== definition.id ||
      animal.species !== definition.species || animal.zone !== definition.zone ||
      !number(animal.x) || !number(animal.y) ||
      !isAnimalHabitatPoint(definition, { x: animal.x, y: animal.y }) ||
      !nonnegative(animal.facing) || animal.facing >= Math.PI * 2 ||
      !choice(animal.behavior, ["idle", "walk", "graze", "rest", "flee", "approach"]) ||
      !nonnegative(animal.wait) || animal.wait > 30 ||
      !percentage(animal.trust) || !percentage(animal.fear) ||
      !(animal.lastFedDay === null || (day(animal.lastFedDay) && animal.lastFedDay <= state.day)) ||
      !count(animal.seed) || animal.seed > 0xffffffff) return false;
    if (animal.target !== null &&
      (!object(animal.target) || !number(animal.target.x) || !number(animal.target.y) ||
        !isAnimalHabitatPoint(definition, { x: animal.target.x, y: animal.target.y }))) return false;
  }
  return true;
}

/** Frozen complete v7 contract, checked before any v8 defaults are introduced. */
export function validateV7State(value: unknown): value is GameState {
  try {
    return (
      baseState(value, ITEMS, SKILLS, ZONES, currentNpc) &&
      value.version === 7 &&
      npcRegions(value as unknown as GameState) &&
      economy(value.economy) &&
      frontier(value as unknown as GameState) &&
      life(value as unknown as GameState) &&
      territory(value as unknown as GameState) &&
      economicRelations(value as unknown as GameState) &&
      wildlife(value as unknown as GameState)
    );
  } catch {
    // Unknown input can contain getters or proxies; validation must never crash loading.
    return false;
  }
}

/** Reserved archived extensions must retain their exact JSON meaning on export. */
function portableJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || string(value) || boolean(value)) return true;
  if (number(value)) return true;
  if (typeof value !== "object" || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? Array.from(value).every(entry => portableJson(entry, ancestors))
    : Object.values(value).every(entry => portableJson(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function worldLife(state: GameState): boolean {
  const value: unknown = state.worldLife;
  if (!object(value) || !Array.isArray(value.residents) || !object(value.travelers) ||
    !object(value.storm) ||
    !Array.from(value.residents).every(id => string(id) &&
      RESIDENT_DEFINITIONS.some(definition => definition.id === id) &&
      (state.npcs.some(npc => npc.id === id) || state.family.some(person => person.id === id) || state.apostle.id === id)) ||
    new Set(value.residents).size !== value.residents.length ||
    (Object.hasOwn(value, "legacyExtension") && !portableJson(value.legacyExtension))) return false;
  for (const [id, traveler] of Object.entries(value.travelers)) {
    const definition = VISITOR_DEFINITIONS.find(definition => definition.id === id);
    if (!definition || !state.npcs.some(npc => npc.id === id) || !object(traveler) ||
      !count(traveler.routeIndex) || traveler.routeIndex >= definition.route.length ||
      !nonnegative(traveler.wait) || traveler.wait > Math.max(...definition.route.map(stop => stop.wait)) ||
      !numericRecord(traveler.stock, ITEMS, true) || !object(traveler.stock) ||
      Object.keys(traveler.stock).length !== ITEMS.length || !count(traveler.gold)) return false;
  }
  const storm = value.storm;
  if (!count(storm.sequence) || !nonnegative(storm.cooldown) || storm.cooldown > 50) return false;
  const event = (entry: unknown, duration: number) => {
    if (entry === null) return true;
    if (!object(entry) || !count(entry.id) || entry.id === 0 || entry.id > (storm.sequence as number) ||
      !choice(entry.zone, ["village", "wilderness", "highlands"]) || !number(entry.x) || !number(entry.y) ||
      !nonnegative(entry.remaining) || entry.remaining > duration) return false;
    const region = REGIONS[entry.zone as "village" | "wilderness" | "highlands"];
    // A saved target stays fixed if construction subsequently blocks its ground.
    return entry.x >= 9 && entry.y >= 9 && entry.x <= region.width - 9 && entry.y <= region.height - 9;
  };
  if (!event(storm.warning, 3.5) || !event(storm.impact, 1.2) ||
    (object(storm.warning) && object(storm.impact) &&
      (storm.warning === storm.impact || storm.warning.id === storm.impact.id))) return false;
  const holdings = [state.gold, state.merchantGold, state.economy.civicFunds,
    state.frontier.escrow, ...Object.values(state.economy.npcSavings),
    ...Object.values(value.travelers).map(traveler => (traveler as ObjectValue).gold as number)];
  return holdings.every(count) && count(holdings.reduce((sum, coins) => sum + coins, 0));
}

/** Current snapshots are complete v8 states; missing fields are never repaired. */
export function validateState(value: unknown): value is GameState {
  try {
    return object(value) && value.version === 8 &&
      validateV7State({ ...value, version: 7 }) && worldLife(value as unknown as GameState);
  } catch {
    return false;
  }
}

/** Validate the original format before any defaults can hide damaged data. */
function validateLegacyState(value: unknown): value is ObjectValue {
  return baseState(value, LEGACY_ITEMS, LEGACY_SKILLS) && value.version === 1;
}

function validateV2State(value: unknown): value is ObjectValue {
  return baseState(value, ITEMS, V2_SKILLS) && value.version === 2 &&
    economy(value.economy) && economicRelations(value as unknown as GameState);
}

function validateV3State(value: unknown): value is ObjectValue {
  return baseState(value, ITEMS, SKILLS, HISTORICAL_ZONES) && value.version === 3 &&
    economy(value.economy) &&
    frontier(value as unknown as GameState, LEGACY_RESOURCE_NODES, LEGACY_DISCOVERABLE_IDS, HISTORICAL_ZONES) &&
    life(value as unknown as GameState) && economicRelations(value as unknown as GameState);
}

function validateV4State(value: unknown): value is ObjectValue {
  return baseState(value, ITEMS, SKILLS, HISTORICAL_ZONES) && value.version === 4 &&
    economy(value.economy) &&
    frontier(value as unknown as GameState, LEGACY_RESOURCE_NODES, LEGACY_DISCOVERABLE_IDS, HISTORICAL_ZONES) &&
    life(value as unknown as GameState) && territory(value as unknown as GameState) &&
    economicRelations(value as unknown as GameState);
}

/** Keep the complete v5 contract separate from fields introduced by v6. */
function validateV5State(value: unknown): value is ObjectValue {
  return baseState(value, ITEMS, SKILLS, HISTORICAL_ZONES) && value.version === 5 &&
    // A reserved future field must not be silently replaced during migration.
    !Object.hasOwn(value, "wildlife") &&
    economy(value.economy) &&
    frontier(value as unknown as GameState, V5_RESOURCE_NODES, V5_DISCOVERABLE_IDS, HISTORICAL_ZONES) &&
    life(value as unknown as GameState) && territory(value as unknown as GameState) &&
    economicRelations(value as unknown as GameState);
}

function validateV6State(value: unknown): value is ObjectValue {
  return baseState(value, ITEMS, SKILLS, HISTORICAL_ZONES) && value.version === 6 &&
    economy(value.economy) &&
    frontier(value as unknown as GameState, V5_RESOURCE_NODES, V5_DISCOVERABLE_IDS, HISTORICAL_ZONES) &&
    life(value as unknown as GameState) && territory(value as unknown as GameState) &&
    economicRelations(value as unknown as GameState) && wildlife(value as unknown as GameState);
}

function companionId(state: GameState): unknown {
  const details = (state as unknown as ObjectValue).simulation;
  return object(details) ? details.companionId : undefined;
}

function npcRegions(state: GameState): boolean {
  return state.npcs.every((entry) => entry.id === "matron"
    ? entry.zone === "orphanage"
    : entry.zone !== "dungeon" ||
      (state.zone === "dungeon" && companionId(state) === entry.id));
}

/** Upgrade an independent copy, keeping saved time and all existing extensions. */
export function migrateState(value: unknown): GameState | null {
  try {
    if (!object(value)) return null;
    if (value.version === 8) {
      if (!validateState(value)) return null;
      const snapshot: unknown = structuredClone(value);
      return validateState(snapshot) ? snapshot : null;
    }
    if (value.version === 7) {
      if (!validateV7State(value)) return null;
      const snapshot = structuredClone(value) as GameState;
      const legacyExtension = snapshot.worldLife;
      snapshot.version = 8;
      snapshot.worldLife = {
        residents: [], travelers: {},
        storm: { sequence: 0, cooldown: 12, warning: null, impact: null },
        ...(Object.hasOwn(value, "worldLife") ? { legacyExtension } : {}),
      };
      initializePopulation(snapshot);
      return validateState(snapshot) ? snapshot : null;
    }
    if (value.version === 6) {
      if (!validateV6State(value)) return null;
      const snapshot = structuredClone(value) as unknown as GameState;
      snapshot.version = 7;
      snapshot.npcs = snapshot.npcs.map((entry) => ({ ...entry,
        zone: entry.id === "matron" ? "orphanage" :
          snapshot.zone === "dungeon" && companionId(snapshot) === entry.id
            ? "dungeon" : "village",
      }));
      const previousIds = new Set(V5_RESOURCE_NODES.map((node) => node.id));
      for (const node of RESOURCE_NODES) {
        if (!previousIds.has(node.id)) {
          snapshot.frontier.resources[node.id] = { remaining: node.capacity, readyDay: null };
        }
      }
      return validateV7State(snapshot) ? migrateState(snapshot) : null;
    }
    if (value.version === 5) {
      if (!validateV5State(value)) return null;
      const snapshot = {
        ...structuredClone(value), version: 6,
        wildlife: createWildlifeState(value.day as number),
      };
      return validateV6State(snapshot) ? migrateState(snapshot) : null;
    }
    if (value.version === 4) {
      if (!validateV4State(value)) return null;
      const snapshot = structuredClone(value) as unknown as GameState;
      snapshot.version = 5;
      const legacyIds = new Set(LEGACY_RESOURCE_NODES.map((node) => node.id));
      for (const node of V5_RESOURCE_NODES) {
        if (!legacyIds.has(node.id)) {
          snapshot.frontier.resources[node.id] = { remaining: node.capacity, readyDay: null };
        }
      }
      return validateV5State(snapshot) ? migrateState(snapshot) : null;
    }
    if (value.version === 3) {
      if (!validateV3State(value)) return null;
      const snapshot = {
        ...structuredClone(value), version: 4,
        territory: createTerritoryState(value.day as number),
      } as unknown as GameState;
      syncTerritoryDeeds(snapshot);
      return migrateState(snapshot);
    }
    if (!validateV2State(value) && !validateLegacyState(value)) return null;
    const legacy = structuredClone(value);
    const legacyApostle = legacy.apostle as ObjectValue;
    const legacyProperty = legacy.property as ObjectValue;
    const v2 = legacy.version === 2 ? legacy : {
      ...legacy,
      version: 2,
      apostle: {
        ...legacyApostle,
        skills: { cooking: 0, smithing: 0, ...(legacyApostle.skills as ObjectValue) },
      },
      inventory: { flour: 0, ...(legacy.inventory as ObjectValue) },
      market: { flour: 8, ...(legacy.market as ObjectValue) },
      economy: createEconomyState(
        legacy.day as number,
        legacyProperty.plantedAt as number | null,
      ),
    };
    const v2Apostle = v2.apostle as Apostle;
    const legacyFrontier = createFrontierState(v2.day as number);
    legacyFrontier.resources = Object.fromEntries(LEGACY_RESOURCE_NODES.map((node) =>
      [node.id, { remaining: node.capacity, readyDay: null }]));
    const v3 = {
      ...v2,
      version: 3,
      apostle: {
        ...v2Apostle,
        skills: { woodcutting: 0, herbalism: 0, ...v2Apostle.skills },
      },
      frontier: legacyFrontier,
      life: createLifeState(v2.npcs as Npc[], v2.family as Person[], v2Apostle),
    };
    if (!validateV3State(v3)) return null;
    return migrateState(v3);
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

export function saveGame(state: GameState): Promise<GameState> {
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
        return clone(snapshot);
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
        return clone(snapshot);
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
      return clone(snapshot);
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

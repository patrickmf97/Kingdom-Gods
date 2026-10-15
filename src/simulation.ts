import { ITEMS, OBJECTS } from "./data";
import { objectsForZone, portalForZone, regionForZone, resourceNode } from "./regions";
import { cancelWork, createFrontierState, discoverLocation, executeFrontierAction, processFrontierDay, updateFrontierWork } from "./frontier";
import { applyEducationToSuccessor, availableGuardians, createLifeState, executeLifeAction, npcGoalDestination, processLifeDay, recordLifeEvent, registerChildEducation, updateLifeNeeds } from "./life";
import { exportCampaign as serializeCampaign, importCampaign as importSavedCampaign } from "./campaign-files";
import { createTerritoryState, executeTerritoryAction, processTerritoryDay, syncTerritoryDeeds } from "./territory";
import { ESTATE_DEFS, estateBuildings } from "./territory-data";
import {
  findPath,
  isWalkable,
  moveWithCollisions,
  nearestWalkable,
  type NavigationContext,
  type Point,
} from "./navigation";
import {
  createEconomyState,
  cropProfile,
  executeEconomicAction,
  harvestCrop,
  plantCrop,
  processEconomicDay,
  reconcileWorker,
  RECIPES,
  type EconomicHooks,
} from "./economy";
import type {
  Apostle,
  Attributes,
  Blessing,
  Creation,
  Dialog,
  Enemy,
  ExpansionHooks,
  GameState,
  ItemId,
  Memory,
  Npc,
  Person,
  Zone,
} from "./types";
import {
  clearSavedGame,
  getPersistenceError,
  hasSavedGame,
  loadGame,
  saveGame,
} from "./persistence";

interface SimulationMemory {
  marriedAt: Record<string, number>;
  gathering: Record<string, number>;
  npcMemories: Record<string, Memory[]>;
  lastChildDay: number;
  companionId?: string;
  autonomousUntil?: number;
  autonomousReason?: string;
}
export type PersistentGameState = GameState & { simulation: SimulationMemory };
const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const BASE_ATTRIBUTES: Attributes = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
  perception: 10,
  will: 10,
  vitality: 100,
  endurance: 10,
  energy: 100,
};
const DEFAULT_CREATION: Creation = {
  name: "Rowan",
  surname: "Valen",
  sex: "male",
  skin: "#d3a17b",
  hair: "#493327",
  eyes: "#7ca078",
  outfit: "#6d8866",
  blessing: "vigor",
};
const MONTHS = [
  "Aurora",
  "Semente",
  "Flor",
  "Solalto",
  "Brasa",
  "Ceifa",
  "Folha",
  "Âmbar",
  "Névoa",
  "Geada",
  "Noite",
  "Retorno",
];
const SEASONS = ["Primavera", "Verão", "Outono", "Inverno"];
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function newApostle(creation = DEFAULT_CREATION): Apostle {
  const attributes = { ...BASE_ATTRIBUTES };
  if (creation.blessing === "vigor") {
    attributes.vitality += 25;
    attributes.energy += 20;
    attributes.endurance += 3;
  }
  if (creation.blessing === "wisdom") {
    attributes.intelligence += 4;
    attributes.wisdom += 4;
  }
  if (creation.blessing === "fortune") attributes.charisma += 3;
  return {
    id: "apostle-1",
    name: creation.name.trim().slice(0, 30) || "Rowan",
    surname: creation.surname.trim().slice(0, 30) || "Valen",
    sex: creation.sex,
    skin: creation.skin,
    hair: creation.hair,
    eyes: creation.eyes,
    outfit: creation.outfit,
    age: 16,
    birthDay: 1 - 16 * 360,
    alive: true,
    generation: 1,
    parents: [],
    title: "Órfão de Valeverde",
    x: 400,
    y: 400,
    hp: attributes.vitality,
    maxHp: attributes.vitality,
    stamina: attributes.energy,
    maxStamina: attributes.energy,
    blessing: creation.blessing,
    attributes,
    skills: {
      sword: 0,
      farming: 0,
      mining: 0,
      trading: 0,
      building: 0,
      leadership: 0,
      cooking: 0,
      smithing: 0,
      woodcutting: 0,
      herbalism: 0,
    },
    personality: { compassion: 55, courage: 50, loyalty: 60, anger: 15 },
    memories: [],
    equipment: null,
  };
}
function newNpcs(): Npc[] {
  return [
    {
      id: "matron",
      name: "Irmã Elara",
      role: "Matrona do orfanato",
      x: 400,
      y: 290,
      homeX: 400,
      homeY: 290,
      color: "#adb8a2",
      relation: 55,
      trust: 70,
      mood: "Acolhedora",
    },
    {
      id: "merchant",
      name: "Tomas",
      role: "Mercador",
      x: 1280,
      y: 940,
      homeX: 1000,
      homeY: 1200,
      color: "#bfa576",
      relation: 10,
      trust: 20,
      mood: "Atento aos negócios",
    },
    {
      id: "mira",
      name: "Mira",
      role: "Aprendiz de curandeira",
      x: 1580,
      y: 1220,
      homeX: 1640,
      homeY: 1230,
      color: "#b89089",
      relation: 10,
      trust: 15,
      mood: "Curiosa",
    },
    {
      id: "aldric",
      name: "Aldric",
      role: "Ferreiro",
      x: 1560,
      y: 790,
      homeX: 1560,
      homeY: 790,
      color: "#a89177",
      relation: 5,
      trust: 15,
      mood: "Concentrado",
    },
    {
      id: "guard",
      name: "Cedric",
      role: "Guardião da cripta",
      x: 2050,
      y: 450,
      homeX: 2050,
      homeY: 450,
      color: "#7c97a2",
      relation: 15,
      trust: 25,
      mood: "Vigilante",
    },
    {
      id: "farmer",
      name: "Lina",
      role: "Lavradora",
      x: 1830,
      y: 1040,
      homeX: 1770,
      homeY: 1210,
      color: "#9ca677",
      relation: 10,
      trust: 20,
      mood: "Esperançosa",
    },
  ];
}
function newEnemies(): Enemy[] {
  return [
    { id: "skeleton-1", x: 360, y: 330, hp: 44, maxHp: 44, alive: true },
    { id: "skeleton-2", x: 570, y: 320, hp: 50, maxHp: 50, alive: true },
    { id: "skeleton-3", x: 670, y: 510, hp: 56, maxHp: 56, alive: true },
  ];
}
export function initialState(): PersistentGameState {
  const npcs = newNpcs();
  const apostle = newApostle();
  return {
    version: 4,
    started: false,
    intro: true,
    phase: "title",
    apostle,
    gold: 0,
    inventory: Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<
      ItemId,
      number
    >,
    minutes: 480,
    day: 1,
    timeScale: 6,
    zone: "orphanage",
    npcs,
    enemies: newEnemies(),
    market: {
      bread: 20,
      wood: 20,
      stone: 15,
      wheat: 18,
      flour: 8,
      seed: 12,
      sword: 3,
      herb: 10,
      ore: 4,
    },
    merchantGold: 450,
    property: {
      owned: false,
      id: "property",
      name: "Parcela do Moinho",
      cost: 180,
      kingdom: "Auren",
      plantedAt: null,
      harvests: 0,
      building: false,
    },
    family: [],
    quest: "available",
    kills: 0,
    messages: [],
    savedAt: null,
    deaths: 0,
    economy: createEconomyState(1),
    frontier: createFrontierState(1),
    life: createLifeState(npcs, [], apostle),
    territory: createTerritoryState(1),
    simulation: {
      marriedAt: {},
      gathering: {},
      npcMemories: {},
      lastChildDay: -100,
    },
  };
}

export function getCalendar(state: GameState): {
  hour: string;
  day: number;
  month: string;
  year: number;
  season: string;
  temperature: number;
} {
  const monthIndex = Math.floor(((state.day - 1) % 360) / 30);
  return {
    hour: `${Math.floor(state.minutes / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(state.minutes % 60)
      .toString()
      .padStart(2, "0")}`,
    day: ((state.day - 1) % 30) + 1,
    month: MONTHS[monthIndex],
    year: Math.floor((state.day - 1) / 360) + 1,
    season: SEASONS[Math.floor(monthIndex / 3)],
    temperature:
      [17, 28, 13, 5][Math.floor(monthIndex / 3)] +
      Math.round(Math.sin((state.minutes / 1440) * Math.PI * 2) * 3),
  };
}

/** Local authority. Scene and UI send intentions; this store owns rules and the save state. */
export class GameStore {
  state: PersistentGameState = initialState();
  private listeners = new Set<() => void>();
  private attackCooldown = 0;
  private dodgeCooldown = 0;
  private invulnerability = 0;
  private enemyCooldowns: Record<string, number> = {};
  private activeDialog: string | null = null;
  private messageId = 0;
  private announceAccumulator = 0;
  private autosaveAccumulator = 0;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  // Routes are transient intentions, not part of the campaign snapshot.
  private npcRoutes = new Map<string, { target: string; points: Point[] }>();

  private navigationContext(zone: Zone = this.state.zone): NavigationContext {
    return { zone, building: this.state.property.building, estates: estateBuildings(this.state) };
  }

  private recoverPositions(): boolean {
    let moved = false;
    const recover = (actor: Point, zone: Zone) => {
      const context = this.navigationContext(zone);
      if (!isWalkable(actor, context)) {
        Object.assign(actor, nearestWalkable(actor, context));
        moved = true;
      }
    };
    recover(this.state.apostle, this.state.zone);
    for (const npc of this.state.npcs) {
      const zone = npc.id === "matron" ? "orphanage" :
        this.state.zone === "dungeon" && this.state.simulation.companionId === npc.id
          ? "dungeon" : "village";
      recover(npc, zone);
    }
    this.npcRoutes.clear();
    return moved;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify(text?: string, type = "info"): void {
    if (text) this.message(text, type);
    for (const listener of this.listeners) listener();
  }
  private scheduleAutoSave(): void {
    syncTerritoryDeeds(this.state);
    if (typeof window === "undefined") return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.save().catch(() => {});
    }, 800);
  }
  private message(text: string, type = "info"): void {
    this.state.messages.push({ id: ++this.messageId, text, type });
    if (this.state.messages.length > 60)
      this.state.messages.splice(0, this.state.messages.length - 60);
  }
  private remember(
    title: string,
    text: string,
    emotion: string,
    intensity = 50,
  ): void {
    const memory: Memory = {
      id: `memory-${this.state.day}-${++this.messageId}`,
      day: this.state.day,
      title,
      text,
      emotion,
      intensity,
    };
    this.state.apostle.memories.push(memory);
    if (this.state.apostle.memories.length > 160)
      this.state.apostle.memories.shift();
  }
  private get now(): number {
    return (this.state.day - 1) * 1440 + this.state.minutes;
  }
  private practice(skill: string, amount: number): void {
    this.state.apostle.skills[skill] = Math.min(
      100,
      (this.state.apostle.skills[skill] || 0) +
        amount * (this.state.apostle.blessing === "wisdom" ? 1.4 : 1),
    );
  }
  private playing(): boolean {
    return this.state.phase === "playing" && this.state.apostle.alive;
  }
  private nearObject(id: string, radius = 190): boolean {
    const object = objectsForZone(this.state.zone).find((object) => object.id === id);
    return (
      !!object &&
      (distance(this.state.apostle, object) <= radius ||
        (id === "property" && this.state.property.building &&
          distance(this.state.apostle, { x: 2090, y: 815 }) <= radius))
    );
  }
  private nearNpc(id: string): Npc | null {
    const npc = this.state.npcs.find((npc) => npc.id === id);
    if (
      !npc ||
      npc.id === this.state.apostle.id ||
      this.state.family.some((person) => person.id === id && !person.alive) ||
      (id === "matron"
        ? this.state.zone !== "orphanage"
        : this.state.zone !== "village") ||
      distance(this.state.apostle, npc) > 180
    )
      return null;
    return npc;
  }
  private requireNear(id: string): boolean {
    if (this.nearObject(id)) return true;
    this.message("Aproxime-se para fazer isso.", "warning");
    return false;
  }
  private reconcileLifeReferences(): void {
    const validGuardians = new Set(availableGuardians(this.state).map(person => person.id));
    if (this.state.life.guardianId && !validGuardians.has(this.state.life.guardianId)) this.state.life.guardianId = null;
    if (this.state.apostle.age < 16 && !this.state.life.guardianId) {
      const guardians = availableGuardians(this.state).sort((a, b) =>
        (this.state.npcs.find(npc => npc.id === b.id)?.trust ?? 50) -
        (this.state.npcs.find(npc => npc.id === a.id)?.trust ?? 50));
      this.state.life.guardianId = guardians[0]?.id ?? null;
    }
    for (const profile of Object.values(this.state.life.education))
      if (profile.guardianId && !validGuardians.has(profile.guardianId)) profile.guardianId = null;
    if (this.state.life.heirId && !this.eligibleSuccessors().some(person => person.id === this.state.life.heirId)) this.state.life.heirId = null;
    for (const id of Object.keys(this.state.life.needs))
      if (!this.state.npcs.some(npc => npc.id === id)) delete this.state.life.needs[id];
  }
  private economicHooks(): EconomicHooks & ExpansionHooks {
    return {
      message: (text, type) => this.message(text, type),
      remember: (title, text, emotion, intensity) =>
        this.remember(title, text, emotion, intensity),
      rememberNpc: (id, title, text, emotion) => {
        const memories = (this.state.simulation.npcMemories[id] ||= []);
        memories.push({
          id: `economic-npc-${++this.messageId}`,
          day: this.state.day,
          title,
          text,
          emotion,
          intensity: 65,
        });
        if (memories.length > 40) memories.shift();
      },
      practice: (skill, amount) => this.practice(skill, amount),
      nearObject: (id) => this.nearObject(id),
      nearNpc: (id) => !!this.nearNpc(id),
      rest: (hours, healing) => {
        cancelWork(this.state);
        this.state.minutes += hours * 60;
        while (this.state.minutes >= 1440 && this.playing()) {
          this.state.minutes -= 1440;
          this.state.day++;
          this.newDay();
        }
        if (this.playing()) {
          this.state.apostle.hp = Math.min(this.state.apostle.maxHp, this.state.apostle.hp + healing);
          this.state.apostle.stamina = this.state.apostle.maxStamina;
        }
        this.activeDialog = null;
      },
    };
  }

  create(creation: Creation): void {
    this.state = initialState();
    this.state.apostle = newApostle(creation);
    this.state.started = true;
    this.state.phase = "playing";
    this.attackCooldown = this.dodgeCooldown = this.invulnerability = 0;
    this.enemyCooldowns = {};
    this.activeDialog = null;
    this.npcRoutes.clear();
    this.messageId = 0;
    this.remember(
      "Um novo caminho",
      "Aos dezesseis anos, deixo o Orfanato de Santa Elara e descubro minha bênção.",
      "Esperança",
      70,
    );
    this.message("Fale com Irmã Elara para começar sua vida em Valeverde.");
    this.scheduleAutoSave();
    this.notify();
  }
  startCreation(): void {
    this.state.phase = "creation";
    this.activeDialog = null;
    this.notify();
  }
  returnTitle(): void {
    cancelWork(this.state);
    if (this.autosaveTimer) { clearTimeout(this.autosaveTimer); this.autosaveTimer = null; }
    this.state.phase = "title";
    this.activeDialog = null;
    this.notify();
  }
  reset(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    this.state = initialState();
    this.activeDialog = null;
    this.enemyCooldowns = {};
    void clearSavedGame().catch(() => {
      this.message(
        "Não foi possível apagar o arquivo de salvamento.",
        "warning",
      );
      this.notify();
    });
    this.notify();
  }

  tick(deltaSeconds: number): void {
    if (!this.playing() || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      return;
    this.attackCooldown = Math.max(0, this.attackCooldown - deltaSeconds);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - deltaSeconds);
    this.invulnerability = Math.max(0, this.invulnerability - deltaSeconds);
    const apostle = this.state.apostle;
    if (!this.state.frontier.work) apostle.stamina = Math.min(
      apostle.maxStamina,
      apostle.stamina + deltaSeconds * (apostle.blessing === "vigor" ? 9 : 7),
    );
    this.state.minutes += deltaSeconds * this.state.timeScale;
    while (this.state.minutes >= 1440 && this.playing()) {
      this.state.minutes -= 1440;
      this.state.day++;
      this.newDay();
    }
    if (!this.playing()) this.state.minutes %= 1440;
    this.updateNpcs(deltaSeconds);
    updateLifeNeeds(this.state, this.economicHooks());
    const wasWorking = !!this.state.frontier.work;
    updateFrontierWork(this.state, deltaSeconds, this.economicHooks());
    if (wasWorking && !this.state.frontier.work) this.scheduleAutoSave();
    if (this.state.zone === "wilderness" || this.state.zone === "mine") {
      for (const object of objectsForZone(this.state.zone))
        if (distance(apostle, object) <= 130)
          discoverLocation(this.state, object.id, this.economicHooks());
    }
    if (this.state.zone === "dungeon")
      this.updateCombat(Math.min(deltaSeconds, 1));
    this.announceAccumulator += deltaSeconds;
    this.autosaveAccumulator += deltaSeconds;
    if (this.autosaveAccumulator >= 45) {
      this.autosaveAccumulator = 0;
      this.scheduleAutoSave();
    }
    if (this.announceAccumulator >= 0.12) {
      this.announceAccumulator = 0;
      this.notify();
    }
  }
  private newDay(): void {
    const { apostle, inventory, property, market } = this.state;
    const priorAge = apostle.age;
    apostle.age = Math.max(
      0,
      Math.floor((this.state.day - apostle.birthDay) / 360),
    );
    if (apostle.age > priorAge) {
      this.remember(
        "Mais um aniversário",
        `Completei ${apostle.age} anos. Minha história continua.`,
        "Reflexão",
      );
      this.message(`${apostle.name} completou ${apostle.age} anos.`);
    }
    if (priorAge < 16 && apostle.age >= 16) {
      apostle.title = this.state.territory.charter ? "Guardião de Alvor" : "Guardião da linhagem";
      this.remember(
        "Minha própria voz",
        "Aos dezesseis anos, a regência terminou. Agora escolho os rumos da minha linhagem.",
        "Independência",
        85,
      );
      this.message(
        "A regência terminou. Seu apóstolo pode assumir todas as decisões.",
        "success",
      );
    }
    for (const person of this.state.family) {
      if (!person.alive) continue;
      person.age = Math.max(
        0,
        Math.floor((this.state.day - person.birthDay) / 360),
      );
      if (person.age >= 90) {
        person.alive = false;
        recordLifeEvent(this.state, { day: this.state.day, kind: "death", personId: person.id,
          relatedId: null, text: `${person.name} faleceu aos ${person.age} anos.`, gold: 0, property: false });
        this.remember(
          "Uma despedida",
          `${person.name} faleceu em paz. Sua lembrança fica em nossa família.`,
          "Luto",
          85,
        );
        if (apostle.partnerId === person.id) delete apostle.partnerId;
        delete person.partnerId;
        this.state.npcs = this.state.npcs.filter((npc) => npc.id !== person.id);
      }
    }
    for (const npc of this.state.npcs) {
      npc.mood =
        npc.trust >= 60
          ? "Amigável"
          : this.state.day % 3 === 0
            ? "Pensativo"
            : "Tranquilo";
    }
    processFrontierDay(this.state, this.economicHooks());
    processEconomicDay(this.state, this.economicHooks());
    processTerritoryDay(this.state, this.economicHooks());
    processLifeDay(this.state, this.economicHooks());
    if (inventory.bread > 0) {
      inventory.bread--;
      apostle.hp = Math.min(apostle.maxHp, apostle.hp + 8);
    } else if (inventory.wheat > 0) {
      inventory.wheat--;
      apostle.hp = Math.min(apostle.maxHp, apostle.hp + 4);
    } else {
      this.damage(4);
      this.message(
        "Um dia sem comida: −4 de vitalidade. Compre pão ou colha trigo.",
        "warning",
      );
    }
    if (apostle.age >= 90) {
      this.remember(
        "Um ciclo se encerra",
        "A morte natural encerrou uma longa vida. Minha história agora pertence à linhagem.",
        "Serenidade",
        95,
      );
      this.invulnerability = 0;
      this.damage(apostle.maxHp);
    } else if (apostle.age >= 80)
      this.damage(2 + Math.floor((apostle.age - 80) / 5));
    if (
      this.state.zone !== "dungeon" &&
      this.state.enemies.every((enemy) => !enemy.alive)
    )
      this.state.enemies = newEnemies();
  }
  private updateNpcs(delta: number): void {
    const hour = this.state.minutes / 60;
    const working = hour >= 7 && hour < 18;
    const workplaces: Record<string, Point> = {
      merchant: { x: 1280, y: 940 },
      mira: { x: 1460, y: 1000 },
      aldric: { x: 1560, y: 790 },
      guard: { x: 2050, y: 450 },
      farmer: this.state.economy.worker?.npcId === "farmer"
        ? { x: 1900, y: 810 } : { x: 1830, y: 1040 },
    };
    // Distinct gathering spots keep conversations and silhouettes readable.
    const evening: Record<string, Point> = {
      merchant: { x: 940, y: 1180 },
      mira: { x: 1040, y: 1180 },
      aldric: { x: 1140, y: 1180 },
      guard: { x: 980, y: 1280 },
      farmer: { x: 1100, y: 1280 },
    };
    for (const npc of this.state.npcs) {
      if (npc.id === "matron") continue;
      const companion = this.state.zone === "dungeon" &&
        this.state.simulation.companionId === npc.id;
      const context = this.navigationContext(companion ? "dungeon" : "village");
      if (!isWalkable(npc, context)) {
        Object.assign(npc, nearestWalkable(npc, context));
        this.npcRoutes.delete(npc.id);
      }
      const needDestination = companion ? null : npcGoalDestination(this.state, npc);
      const destination = companion
        ? nearestWalkable({ x: this.state.apostle.x + 40, y: this.state.apostle.y + 35 }, context)
        : needDestination ?? (working ? workplaces[npc.id]
        : hour >= 18 && hour < 22 ? evening[npc.id]
        : { x: npc.homeX, y: npc.homeY });
      if (!destination) continue;
      // Companion routes refresh only after the apostle crosses a 32px cell.
      const target = `${context.zone}:${context.building}:${Math.round(destination.x / (companion ? 32 : 1))}:${Math.round(destination.y / (companion ? 32 : 1))}`;
      let route = this.npcRoutes.get(npc.id);
      if (!route || route.target !== target) {
        route = { target, points: findPath(npc, destination, context) };
        this.npcRoutes.set(npc.id, route);
      }
      let remaining = (companion ? 180 : 74) * Math.min(delta, 1);
      while (route.points.length && remaining > 0) {
        const point = route.points[0];
        const range = distance(npc, point);
        if (range < 0.5) { route.points.shift(); continue; }
        const step = Math.min(remaining, range);
        const next = moveWithCollisions(npc, {
          x: (point.x - npc.x) / range * step,
          y: (point.y - npc.y) / range * step,
        }, context);
        const travelled = distance(npc, next);
        Object.assign(npc, next);
        remaining -= step;
        if (travelled < step * 0.8) {
          this.npcRoutes.delete(npc.id);
          break;
        }
        if (step === range) route.points.shift();
      }
    }
  }
  move(dx: number, dy: number, deltaSeconds: number): void {
    if (
      !this.playing() ||
      !Number.isFinite(dx + dy + deltaSeconds) ||
      deltaSeconds <= 0 ||
      (this.state.simulation.autonomousUntil || 0) > this.now
    ) return;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    cancelWork(this.state, this.economicHooks(), "O movimento interrompeu o trabalho.");
    const apostle = this.state.apostle;
    const context = this.navigationContext();
    if (!isWalkable(apostle, context))
      Object.assign(apostle, nearestWalkable(apostle, context));
    const speed = apostle.age < 16 ? 130 : 170;
    // Bound caller intervals while preserving the longer 0.36s dodge sweep.
    const step = speed * Math.min(deltaSeconds, 1);
    Object.assign(apostle, moveWithCollisions(apostle, {
      x: dx / length * step, y: dy / length * step,
    }, context));
  }
  attack(): void {
    if (this.playing()) cancelWork(this.state, this.economicHooks(), "O trabalho foi interrompido para agir.");
    if (
      !this.playing() ||
      this.state.zone !== "dungeon" ||
      this.attackCooldown > 0 ||
      (this.state.simulation.autonomousUntil || 0) > this.now
    )
      return;
    const apostle = this.state.apostle;
    if (apostle.age < 16) {
      this.message("Sob regência, você não pode entrar em combate.", "warning");
      this.notify();
      return;
    }
    if (apostle.stamina < 10) {
      this.message("Energia insuficiente para atacar.", "warning");
      this.notify();
      return;
    }
    apostle.stamina -= 10;
    this.attackCooldown = 0.48;
    const target = this.state.enemies
      .filter((enemy) => enemy.alive && distance(apostle, enemy) <= 120)
      .sort((a, b) => distance(apostle, a) - distance(apostle, b))[0];
    if (target) {
      const damage = Math.round(
        (apostle.equipment === "sword" ? 17 : 6) +
          apostle.attributes.strength * 0.65 +
          apostle.skills.sword * 0.25,
      );
      target.hp = Math.max(0, target.hp - damage);
      this.practice("sword", 0.8);
      apostle.personality.courage = Math.min(
        100,
        apostle.personality.courage + 0.2,
      );
      this.message(
        `${damage} de dano${apostle.equipment === "sword" ? " com espada" : " sem arma"}.`,
        "combat",
      );
      if (target.hp === 0) this.defeat(target);
    }
    this.notify();
  }
  private defeat(enemy: Enemy): void {
    if (!enemy.alive) return;
    enemy.alive = false;
    this.state.kills++;
    this.state.inventory.ore++;
    this.state.gold += 8;
    this.message("Esqueleto derrotado · +8 ouro · +1 minério.", "success");
    this.remember(
      "Enfrentei as raízes",
      "Venci um esqueleto na cripta e voltei mais corajoso.",
      "Coragem",
      45,
    );
    if (this.state.quest === "accepted" && this.state.kills >= 3) {
      this.state.quest = "complete";
      this.message(
        "Missão concluída. Recolha a recompensa no mural ou com Cedric.",
        "success",
      );
    }
  }
  dodge(): void {
    if (this.playing()) cancelWork(this.state, this.economicHooks(), "A esquiva interrompeu o trabalho.");
    if (
      !this.playing() ||
      this.dodgeCooldown > 0 ||
      this.state.apostle.stamina < 16
    )
      return;
    this.state.apostle.stamina -= 16;
    this.invulnerability = 0.65;
    this.dodgeCooldown = 1.3;
    this.message("Esquiva · protegido por um instante.", "combat");
    this.notify();
  }
  private updateCombat(delta: number): void {
    const apostle = this.state.apostle;
    const threat = this.state.enemies.some(
      (enemy) => enemy.alive && distance(enemy, apostle) < 150,
    );
    const frightened =
      apostle.hp / apostle.maxHp < 0.24 && apostle.personality.courage < 75;
    if (
      frightened &&
      threat &&
      (this.state.simulation.autonomousUntil || 0) <= this.now
    ) {
      this.state.simulation.autonomousUntil = this.now + 30;
      this.state.simulation.autonomousReason = "Preservar a própria vida";
      this.remember(
        "Minha vida é minha",
        "Ferido, escolhi recuar da cripta apesar da vontade da divindade. Quero viver para rever minha família.",
        "Medo",
        90,
      );
      this.message(
        `${apostle.name} age por vontade própria: está ferido e decide recuar.`,
        "warning",
      );
      if (apostle.stamina >= 16) {
        apostle.stamina -= 16;
        this.invulnerability = 0.65;
      }
    }
    if ((this.state.simulation.autonomousUntil || 0) > this.now) {
      const exit = { x: 450, y: 790 };
      const range = distance(apostle, exit);
      if (range < 75) {
        delete this.state.simulation.autonomousUntil;
        delete this.state.simulation.autonomousReason;
        this.setZone("village");
        this.message(
          "Seu apóstolo escolheu sair da cripta para sobreviver.",
          "warning",
        );
        return;
      }
      Object.assign(apostle, moveWithCollisions(apostle, {
        x: ((exit.x - apostle.x) / range) * Math.min(range, 205 * delta),
        y: ((exit.y - apostle.y) / range) * Math.min(range, 205 * delta),
      }, this.navigationContext()));
    } else {
      delete this.state.simulation.autonomousUntil;
      delete this.state.simulation.autonomousReason;
    }
    for (const enemy of this.state.enemies) {
      if (!enemy.alive) continue;
      this.enemyCooldowns[enemy.id] = Math.max(
        0,
        (this.enemyCooldowns[enemy.id] || 0) - delta,
      );
      const range = distance(enemy, apostle);
      if (range <= 310 && range > 53) {
        const speed = 53 * delta;
        Object.assign(enemy, moveWithCollisions(enemy, {
          x: ((apostle.x - enemy.x) / range) * speed,
          y: ((apostle.y - enemy.y) / range) * speed,
        }, this.navigationContext()));
      }
      if (range <= 72 && this.enemyCooldowns[enemy.id] === 0) {
        this.enemyCooldowns[enemy.id] = 1.25;
        const companion = this.state.npcs.find(
          (npc) => npc.id === this.state.simulation.companionId,
        );
        if (
          companion &&
          companion.trust >= 65 &&
          (this.state.simulation.npcMemories[companion.id]?.length || 0) >= 3
        ) {
          enemy.hp = Math.max(0, enemy.hp - 10);
          this.message(
            `${companion.name} se lembra de sua amizade e defende você.`,
            "combat",
          );
          if (!enemy.hp) this.defeat(enemy);
          else this.damage(4);
        } else
          this.damage(
            Math.max(4, 11 - Math.floor(apostle.attributes.endurance / 5)),
          );
      }
    }
  }
  damage(amount: number): void {
    if (
      !this.playing() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      this.invulnerability > 0
    )
      return;
    cancelWork(this.state, this.economicHooks(), "O ferimento interrompeu o trabalho.");
    this.state.apostle.hp = Math.max(0, this.state.apostle.hp - amount);
    if (this.state.apostle.hp === 0) {
      const apostle = this.state.apostle;
      apostle.alive = false;
      this.state.phase = "dead";
      this.state.deaths++;
      recordLifeEvent(this.state, { day: this.state.day, kind: "death", personId: apostle.id,
        relatedId: null, text: `${apostle.name} morreu aos ${apostle.age} anos.`, gold: this.state.gold,
        property: this.state.property.owned });
      this.reconcileLifeReferences();
      this.remember(
        "O fim de uma vida",
        `${apostle.name} ${apostle.surname} morreu aos ${apostle.age} anos. Sua família guardará a história.`,
        "Luto",
        100,
      );
      this.message(
        "Sua vida chegou ao fim. Um familiar elegível pode continuar a linhagem.",
        "warning",
      );
      this.scheduleAutoSave();
    }
    this.notify();
  }

  price(item: ItemId, buy: boolean): number {
    if (!ITEMS[item]) return 0;
    const stock = this.state.market[item];
    const scarcity = stock < 4 ? 1.2 : stock > 28 ? 0.92 : 1;
    const skillDiscount = Math.min(
      0.15,
      this.state.apostle.skills.trading / 500,
    );
    const blessingDiscount =
      this.state.apostle.blessing === "fortune" ? 0.88 : 1;
    return Math.max(
      1,
      Math.round(
        ITEMS[item].price *
          (1 + (55 - this.state.economy.prosperity) / 500) *
          (buy
            ? scarcity * (1.15 - skillDiscount) * blessingDiscount
            : Math.min(1, scarcity) * (0.6 + skillDiscount)),
      ),
    );
  }
  getCalendar(): {
    hour: string;
    day: number;
    month: string;
    year: number;
    season: string;
    temperature: number;
  } {
    return getCalendar(this.state);
  }
  getNearest(): { id: string; label: string; distance: number; x: number; y: number } | null {
    if (!this.playing()) return null;
    const points: { id: string; label: string; x: number; y: number }[] = [
      ...objectsForZone(this.state.zone),
      ...(this.state.zone === "village" ? [
        ...(this.state.property.building ? [{ id: "property", label: "Moradia da linhagem", x: 2090, y: 815 }] : []),
        ...this.state.npcs.filter(npc => npc.id !== "matron").map(npc => ({ ...npc, label: npc.name })),
      ] : this.state.zone === "orphanage" ? [{ id: "matron", label: "Irmã Elara", x: 400, y: 290 }] : []),
    ];
    const nearest = points
      .map((point) => ({
        id: point.id,
        label: point.label,
        x: point.x,
        y: point.y,
        distance: distance(this.state.apostle, point),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    return nearest && nearest.distance <= 190 ? nearest : null;
  }
  setZone(zone: Zone): void {
    if (!this.playing()) return;
    if (zone === "dungeon" && this.state.apostle.age < 16) {
      this.message(
        "O regente protege você da cripta até os dezesseis anos.",
        "warning",
      );
      this.notify();
      return;
    }
    const origin = this.state.zone;
    cancelWork(this.state, this.economicHooks(), "A viagem interrompeu o trabalho.");
    const companion = this.state.npcs.find(npc => npc.id === this.state.simulation.companionId);
    this.state.zone = zone;
    this.npcRoutes.clear();
    if (zone === "orphanage") {
      this.state.apostle.x = 450;
      this.state.apostle.y = 750;
    }
    if (zone === "dungeon") {
      this.state.apostle.x = 450;
      this.state.apostle.y = 750;
      const friend = this.state.npcs.find(
        (npc) =>
          npc.id !== "matron" &&
          npc.id !== this.state.economy.worker?.npcId &&
          npc.trust >= 65 &&
          npc.relation >= 60 &&
          (this.state.simulation.npcMemories[npc.id]?.length || 0) >= 3,
      );
      this.state.simulation.companionId = friend?.id;
      if (friend)
        this.message(
          `${friend.name} acompanha você, lembrando da amizade construída.`,
          "success",
        );
    }
    if (zone === "village") {
      this.state.apostle.x = origin === "wilderness" ? 2170 : origin === "orphanage" || this.state.intro ? 710 : 2110;
      this.state.apostle.y = origin === "wilderness" ? 1580 : origin === "orphanage" || this.state.intro ? 760 : 470;
      if (companion) Object.assign(companion,
        nearestWalkable({ x: 2150, y: 490 }, this.navigationContext("village")));
      delete this.state.simulation.companionId;
    }
    if (zone === "wilderness") Object.assign(this.state.apostle,
      origin === "mine" ? { x: 2250, y: 600 } : { x: 400, y: 1780 });
    if (zone === "mine") Object.assign(this.state.apostle, { x: 400, y: 970 });
    if (zone !== "dungeon") delete this.state.simulation.companionId;
    this.activeDialog = null;
    this.scheduleAutoSave();
    this.notify();
  }

  interact(id: string): Dialog | null {
    if (!this.playing()) return null;
    if (this.state.frontier.work) cancelWork(this.state, this.economicHooks(), "A conversa interrompeu o trabalho.");
    if (id === "exit") {
      if (
        distance(this.state.apostle, { x: 450, y: 790 }) > 190 ||
        !["orphanage", "dungeon"].includes(this.state.zone)
      )
        return null;
      if (this.state.zone === "orphanage" && this.state.intro)
        return {
          name: "Um último conselho",
          role: "Orfanato",
          text: "Fale com Irmã Elara antes de partir. Ela preparou algumas provisões para você.",
          options: [{ label: "Entendi", action: "close" }],
        };
      const wasOrphanage = this.state.zone === "orphanage";
      this.setZone("village");
      if (wasOrphanage) {
        this.state.apostle.x = 710;
        this.state.apostle.y = 760;
      }
      return null;
    }
    const npc = this.nearNpc(id);
    if (npc) {
      this.activeDialog = id;
      return this.npcDialog(npc);
    }
    if (!this.nearObject(id)) return null;
    this.activeDialog = id;
    const estate = ESTATE_DEFS.find(parcel => parcel.id === id);
    if (estate) return {
      name: estate.name, role: "Registro territorial de Auren",
      text: this.state.territory.parcels[estate.id].owned
        ? "Esta terra pertence à sua linhagem e segue vinculada a Auren. Gerencie construções, provisões e obrigações no registro de propriedades."
        : `Terreno disponível por ${estate.cost} coroas, dentro dos limites concedidos pelo reino. Examine a área e consulte o registro antes de construir.`,
      options: [{ label: "Consultar terreno e construções", action: "open-property" }, { label: "Continuar explorando", action: "close" }],
    };
    const portal = portalForZone(this.state.zone, id);
    if (portal) return {
      name: portal.label, role: "Estrada de Auren",
      text: `O caminho leva a ${regionForZone(portal.to).name}. A jornada é livre: você pode voltar quando quiser.`,
      options: [{ label: portal.to === "mine" ? "Entrar na mina" : "Seguir pela estrada", action: `travel:${id}` },
        { label: "Ficar por aqui", action: "close" }],
    };
    const node = resourceNode(id);
    if (node && node.zone === this.state.zone) {
      const resource = this.state.frontier.resources[id];
      return { name: node.label, role: "Trabalho por prática",
        text: `${resource.remaining} cargas disponíveis. O trabalho leva ${node.duration} segundos e exige ${node.stamina} de energia.${node.tool ? ` Use ${node.tool === "pickaxe" ? "uma picareta" : "um machado"} em bom estado.` : " Pode ser recolhido à mão."}`,
        options: [{ label: node.resource === "ore" ? "Extrair minério" : node.resource === "wood" ? "Recolher madeira" : node.resource === "stone" ? "Extrair pedra" : "Colher ervas", action: `start-work:${id}`, disabled: resource.remaining <= 0 }, { label: "Voltar", action: "close" }] };
    }
    if (id === "wild-camp") return {
      name: "Acampamento dos viajantes", role: "Abrigo no vale",
      text: "Uma fogueira e abrigos marcam a passagem dos viajantes. Acampe usando duas madeiras para descansar quatro horas ou registre trabalhos do vale no diário.",
      options: [{ label: "Acampar · 2 madeiras", action: "camp-rest", disabled: this.state.inventory.wood < 2 },
        { label: "Ver trabalhos do vale", action: "open-journal" }, { label: "Voltar", action: "close" }],
    };
    if (id === "wild-ruins" || id === "wild-lake") {
      discoverLocation(this.state, id, this.economicHooks());
      return { name: objectsForZone(this.state.zone).find(object => object.id === id)!.label,
        role: "Uma descoberta nos Ermos", text: id === "wild-ruins" ? "Entre pedras cobertas de musgo, os vestígios da antiga torre guardam a memória de Alvor. A descoberta ficará registrada na campanha." : "A água reflete as colinas. O lago serve de referência aos viajantes; sua margem foi registrada na campanha.",
        options: [{ label: "Consultar o diário", action: "open-journal" }, { label: "Continuar explorando", action: "close" }] };
    }
    if (id === "orphanage") {
      this.setZone("orphanage");
      return null;
    }
    if (id === "dungeon") {
      this.setZone("dungeon");
      this.message(
        "A cripta espera. Ataque de perto e esquive para evitar golpes.",
      );
      return null;
    }
    if (["mill", "bakery", "forge"].includes(id)) return this.stationDialog(id);
    if (id === "market")
      return {
        name: "Mercado de Valeverde",
        role: "Comércio e abastecimento",
        text: "O trigo alimenta o moinho; farinha e lenha alimentam a padaria. Os preços acompanham os estoques e a prosperidade da vila.",
        options: [
          { label: "Abrir mercado", action: "open-market" },
          { label: "Pedidos de abastecimento", action: "open-journal" },
          { label: "Voltar", action: "close" },
        ],
      };
    if (id === "property") return this.propertyDialog();
    if (id === "inn")
      return {
        name: "Estalagem do Carvalho",
        role: "Descanso",
        text: "Uma cama e uma refeição custam 8 ouro. Dormir avança oito horas e recupera vitalidade e energia.",
        options: [
          {
            label: "Descansar · 8 ouro",
            action: "rest",
            disabled: this.state.gold < 8,
          },
          { label: "Voltar", action: "close" },
        ],
      };
    if (id === "sign") return this.questDialog();
    if (id === "well") {
      this.state.apostle.stamina = this.state.apostle.maxStamina;
      this.message("A água fresca recuperou sua energia.", "success");
      this.notify();
      return null;
    }
    return {
      name: OBJECTS.find((object) => object.id === id)?.label || "Valeverde",
      role: "Uma aldeia viva",
      text: "A vida da aldeia segue seu ritmo. Converse com os moradores e descubra seu lugar aqui.",
      options: [{ label: "Voltar", action: "close" }],
    };
  }
  private npcDialog(npc: Npc): Dialog {
    if (npc.id === "matron")
      return {
        name: npc.name,
        role: npc.role,
        text: this.state.intro
          ? `${this.state.apostle.name}, hoje você completa dezesseis anos. Pela lei de Auren, esta é a idade de assumir sua própria vida: os jovens deixam o orfanato e tornam-se cidadãos. Você continua sendo parte desta casa. Leve 48 moedas, três pães e duas sementes. Explore o orfanato, despeça-se e saia pelo portão ao sul quando estiver pronto. Lá fora, procure o mural da praça, aprenda um ofício e construa sua família.`
          : "Esta casa sempre fará parte de sua história. Seus pertences estão com você. O portão ao sul leva a Valeverde quando estiver pronto para partir.",
        options: this.state.intro
          ? [{ label: "Receber meus pertences", action: "leave-orphanage" }]
          : [{ label: "Voltar", action: "close" }],
      };
    const spouse = this.state.apostle.partnerId === npc.id;
    const marriedDays =
      this.state.day -
      (this.state.simulation.marriedAt[npc.id] ?? this.state.day);
    const options = [
      { label: "Conversar e ajudar", action: `socialize:${npc.id}` },
      {
        label: "Oferecer pão e cortejar",
        action: `court:${npc.id}`,
        disabled:
          npc.relation < 25 ||
          this.state.inventory.bread < 1 ||
          !!this.state.apostle.partnerId,
      },
      {
        label: "Propor casamento",
        action: `marry:${npc.id}`,
        disabled:
          npc.relation < 80 || npc.trust < 55 || !!this.state.apostle.partnerId,
      },
    ];
    if (spouse)
      options.push({
        label:
          marriedDays >= 16
            ? "Ampliar a família"
            : `Família · faltam ${16 - marriedDays} dias`,
        action: "child",
        disabled: marriedDays < 16,
      });
    if (npc.id === "guard")
      options.push({
        label:
          this.state.quest === "complete"
            ? "Recolher recompensa"
            : "A missão da cripta",
        action:
          this.state.quest === "complete" ? "quest-claim" : "quest-accept",
        disabled: this.state.quest === "claimed",
      });
    if (npc.id === "farmer")
      options.push(
        this.state.economy.worker
          ? { label: "Encerrar contrato de trabalho", action: "dismiss-worker" }
          : {
              label: "Oferecer trabalho · 5 coroas por dia",
              action: "hire:farmer",
              disabled:
                !this.state.property.owned ||
                !this.state.property.building ||
                this.state.economy.condition < 25,
            },
      );
    options.push({ label: "Voltar", action: "close" });
    const remembrance = this.state.simulation.npcMemories[npc.id]?.length
      ? " Lembro da atenção que você teve comigo."
      : "";
    return {
      name: npc.name,
      role: npc.role,
      text: `${spouse ? `É bom ter você de volta, ${this.state.apostle.name}. Estamos casados há ${marriedDays} dias.` : npc.trust >= 60 ? "Sua amizade faz diferença nesta aldeia." : "Cada dia traz trabalho, histórias e novas pessoas."}${remembrance} Afinidade ${Math.round(npc.relation)} · confiança ${Math.round(npc.trust)}.`,
      options,
    };
  }
  private stationDialog(id: string): Dialog {
    const recipe = RECIPES.find((candidate) => candidate.station === id)!;
    return {
      name: OBJECTS.find((object) => object.id === id)?.label || "Oficina",
      role: "Produção por prática",
      text: `${recipe.description} O trabalho exige ingredientes e ${recipe.stamina} de energia.`,
      options: [
        { label: "Ver receitas e produzir", action: "open-crafting" },
        ...(id === "forge"
          ? [{ label: "Negociar materiais", action: "open-market" }]
          : []),
        { label: "Voltar", action: "close" },
      ],
    };
  }
  private propertyDialog(): Dialog {
    const p = this.state.property;
    const e = this.state.economy;
    const crop = e.crop;
    const profile = cropProfile(this.state.day);
    const options: Dialog["options"] = p.owned
      ? [
          {
            label: "Plantar · 1 semente",
            action: "plant",
            disabled: p.plantedAt !== null || this.state.inventory.seed < 1,
          },
          {
            label: "Colher trigo",
            action: "harvest",
            disabled: !crop || this.state.day < crop.readyDay,
          },
          ...(p.building
            ? [
                {
                  label: "Reparar casa · 2 madeira, 1 pedra",
                  action: "repair",
                  disabled:
                    e.condition >= 100 ||
                    this.state.inventory.wood < 2 ||
                    this.state.inventory.stone < 1,
                },
              ]
            : [
                {
                  label: "Construir casa · 12 madeira, 8 pedra, 60 coroas",
                  action: "build",
                  disabled:
                    this.state.inventory.wood < 12 ||
                    this.state.inventory.stone < 8 ||
                    this.state.gold < 60,
                },
              ]),
          ...(e.worker
            ? [{ label: "Encerrar contrato de Lina", action: "dismiss-worker" }]
            : [
                {
                  label: "Contratar Lina · 5 coroas por dia",
                  action: "hire:farmer",
                  disabled:
                    !p.building ||
                    e.condition < 25 ||
                    !this.state.npcs.some((npc) => npc.id === "farmer"),
                },
              ]),
          { label: "Ver a propriedade", action: "open-property" },
        ]
      : [
          {
            label: `Comprar parcela · ${p.cost} coroas`,
            action: "acquire-property",
            disabled: this.state.gold < p.cost,
          },
        ];
    options.push({ label: "Voltar", action: "close" });
    return {
      name: p.name,
      role: `${p.owned ? "Sua propriedade" : "Terra à venda"} · Reino de Auren`,
      text: p.owned
        ? `${crop ? `Trigo plantado no ${crop.season}: ${Math.max(0, crop.readyDay - this.state.day)} dias até a colheita, ${crop.yield} trigo previsto.` : `${profile.season}: uma semente produz ${profile.yield} trigo em ${profile.duration} dias.`} ${p.building ? `Casa em ${e.condition}% de condição, tributo de até 2 coroas por dia. ${e.worker ? "Lina trabalha por 5 coroas diárias." : "Uma trabalhadora pode cuidar da terra."}` : "Construa uma casa para contratar ajuda."}`
        : `Esta parcela custa ${p.cost} coroas. Ela está vinculada ao Reino de Auren e passará aos sucessores da sua linhagem.`,
      options,
    };
  }
  private questDialog(): Dialog {
    const quest = this.state.quest;
    return {
      name: "Mural de oportunidades",
      role: "Pedido de Cedric",
      text:
        quest === "claimed"
          ? "A cripta foi protegida graças a você. O mural conta sua vitória."
          : "Esqueletos se ergueram na Cripta das Raízes. Derrote três e receba 45 ouro, dois pães e a gratidão da aldeia. A entrada fica a nordeste.",
      options: [
        {
          label:
            quest === "complete"
              ? "Recolher · 45 ouro e 2 pães"
              : quest === "accepted"
                ? `${Math.min(3, this.state.kills)}/3 esqueletos derrotados`
                : "Aceitar missão",
          action: quest === "complete" ? "quest-claim" : "quest-accept",
          disabled: quest === "accepted" || quest === "claimed",
        },
        { label: "Ver pedidos da vila", action: "open-journal" },
        { label: "Registro de terras e Auren", action: "open-property" },
        { label: "Voltar", action: "close" },
      ],
    };
  }
  choose(action: string): Dialog | null {
    if (action === "close" || action.startsWith("open-")) {
      this.activeDialog = null;
      return null;
    }
    if (action === "leave-orphanage") {
      if (
        this.playing() &&
        this.state.intro &&
        this.state.zone === "orphanage" &&
        distance(this.state.apostle, { x: 400, y: 290 }) <= 180
      ) {
        this.state.gold += 48;
        this.state.inventory.bread += 3;
        this.state.inventory.seed += 2;
        this.state.intro = false;
        this.state.apostle.title = "Cidadão de Valeverde";
        this.remember(
          "A despedida de Elara",
          "Irmã Elara me confiou provisões e a coragem de escolher meu próprio caminho.",
          "Gratidão",
          90,
        );
        this.message(
          "Pertences recebidos. Explore o orfanato e saia pelo portão ao sul quando estiver pronto.",
          "success",
        );
        this.activeDialog = null;
        this.scheduleAutoSave();
        this.notify();
      }
      return null;
    }
    this.act(action);
    if (!this.activeDialog || !this.playing()) return null;
    const npc = this.nearNpc(this.activeDialog);
    if (npc) return this.npcDialog(npc);
    if (this.activeDialog === "property" && this.nearObject("property"))
      return this.propertyDialog();
    if (
      ["mill", "bakery", "forge"].includes(this.activeDialog) &&
      this.nearObject(this.activeDialog)
    )
      return this.stationDialog(this.activeDialog);
    if (this.activeDialog === "sign" && this.nearObject("sign"))
      return this.questDialog();
    return null;
  }
  act(action: string): void {
    if (action.startsWith("succeed:")) {
      this.succeed(action.slice(8));
      return;
    }
    if (!this.playing()) return;
    const [verb, id] = action.split(":");
    const item = id as ItemId;
    if (this.state.territory.arrears > 0 && ["acquire-property", "build"].includes(action)) {
      this.message("Quite as obrigações de Auren no mural antes de ampliar suas propriedades.", "warning");
      this.notify(); return;
    }
    if (this.state.apostle.age < 16 && (["acquire-property", "build"].includes(action) || action.startsWith("hire:"))) {
      this.message("Sob regência, contratos de terra, construção e emprego ficam reservados ao adulto responsável.", "warning");
      this.notify(); return;
    }
    if (verb === "travel") {
      const portal = portalForZone(this.state.zone, id);
      if (!portal || !this.nearObject(id, 140)) {
        this.message("Aproxime-se da estrada ou da entrada para viajar.", "warning");
      } else if (portal.to === "mine" && this.state.apostle.age < 12) {
        this.message("O tutor protege crianças menores de doze anos das galerias da mina.", "warning");
      } else {
        discoverLocation(this.state, id, this.economicHooks());
        this.setZone(portal.to);
        Object.assign(this.state.apostle, nearestWalkable(portal.spawn, this.navigationContext()));
        this.message(`Você chegou a ${regionForZone(portal.to).name}.`);
        this.activeDialog = null;
      }
      this.scheduleAutoSave(); this.notify(); return;
    }
    if (action === "cancel-work") {
      cancelWork(this.state, this.economicHooks(), "Você interrompeu o trabalho.");
      this.scheduleAutoSave(); this.notify(); return;
    }
    if (executeTerritoryAction(this.state, action, this.economicHooks())) {
      if (verb === "estate-build") {
        this.recoverPositions();
        cancelWork(this.state);
      }
      this.scheduleAutoSave(); this.notify(); return;
    }
    if (executeFrontierAction(this.state, action, this.economicHooks()) ||
        executeLifeAction(this.state, action, this.economicHooks())) {
      if (verb === "start-work") this.activeDialog = null;
      this.scheduleAutoSave(); this.notify(); return;
    }
    if (action === "camp-rest") {
      if (this.nearObject("wild-camp", 140) && this.state.inventory.wood >= 2) {
        this.state.inventory.wood -= 2;
        cancelWork(this.state);
        this.state.minutes += 240;
        while (this.state.minutes >= 1440 && this.playing()) {
          this.state.minutes -= 1440; this.state.day++; this.newDay();
        }
        if (this.playing()) { this.state.apostle.hp = Math.min(this.state.apostle.maxHp, this.state.apostle.hp + 20); this.state.apostle.stamina = this.state.apostle.maxStamina; }
        this.message("O abrigo e a fogueira permitiram quatro horas de descanso.", "success");
        this.activeDialog = null;
      } else this.message("Aproxime-se do acampamento com duas madeiras.", "warning");
      this.scheduleAutoSave(); this.notify(); return;
    }
    if (executeEconomicAction(this.state, action, this.economicHooks())) {
      this.scheduleAutoSave();
      this.notify();
      return;
    }
    if ((verb === "buy" || verb === "sell") && ITEMS[item]) {
      if (!this.nearObject("market") && !this.nearObject("forge")) {
        this.message(
          "Aproxime-se do mercado ou da forja para negociar.",
          "warning",
        );
        this.notify();
        return;
      }
      const price = this.price(item, verb === "buy");
      if (verb === "buy") {
        if (this.state.market[item] < 1 || this.state.gold < price) {
          this.message(
            this.state.market[item] < 1
              ? "O estoque acabou. Novas mercadorias chegam amanhã."
              : "Ouro insuficiente.",
            "warning",
          );
          this.notify();
          return;
        }
        this.state.gold -= price;
        this.state.merchantGold += price;
        this.state.market[item]--;
        this.state.inventory[item]++;
        this.message(
          `${ITEMS[item].name} comprado por ${price} ouro.`,
          "success",
        );
      } else {
        if (this.state.inventory[item] < 1 || this.state.merchantGold < price) {
          this.message(
            this.state.inventory[item] < 1
              ? "Você não possui esse item."
              : "O mercador não tem ouro suficiente.",
            "warning",
          );
          this.notify();
          return;
        }
        this.state.gold += price;
        this.state.merchantGold -= price;
        this.state.inventory[item]--;
        this.state.market[item]++;
        if (
          !this.state.inventory[item] &&
          this.state.apostle.equipment === item
        )
          this.state.apostle.equipment = null;
        this.message(
          `${ITEMS[item].name} vendido por ${price} ouro.`,
          "success",
        );
      }
      this.practice("trading", 0.4);
    } else if (action === "equip:sword") {
      if (this.state.inventory.sword > 0) {
        this.state.apostle.equipment = "sword";
        this.message("Espada de ferro equipada.", "success");
      } else
        this.message("Você precisa de uma espada no inventário.", "warning");
    } else if (verb === "use" && (item === "bread" || item === "herb")) {
      if (this.state.inventory[item] > 0) {
        this.state.inventory[item]--;
        this.state.apostle.hp = Math.min(
          this.state.apostle.maxHp,
          this.state.apostle.hp + (item === "bread" ? 28 : 18),
        );
        if (item === "bread")
          this.state.apostle.stamina = Math.min(
            this.state.apostle.maxStamina,
            this.state.apostle.stamina + 20,
          );
        this.message(`${ITEMS[item].name} usado.`, "success");
      } else this.message("Você não possui esse item.", "warning");
    } else if (
      ["acquire-property", "plant", "harvest", "build"].includes(action)
    ) {
      if (!this.requireNear("property")) {
        this.notify();
        return;
      }
      const p = this.state.property;
      if (action === "acquire-property") {
        if (!p.owned && this.state.gold >= p.cost && Number.isSafeInteger(this.state.economy.civicFunds + p.cost)) {
          this.state.gold -= p.cost;
          this.state.economy.civicFunds += p.cost;
          p.owned = true;
          this.remember(
            "Minhas próprias raízes",
            "Comprei a Parcela do Moinho no Reino de Auren. Esta terra pertencerá à minha linhagem.",
            "Orgulho",
            85,
          );
          this.message("A Parcela do Moinho agora é sua.", "success");
        } else
          this.message(
            p.owned
              ? "Esta parcela já é sua."
              : "Ouro insuficiente para adquirir a parcela.",
            "warning",
          );
      } else if (!p.owned)
        this.message("Adquira a parcela primeiro.", "warning");
      else if (action === "plant") {
        plantCrop(this.state, this.economicHooks());
      } else if (action === "harvest") {
        harvestCrop(this.state, this.economicHooks());
      } else if (action === "build") {
        if (
          !p.building &&
          this.state.inventory.wood >= 12 &&
          this.state.inventory.stone >= 8 &&
          this.state.gold >= 60
        ) {
          this.state.inventory.wood -= 12;
          this.state.inventory.stone -= 8;
          this.state.gold -= 60;
          p.building = true;
          this.recoverPositions();
          this.state.economy.condition = 100;
          this.practice("building", 5);
          this.remember(
            "Um lar para a linhagem",
            "Ergui uma casa em nossa parcela. Agora temos um lar que pode atravessar gerações.",
            "Segurança",
            90,
          );
          this.message(
            "Casa construída. Mantenha os reparos e contrate ajuda para o cultivo.",
            "success",
          );
        } else
          this.message(
            p.building
              ? "Sua casa já está construída."
              : "Construir exige 12 madeira, 8 pedra e 60 ouro.",
            "warning",
          );
      }
    } else if (action === "rest") {
      if (!this.requireNear("inn")) {
        this.notify();
        return;
      }
      if (this.state.gold < 8)
        this.message("A estalagem custa 8 ouro.", "warning");
      else {
        this.state.gold -= 8;
        this.state.minutes += 480;
        while (this.state.minutes >= 1440 && this.playing()) {
          this.state.minutes -= 1440;
          this.state.day++;
          this.newDay();
        }
        if (this.playing()) {
          this.state.apostle.hp = this.state.apostle.maxHp;
          this.state.apostle.stamina = this.state.apostle.maxStamina;
          this.message("Você descansou oito horas.", "success");
        }
        this.activeDialog = null;
      }
    } else if (action === "quest-accept" || action === "quest-claim") {
      if (!this.nearObject("sign") && !this.nearNpc("guard")) {
        this.message(
          "Procure o mural ou Cedric para tratar da missão.",
          "warning",
        );
        this.notify();
        return;
      }
      if (action === "quest-accept" && this.state.quest === "available") {
        this.state.quest = this.state.kills >= 3 ? "complete" : "accepted";
        this.remember(
          "O pedido do guardião",
          "Aceitei ajudar Cedric a proteger Valeverde dos três esqueletos da cripta.",
          "Dever",
          65,
        );
        this.message(
          "Missão aceita: derrote três esqueletos na cripta.",
          "success",
        );
      }
      if (action === "quest-claim" && this.state.quest === "complete") {
        const guard = this.state.npcs.find((npc) => npc.id === "guard");
        this.state.quest = "claimed";
        this.state.gold += 45;
        this.state.inventory.bread += 2;
        if (guard) {
          guard.relation = Math.min(100, guard.relation + 20);
          guard.trust = Math.min(100, guard.trust + 20);
        }
        this.practice("leadership", 3);
        const gratitude =
          this.state.apostle.id === "guard"
            ? "Honrei meu antigo pedido como guardião: a paz voltou à cripta. Agora levo este dever à minha linhagem."
            : guard
              ? "Cedric agradeceu pela paz devolvida à cripta. A aldeia começou a confiar em mim."
              : "Honrei o legado de Cedric e devolvi a paz à cripta. A aldeia começou a confiar em minha linhagem.";
        this.remember("Valeverde em segurança", gratitude, "Orgulho", 80);
        this.message(
          "Recompensa: 45 ouro, 2 pães e confiança da aldeia.",
          "success",
        );
      }
    } else if (verb === "socialize" || verb === "court" || verb === "marry")
      this.social(verb, id);
    else if (action === "child") this.haveChild();
    this.scheduleAutoSave();
    this.notify();
  }
  private social(verb: string, id: string): void {
    const npc = this.nearNpc(id);
    if (!npc || npc.id === "matron" || npc.id === this.state.apostle.id) {
      this.message("Aproxime-se da pessoa para conversar.", "warning");
      return;
    }
    if (verb === "marry") {
      if (
        this.state.apostle.age < 16 ||
        this.state.apostle.partnerId ||
        npc.relation < 80 ||
        npc.trust < 55
      ) {
        this.message(
          "Casamento exige idade adulta, afinidade 80 e confiança 55.",
          "warning",
        );
        return;
      }
      const existingMember = this.state.family.find(
        (person) => person.id === id,
      );
      if (existingMember) {
        this.message("Esta pessoa já pertence à sua família.", "warning");
        return;
      }
      this.state.apostle.partnerId = id;
      this.state.simulation.marriedAt[id] = this.state.day;
      const partner: Person = {
        id,
        name: npc.name,
        surname: this.state.apostle.surname,
        sex: id === "mira" || id === "farmer" ? "female" : "male",
        skin: "#cba282",
        hair: "#4d3930",
        eyes: "#90a193",
        outfit: npc.color,
        age: 24,
        birthDay: this.state.day - 24 * 360,
        alive: true,
        generation: this.state.apostle.generation,
        parents: [],
        partnerId: this.state.apostle.id,
        title: "Companheiro da linhagem",
      };
      this.state.family.push(partner);
      recordLifeEvent(this.state, { day: this.state.day, kind: "marriage", personId: this.state.apostle.id,
        relatedId: partner.id, text: `${this.state.apostle.name} e ${partner.name} formaram uma união.`, gold: this.state.gold, property: this.state.property.owned });
      this.remember(
        "Duas histórias, uma família",
        `Casei com ${npc.name}. Nosso lar poderá receber uma criança após dezesseis dias.`,
        "Amor",
        100,
      );
      this.message(`Você e ${npc.name} se casaram.`, "success");
      return;
    }
    if ((this.state.simulation.gathering[`social-${id}`] || 0) > this.now) {
      this.message(
        "Dê tempo à conversa. Novos encontros fortalecem uma amizade.",
        "warning",
      );
      return;
    }
    if (
      verb === "court" &&
      (this.state.apostle.age < 16 ||
        npc.relation < 25 ||
        this.state.inventory.bread < 1 ||
        this.state.apostle.partnerId)
    ) {
      this.message(
        "Cortejar exige afinidade 25, um pão e disponibilidade para uma relação.",
        "warning",
      );
      return;
    }
    this.state.simulation.gathering[`social-${id}`] = this.now + 72;
    const bonus = Math.floor(this.state.apostle.attributes.charisma / 5);
    npc.relation = Math.min(
      100,
      npc.relation + (verb === "court" ? 12 : 7) + bonus,
    );
    npc.trust = Math.min(100, npc.trust + (verb === "court" ? 7 : 8));
    if (verb === "court") this.state.inventory.bread--;
    const memory: Memory = {
      id: `npc-${id}-${this.now}`,
      day: this.state.day,
      title: verb === "court" ? "Uma atenção especial" : "Uma ajuda lembrada",
      text: `${this.state.apostle.name} me ouviu e compartilhou seu tempo comigo.`,
      emotion: "Lealdade",
      intensity: npc.trust,
    };
    (this.state.simulation.npcMemories[id] ||= []).push(memory);
    if (this.state.simulation.npcMemories[id].length > 30)
      this.state.simulation.npcMemories[id].shift();
    this.state.apostle.personality.compassion = Math.min(
      100,
      this.state.apostle.personality.compassion + 0.5,
    );
    this.practice("leadership", 0.5);
    this.remember(
      verb === "court" ? "Uma afinidade floresce" : "Uma nova conversa",
      `Compartilhei um momento com ${npc.name}. Nossa confiança cresceu.`,
      verb === "court" ? "Afeto" : "Amizade",
      40,
    );
    this.message(
      `${npc.name}: afinidade ${Math.round(npc.relation)}, confiança ${Math.round(npc.trust)}.`,
      "success",
    );
  }
  private haveChild(): void {
    const spouseId = this.state.apostle.partnerId;
    const spouse = this.state.family.find(
      (person) => person.id === spouseId && person.alive,
    );
    if (!spouse || !spouseId) {
      this.message(
        "Forme uma união familiar antes de ter uma criança.",
        "warning",
      );
      return;
    }
    if (!this.nearNpc(spouseId) && !this.nearObject("property")) {
      this.message(
        "Encontre seu companheiro ou vá até o lar da família.",
        "warning",
      );
      return;
    }
    if (
      this.state.day -
        (this.state.simulation.marriedAt[spouseId] ?? this.state.day) <
        16 ||
      this.state.day - this.state.simulation.lastChildDay < 16
    ) {
      this.message(
        "A família precisa de dezesseis dias entre união e chegada de uma criança.",
        "warning",
      );
      return;
    }
    const count = this.state.family.filter((person) =>
      person.parents.includes(this.state.apostle.id),
    ).length;
    const names = ["Elian", "Alina", "Theo", "Clara"];
    const child: Person = {
      id: `child-${this.state.day}-${this.messageId}`,
      name: names[count % names.length],
      surname: this.state.apostle.surname,
      sex: count % 2 ? "female" : "male",
      skin: this.state.apostle.skin,
      hair: this.state.apostle.hair,
      eyes: spouse.eyes,
      outfit: "#a3af83",
      age: 0,
      birthDay: this.state.day,
      alive: true,
      generation: this.state.apostle.generation + 1,
      parents: [this.state.apostle.id, spouse.id],
      title: "Herdeiro da linhagem",
    };
    this.state.family.push(child);
    registerChildEducation(this.state, child);
    recordLifeEvent(this.state, { day: this.state.day, kind: "birth", personId: child.id,
      relatedId: this.state.apostle.id, text: `${child.name} nasceu na Casa ${child.surname}.`, gold: 0, property: false });
    this.state.simulation.lastChildDay = this.state.day;
    this.remember(
      "Uma vida começa",
      `${child.name} nasceu. Nosso sobrenome agora carrega mais uma história.`,
      "Amor",
      100,
    );
    this.message(`${child.name} chegou à família.`, "success");
  }
  eligibleSuccessors(): Person[] {
    const current = this.state.apostle;
    return this.state.family.filter(
      (person) =>
        person.alive &&
        (person.id === current.partnerId ||
          person.partnerId === current.id ||
          person.parents.includes(current.id)),
    );
  }
  private succeed(id: string): void {
    if (this.state.phase !== "dead") return;
    const successor = this.eligibleSuccessors().find(
      (person) => person.id === id,
    );
    if (!successor) return;
    const previous = clone(this.state.apostle);
    const legacy = previous.memories.slice(-40);
    this.state.family = this.state.family.filter((person) => person.id !== id);
    this.state.family.push(previous);
    this.state.npcs = this.state.npcs.filter((npc) => npc.id !== id);
    const fresh = newApostle({
      name: successor.name,
      surname: successor.surname,
      sex: successor.sex,
      skin: successor.skin,
      hair: successor.hair,
      eyes: successor.eyes,
      outfit: successor.outfit,
      blessing: previous.blessing,
    });
    Object.assign(fresh, successor);
    fresh.alive = true;
    fresh.hp = fresh.maxHp;
    fresh.stamina = fresh.maxStamina;
    fresh.x = 1900;
    fresh.y = 1100;
    if (fresh.partnerId === previous.id) delete fresh.partnerId;
    fresh.title =
      fresh.age < 16 ? "Herdeiro sob regência" : this.state.territory.charter ? "Guardião de Alvor" : "Guardião da linhagem";
    fresh.memories = legacy.map((memory) => ({
      ...memory,
      title: `Legado · ${memory.title.replace(/^(Legado · )+/, "")}`,
    }));
    fresh.skills.leadership = Math.min(15, previous.skills.leadership * 0.2);
    this.state.apostle = fresh;
    applyEducationToSuccessor(this.state, fresh);
    this.reconcileLifeReferences();
    recordLifeEvent(this.state, { day: this.state.day, kind: "inheritance", personId: fresh.id,
      relatedId: previous.id, text: `${fresh.name} herdou o legado de ${previous.name}${this.state.property.owned ? ", incluindo a Parcela do Moinho" : ""}.`, gold: this.state.gold, property: this.state.property.owned });
    cancelWork(this.state);
    this.state.phase = "playing";
    this.state.zone = "village";
    this.state.intro = false;
    reconcileWorker(this.state, this.economicHooks());
    this.npcRoutes.clear();
    this.attackCooldown = this.dodgeCooldown = this.invulnerability = 0;
    this.enemyCooldowns = {};
    delete this.state.simulation.companionId;
    delete this.state.simulation.autonomousUntil;
    delete this.state.simulation.autonomousReason;
    this.remember(
      "A linhagem continua",
      `Recebi o legado de ${previous.name}. A terra, os vínculos e as lembranças seguem comigo.${fresh.age < 16 ? " Um regente me protege até os dezesseis anos." : ""}`,
      "Responsabilidade",
      95,
    );
    this.message(
      `${fresh.name} assume a linhagem${fresh.age < 16 ? " sob regência" : ""}.`,
      "success",
    );
    this.scheduleAutoSave();
    this.notify();
  }

  exportCampaign(): string {
    if (!this.state.started) throw new Error("Crie ou retome uma campanha antes de exportar.");
    syncTerritoryDeeds(this.state);
    return serializeCampaign(this.state);
  }

  async importCampaign(text: string): Promise<void> {
    // Stop a pending save of the old state from overwriting the imported campaign.
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    const imported = await importSavedCampaign(text);
    this.restoreSnapshot(imported);
    this.message("Campanha importada. O tempo permaneceu pausado durante a transferência.", "success");
    this.notify();
  }

  private restoreSnapshot(snapshot: GameState): boolean {
    this.state = snapshot as PersistentGameState;
    const simulation = this.state.simulation as Partial<SimulationMemory> | undefined;
    this.state.simulation = {
      ...simulation,
      marriedAt: simulation?.marriedAt || {}, gathering: simulation?.gathering || {},
      npcMemories: simulation?.npcMemories || {}, lastChildDay: simulation?.lastChildDay ?? -100,
    };
    const recovered = this.recoverPositions();
    // A legacy position correction cannot be used to finish remote work.
    if (this.state.frontier.work) {
      const node = resourceNode(this.state.frontier.work.nodeId);
      if (!node || node.zone !== this.state.zone || distance(this.state.apostle, node) > 120)
        cancelWork(this.state);
    }
    this.reconcileLifeReferences();
    this.state.phase = this.state.apostle.alive ? "playing" : "dead";
    this.state.started = true;
    this.messageId = Math.max(0, ...this.state.messages.map(message => message.id));
    this.attackCooldown = this.dodgeCooldown = this.invulnerability = 0;
    this.enemyCooldowns = {};
    this.activeDialog = null;
    this.announceAccumulator = this.autosaveAccumulator = 0;
    return recovered;
  }

  async save(): Promise<void> {
    if (!this.state.started) return;
    syncTerritoryDeeds(this.state);
    const oldSavedAt = this.state.savedAt;
    this.state.savedAt = Date.now();
    try {
      await saveGame(this.state);
      this.message("Jornada salva neste dispositivo.", "success");
    } catch (error) {
      this.state.savedAt = oldSavedAt;
      this.message(
        `Não foi possível salvar: ${error instanceof Error ? error.message : "armazenamento indisponível"}.`,
        "warning",
      );
      this.notify();
      throw error;
    }
    this.notify();
  }
  async load(): Promise<boolean> {
    try {
      const saved = await loadGame();
      if (!saved) {
        const error = getPersistenceError();
        if (error) {
          this.message(error, "warning");
          this.notify();
        }
        return false;
      }
      const recoveredPosition = this.restoreSnapshot(saved);
      if (recoveredPosition) this.message(
        "O caminho foi ajustado para um ponto seguro após a atualização das colisões.",
        "info",
      );
      this.message(
        getPersistenceError() ||
          "Jornada retomada. O tempo ficou pausado enquanto você estava fora.",
        getPersistenceError() ? "warning" : "success",
      );
      this.notify();
      return true;
    } catch (error) {
      this.message(
        `Não foi possível abrir a jornada: ${error instanceof Error ? error.message : "erro de leitura"}.`,
        "warning",
      );
      this.notify();
      return false;
    }
  }
  async hasSave(): Promise<boolean> {
    return hasSavedGame();
  }
}

export const store = new GameStore();

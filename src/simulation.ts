import { ITEMS, OBJECTS, WORLD_H, WORLD_W } from "./data";
import type {
  Apostle,
  Attributes,
  Blessing,
  Creation,
  Dialog,
  Enemy,
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
  return {
    version: 1,
    started: false,
    intro: true,
    phase: "title",
    apostle: newApostle(),
    gold: 0,
    inventory: Object.fromEntries(ITEM_IDS.map((id) => [id, 0])) as Record<
      ItemId,
      number
    >,
    minutes: 480,
    day: 1,
    timeScale: 6,
    zone: "orphanage",
    npcs: newNpcs(),
    enemies: newEnemies(),
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

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify(text?: string, type = "info"): void {
    if (text) this.message(text, type);
    for (const listener of this.listeners) listener();
  }
  private scheduleAutoSave(): void {
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
    const object = OBJECTS.find((object) => object.id === id);
    return (
      !!object &&
      this.state.zone === "village" &&
      distance(this.state.apostle, object) <= radius
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

  create(creation: Creation): void {
    this.state = initialState();
    this.state.apostle = newApostle(creation);
    this.state.started = true;
    this.state.phase = "playing";
    this.attackCooldown = this.dodgeCooldown = this.invulnerability = 0;
    this.enemyCooldowns = {};
    this.activeDialog = null;
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
    apostle.stamina = Math.min(
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
      apostle.title = "Guardião da linhagem";
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
    // Villagers produce and consume even when the player is elsewhere.
    market.bread = Math.min(40, market.bread + 4);
    market.wheat = Math.min(40, market.wheat + 3);
    market.seed = Math.min(24, market.seed + 2);
    market.herb = Math.min(20, market.herb + 1);
    market.wood = Math.min(36, market.wood + 3);
    market.stone = Math.min(30, market.stone + 2);
    this.state.merchantGold = Math.min(1200, this.state.merchantGold + 55);
    if (property.building) {
      this.state.gold += 6;
      if (property.harvests > 0) inventory.bread++;
    }
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
    for (const npc of this.state.npcs)
      npc.mood =
        npc.trust >= 60
          ? "Amigável"
          : this.state.day % 3 === 0
            ? "Pensativo"
            : "Tranquilo";
    if (
      this.state.zone !== "dungeon" &&
      this.state.enemies.every((enemy) => !enemy.alive)
    )
      this.state.enemies = newEnemies();
    if (
      property.plantedAt !== null &&
      this.state.day - property.plantedAt === 2
    )
      this.message(
        "O trigo amadureceu. Volte à sua parcela para colher.",
        "success",
      );
  }
  private updateNpcs(delta: number): void {
    const hour = this.state.minutes / 60;
    for (const npc of this.state.npcs) {
      if (npc.id === "matron") continue;
      if (
        this.state.zone === "dungeon" &&
        this.state.simulation.companionId === npc.id
      ) {
        npc.x = this.state.apostle.x + 40;
        npc.y = this.state.apostle.y + 35;
        continue;
      }
      const working = hour >= 7 && hour < 18;
      const workplaces: Record<string, { x: number; y: number }> = {
        merchant: { x: 1280, y: 940 },
        mira: { x: 1460, y: 1000 },
        aldric: { x: 1560, y: 790 },
        guard: { x: 2050, y: 450 },
        farmer: { x: 1830, y: 1040 },
      };
      const destination = working
        ? workplaces[npc.id]
        : hour < 22 && hour >= 18
          ? { x: 920 + this.state.npcs.indexOf(npc) * 40, y: 1200 }
          : { x: npc.homeX, y: npc.homeY };
      if (!destination) continue;
      const amount = Math.min(1, delta * 0.2);
      npc.x += (destination.x - npc.x) * amount;
      npc.y += (destination.y - npc.y) * amount;
    }
  }
  move(dx: number, dy: number, deltaSeconds: number): void {
    if (
      !this.playing() ||
      !Number.isFinite(dx + dy + deltaSeconds) ||
      deltaSeconds <= 0 ||
      (this.state.simulation.autonomousUntil || 0) > this.now
    )
      return;
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const speed = this.state.apostle.age < 16 ? 130 : 170;
    const limitX = this.state.zone === "village" ? WORLD_W : 900;
    const limitY = this.state.zone === "village" ? WORLD_H : 900;
    this.state.apostle.x = clamp(
      this.state.apostle.x + (dx / length) * speed * deltaSeconds,
      35,
      limitX - 35,
    );
    this.state.apostle.y = clamp(
      this.state.apostle.y + (dy / length) * speed * deltaSeconds,
      35,
      limitY - 35,
    );
  }
  attack(): void {
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
      apostle.x = clamp(
        apostle.x + ((exit.x - apostle.x) / range) * 205 * delta,
        35,
        865,
      );
      apostle.y = clamp(
        apostle.y + ((exit.y - apostle.y) / range) * 205 * delta,
        35,
        865,
      );
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
        enemy.x += ((apostle.x - enemy.x) / range) * speed;
        enemy.y += ((apostle.y - enemy.y) / range) * speed;
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
    this.state.apostle.hp = Math.max(0, this.state.apostle.hp - amount);
    if (this.state.apostle.hp === 0) {
      const apostle = this.state.apostle;
      apostle.alive = false;
      this.state.phase = "dead";
      this.state.deaths++;
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
  getNearest(): { id: string; label: string; distance: number } | null {
    if (!this.playing()) return null;
    const points: { id: string; label: string; x: number; y: number }[] =
      this.state.zone === "village"
        ? [
            ...OBJECTS,
            ...this.state.npcs
              .filter((npc) => npc.id !== "matron")
              .map((npc) => ({ ...npc, label: npc.name })),
          ]
        : this.state.zone === "orphanage"
          ? [
              { id: "exit", label: "Saída do orfanato", x: 450, y: 790 },
              { id: "matron", label: "Irmã Elara", x: 400, y: 290 },
            ]
          : [{ id: "exit", label: "Voltar a Valeverde", x: 450, y: 790 }];
    const nearest = points
      .map((point) => ({
        id: point.id,
        label: point.label,
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
    this.state.zone = zone;
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
      this.state.apostle.x = this.state.intro ? 710 : 2110;
      this.state.apostle.y = this.state.intro ? 760 : 470;
      delete this.state.simulation.companionId;
    }
    this.activeDialog = null;
    this.notify();
  }

  interact(id: string): Dialog | null {
    if (!this.playing()) return null;
    if (id === "exit") {
      if (
        distance(this.state.apostle, { x: 450, y: 790 }) > 190 ||
        this.state.zone === "village"
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
    if (id === "market" || id === "forge")
      return {
        name: id === "forge" ? "Forja de Aldric" : "Mercado de Valeverde",
        role: "Comércio local",
        text: "Os preços acompanham o estoque, sua experiência e sua bênção. Abra o mercado para negociar com os recursos da aldeia.",
        options: [
          { label: "Abrir mercado", action: "open-market" },
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
    if (id === "tree1" || id === "herb1" || id === "stone1") {
      this.gather(id);
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
  private propertyDialog(): Dialog {
    const p = this.state.property;
    return {
      name: p.name,
      role: p.owned
        ? "Sua propriedade · Reino de Valeverde"
        : "Terra à venda · Reino de Valeverde",
      text: p.owned
        ? `Plante sementes, espere dois dias e colha trigo. Uma casa rende 6 ouro por dia e transforma sua experiência de colheita em um pão diário. ${p.plantedAt === null ? "A terra está pronta para plantar." : `Colheita em ${Math.max(0, 2 - (this.state.day - p.plantedAt))} dias.`}`
        : `Esta parcela custa ${p.cost} ouro. A terra pertence à sua linhagem e será transmitida ao sucessor.`,
      options: p.owned
        ? [
            {
              label: "Plantar · 1 semente",
              action: "plant",
              disabled: p.plantedAt !== null || this.state.inventory.seed < 1,
            },
            {
              label: "Colher trigo",
              action: "harvest",
              disabled:
                p.plantedAt === null || this.state.day - p.plantedAt < 2,
            },
            {
              label: "Construir casa · 12 madeira, 8 pedra, 60 ouro",
              action: "build",
              disabled: p.building,
            },
            { label: "Voltar", action: "close" },
          ]
        : [
            {
              label: `Comprar parcela · ${p.cost} ouro`,
              action: "acquire-property",
              disabled: this.state.gold < p.cost,
            },
            { label: "Voltar", action: "close" },
          ],
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
    if (this.activeDialog === "sign" && this.nearObject("sign"))
      return this.questDialog();
    return null;
  }
  private gather(id: string): void {
    if ((this.state.simulation.gathering[id] || 0) > this.now) {
      this.message(
        "Este recurso precisa de um pouco de tempo para se renovar.",
        "warning",
      );
      return;
    }
    if (this.state.apostle.stamina < 6) {
      this.message("Recupere energia antes de trabalhar.", "warning");
      return;
    }
    this.state.apostle.stamina -= 6;
    this.state.simulation.gathering[id] = this.now + 36;
    const item = id === "tree1" ? "wood" : id === "stone1" ? "stone" : "herb";
    const quantity = item === "wood" ? 3 : item === "stone" ? 2 : 1;
    this.state.inventory[item] += quantity;
    this.practice(item === "stone" ? "mining" : "farming", 0.3);
    this.message(`+${quantity} ${ITEMS[item].name}.`, "success");
  }
  act(action: string): void {
    if (action.startsWith("succeed:")) {
      this.succeed(action.slice(8));
      return;
    }
    if (!this.playing()) return;
    const [verb, id] = action.split(":");
    const item = id as ItemId;
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
        if (!p.owned && this.state.gold >= p.cost) {
          this.state.gold -= p.cost;
          p.owned = true;
          this.remember(
            "Minhas próprias raízes",
            "Comprei a Parcela do Moinho no Reino de Valeverde. Esta terra pertencerá à minha linhagem.",
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
        if (p.plantedAt === null && this.state.inventory.seed > 0) {
          this.state.inventory.seed--;
          p.plantedAt = this.state.day;
          this.practice("farming", 1);
          this.message(
            "Sementes plantadas. O trigo cresce em dois dias.",
            "success",
          );
        } else
          this.message(
            p.plantedAt !== null
              ? "Já há uma plantação crescendo."
              : "Você precisa de sementes.",
            "warning",
          );
      } else if (action === "harvest") {
        if (p.plantedAt !== null && this.state.day - p.plantedAt >= 2) {
          const amount = 6 + Math.floor(this.state.apostle.skills.farming / 15);
          this.state.inventory.wheat += amount;
          this.state.inventory.seed++;
          p.plantedAt = null;
          p.harvests++;
          this.practice("farming", 3);
          this.message(`Colheita: ${amount} trigo e 1 semente.`, "success");
        } else this.message("O trigo ainda não está pronto.", "warning");
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
          this.practice("building", 5);
          this.remember(
            "Um lar para a linhagem",
            "Ergui uma casa em nossa parcela. Agora temos um lar que pode atravessar gerações.",
            "Segurança",
            90,
          );
          this.message("Casa construída · +6 ouro por dia.", "success");
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
      fresh.age < 16 ? "Herdeiro sob regência" : "Guardião da linhagem";
    fresh.memories = legacy.map((memory) => ({
      ...memory,
      title: `Legado · ${memory.title}`,
    }));
    fresh.skills.leadership = Math.min(15, previous.skills.leadership * 0.2);
    this.state.apostle = fresh;
    this.state.phase = "playing";
    this.state.zone = "village";
    this.state.intro = false;
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

  async save(): Promise<void> {
    if (!this.state.started) return;
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
      this.state = saved as PersistentGameState;
      const simulation = this.state.simulation as
        | Partial<SimulationMemory>
        | undefined;
      this.state.simulation = {
        ...simulation,
        marriedAt: simulation?.marriedAt || {},
        gathering: simulation?.gathering || {},
        npcMemories: simulation?.npcMemories || {},
        lastChildDay: simulation?.lastChildDay ?? -100,
      };
      this.state.phase = this.state.apostle.alive ? "playing" : "dead";
      this.state.started = true;
      this.messageId = Math.max(
        0,
        ...this.state.messages.map((message) => message.id),
      );
      this.attackCooldown = this.dodgeCooldown = this.invulnerability = 0;
      this.enemyCooldowns = {};
      this.activeDialog = null;
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

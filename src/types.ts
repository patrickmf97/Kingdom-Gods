export type Blessing = "vigor" | "wisdom" | "fortune";
export type InteriorZone = "orphanage" | "inn-room" | "forge-room" | "mill-room" | "bakery-room" | "mira-room" | "farm-store-room" | "farmhouse-room" | "oak-room" | "stone-room" | "camp-room" | "ranger-room" | "chapel-room";
export type OutdoorZone = "village" | "wilderness" | "highlands";
export type Zone = OutdoorZone | InteriorZone | "dungeon" | "mine";
export type Panel =
  | "inventory"
  | "character"
  | "journal"
  | "relations"
  | "family"
  | "property"
  | "market"
  | "crafting"
  | "map"
  | "help"
  | null;
export type ItemId =
  | "bread"
  | "wood"
  | "stone"
  | "wheat"
  | "flour"
  | "seed"
  | "sword"
  | "herb"
  | "ore";
export type AnimalSpecies = "chicken" | "sheep" | "cow" | "dog" | "deer" | "rabbit" | "fox";
export type AnimalBehavior = "idle" | "walk" | "graze" | "rest" | "flee" | "approach";
export interface AnimalState {
  id: string;
  species: AnimalSpecies;
  zone: Zone;
  x: number;
  y: number;
  facing: number;
  behavior: AnimalBehavior;
  target: Point | null;
  wait: number;
  trust: number;
  fear: number;
  lastFedDay: number | null;
  seed: number;
}
export interface WildlifeState {
  animals: Record<string, AnimalState>;
  observed: string[];
}
export type Attributes = Record<
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma"
  | "perception"
  | "will"
  | "vitality"
  | "endurance"
  | "energy",
  number
>;
export interface Memory {
  id: string;
  day: number;
  title: string;
  text: string;
  emotion: string;
  intensity: number;
}
export interface Person {
  id: string;
  name: string;
  surname: string;
  sex: string;
  skin: string;
  hair: string;
  eyes: string;
  outfit: string;
  age: number;
  birthDay: number;
  alive: boolean;
  generation: number;
  parents: string[];
  partnerId?: string;
  title: string;
}
export interface Apostle extends Person {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  blessing: Blessing;
  attributes: Attributes;
  skills: Record<string, number>;
  personality: {
    compassion: number;
    courage: number;
    loyalty: number;
    anger: number;
  };
  memories: Memory[];
  equipment: ItemId | null;
}
export interface Npc {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  color: string;
  relation: number;
  trust: number;
  mood: string;
  zone: Zone;
}
export interface Enemy {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}
export interface Property {
  owned: boolean;
  id: string;
  name: string;
  cost: number;
  kingdom: string;
  plantedAt: number | null;
  harvests: number;
  building: boolean;
}
export interface GameState {
  version: number;
  started: boolean;
  intro: boolean;
  phase: "title" | "creation" | "playing" | "dead";
  apostle: Apostle;
  gold: number;
  inventory: Record<ItemId, number>;
  minutes: number;
  day: number;
  timeScale: number;
  zone: Zone;
  npcs: Npc[];
  enemies: Enemy[];
  market: Record<ItemId, number>;
  merchantGold: number;
  property: Property;
  family: Person[];
  quest: "available" | "accepted" | "complete" | "claimed" | "expired";
  kills: number;
  messages: { id: number; text: string; type: string }[];
  savedAt: number | null;
  deaths: number;
  economy: EconomyState;
  frontier: FrontierState;
  life: LifeState;
  territory: TerritoryState;
  wildlife: WildlifeState;
}

export type EstateId = "oak-hollow" | "stone-rise";
export type EstateBuilding = "none" | "warehouse" | "shelter";
export interface EstateHolding {
  owned: boolean;
  registeredDay: number | null;
  building: EstateBuilding;
  condition: number;
  storage: Record<ItemId, number>;
}
export interface TerritoryState {
  parcels: Record<EstateId, EstateHolding>;
  influence: number;
  deeds: string[];
  charter: boolean;
  arrears: number;
  lastTaxDay: number;
}

export type ToolId = "axe" | "pickaxe";
export interface ResourceNodeDefinition extends WorldObject {
  zone: Zone;
  resource: ItemId;
  tool: ToolId | null;
  duration: number;
  stamina: number;
  yield: number;
  capacity: number;
  respawnDays: number;
  skill: string;
}
export interface WorkProgress {
  nodeId: string;
  zone: Zone;
  elapsed: number;
  duration: number;
}
export interface FrontierJob {
  id: string;
  title: string;
  description: string;
  kind: "survey" | "delivery";
  item: ItemId | null;
  quantity: number;
  targets: string[];
  reward: number;
  deadline: number;
  status: "available" | "accepted" | "complete" | "claimed" | "resolved" | "failed";
}
export interface FrontierState {
  tools: Record<ToolId, { owned: boolean; durability: number }>;
  toolStock: Record<ToolId, number>;
  resources: Record<string, { remaining: number; readyDay: number | null }>;
  work: WorkProgress | null;
  discovered: string[];
  jobs: FrontierJob[];
  escrow: number;
}
export type EducationFocus = "farming" | "mining" | "wisdom";
export interface EducationProfile {
  focus: EducationFocus;
  guardianId: string | null;
  practice: number;
  bond: number;
  lessons: number;
  lastLessonDay: number;
}
export interface LegacyEvent {
  day: number;
  kind: "birth" | "marriage" | "death" | "inheritance" | "education";
  personId: string;
  relatedId: string | null;
  text: string;
  gold: number;
  property: boolean;
}
export interface LifeState {
  needs: Record<string, { hunger: number; fatigue: number; goal: "work" | "eat" | "rest" | "socialize" }>;
  education: Record<string, EducationProfile>;
  history: LegacyEvent[];
  heirId: string | null;
  guardianId: string | null;
}

export interface ExpansionHooks {
  message: (text: string, type?: string) => void;
  remember: (title: string, text: string, emotion: string, intensity?: number) => void;
  practice: (skill: string, amount: number) => void;
  nearObject: (id: string) => boolean;
  nearNpc: (id: string) => boolean;
  rememberNpc?: (id: string, title: string, text: string, emotion: string) => void;
  rest?: (hours: number, healing: number) => void;
}
export type Season = "Primavera" | "Verão" | "Outono" | "Inverno";
export interface CropPlan {
  season: Season;
  readyDay: number;
  yield: number;
}
export interface WorkerContract {
  npcId: string;
  wage: number;
  hiredDay: number;
  loyalty: number;
  unpaidDays: number;
}
export interface EconomicEntry {
  day: number;
  type: string;
  text: string;
  goldDelta: number;
}
export interface VillageOrder {
  id: string;
  title: string;
  item: ItemId;
  quantity: number;
  reward: number;
  createdDay: number;
  deadline: number;
  status: "available" | "accepted" | "fulfilled" | "resolved" | "failed";
}
export interface EconomyState {
  condition: number;
  crop: CropPlan | null;
  worker: WorkerContract | null;
  npcSavings: Record<string, number>;
  ledger: EconomicEntry[];
  orders: VillageOrder[];
  civicFunds: number;
  prosperity: number;
  lastOrderDay: number;
}
export interface Recipe {
  id: string;
  name: string;
  station: string;
  inputs: Partial<Record<ItemId, number>>;
  outputs: Partial<Record<ItemId, number>>;
  stamina: number;
  skill: string;
  description: string;
}
export interface Creation {
  name: string;
  surname: string;
  sex: string;
  skin: string;
  hair: string;
  eyes: string;
  outfit: string;
  blessing: Blessing;
}
export interface DialogOption {
  label: string;
  action: string;
  disabled?: boolean;
}
export interface Dialog {
  name: string;
  role: string;
  text: string;
  options: DialogOption[];
}
export interface Point {
  x: number;
  y: number;
}
export interface WorldObject {
  id: string;
  kind: string;
  x: number;
  y: number;
  label: string;
  w?: number;
  h?: number;
}

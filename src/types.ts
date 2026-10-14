export type Blessing = "vigor" | "wisdom" | "fortune";
export type Zone = "village" | "orphanage" | "dungeon";
export type Panel =
  | "inventory"
  | "character"
  | "journal"
  | "relations"
  | "family"
  | "property"
  | "market"
  | "map"
  | "help"
  | null;
export type ItemId =
  | "bread"
  | "wood"
  | "stone"
  | "wheat"
  | "seed"
  | "sword"
  | "herb"
  | "ore";
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

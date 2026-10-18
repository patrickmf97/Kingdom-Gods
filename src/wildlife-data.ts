import type { AnimalSpecies, ItemId, Zone } from "./types";

export interface AnimalDefinition {
  id: string;
  species: AnimalSpecies;
  zone: Zone;
  name: string;
  homeX: number;
  homeY: number;
  radius: number;
  speed: number;
  domestic: boolean;
  feed: ItemId | null;
}

/** Stable inhabitants; habitats describe movement space, never physical walls. */
export const ANIMAL_DEFS: readonly AnimalDefinition[] = [
  { id: "chicken-1", species: "chicken", zone: "village", name: "Pipoca", homeX: 1810, homeY: 1140, radius: 95, speed: 27, domestic: true, feed: "wheat" },
  { id: "chicken-2", species: "chicken", zone: "village", name: "Canela", homeX: 1875, homeY: 1180, radius: 95, speed: 29, domestic: true, feed: "wheat" },
  { id: "chicken-3", species: "chicken", zone: "village", name: "Pena", homeX: 1935, homeY: 1130, radius: 95, speed: 26, domestic: true, feed: "wheat" },
  { id: "chicken-4", species: "chicken", zone: "village", name: "Dourada", homeX: 1900, homeY: 1230, radius: 95, speed: 28, domestic: true, feed: "wheat" },
  { id: "sheep-1", species: "sheep", zone: "village", name: "Nuvem", homeX: 1410, homeY: 1530, radius: 125, speed: 30, domestic: true, feed: "wheat" },
  { id: "sheep-2", species: "sheep", zone: "village", name: "Floco", homeX: 1490, homeY: 1580, radius: 125, speed: 31, domestic: true, feed: "wheat" },
  { id: "sheep-3", species: "sheep", zone: "village", name: "Lãzinha", homeX: 1540, homeY: 1500, radius: 125, speed: 29, domestic: true, feed: "wheat" },
  { id: "cow-1", species: "cow", zone: "village", name: "Aurora", homeX: 1840, homeY: 1460, radius: 110, speed: 25, domestic: true, feed: "wheat" },
  { id: "cow-2", species: "cow", zone: "village", name: "Malhada", homeX: 1920, homeY: 1530, radius: 110, speed: 24, domestic: true, feed: "wheat" },
  { id: "dog-1", species: "dog", zone: "village", name: "Bento", homeX: 1160, homeY: 950, radius: 105, speed: 46, domestic: true, feed: "bread" },
  { id: "deer-1", species: "deer", zone: "wilderness", name: "Cervo da baixada", homeX: 620, homeY: 1050, radius: 140, speed: 67, domestic: false, feed: "wheat" },
  { id: "deer-2", species: "deer", zone: "wilderness", name: "Cerva do bosque", homeX: 1060, homeY: 730, radius: 150, speed: 65, domestic: false, feed: "wheat" },
  { id: "deer-3", species: "deer", zone: "wilderness", name: "Cervo da serra", homeX: 1660, homeY: 630, radius: 135, speed: 68, domestic: false, feed: "wheat" },
  { id: "deer-4", species: "deer", zone: "wilderness", name: "Cerva do lago", homeX: 2660, homeY: 1910, radius: 120, speed: 64, domestic: false, feed: "wheat" },
  { id: "rabbit-1", species: "rabbit", zone: "wilderness", name: "Coelho da baixada", homeX: 480, homeY: 400, radius: 85, speed: 55, domestic: false, feed: "wheat" },
  { id: "rabbit-2", species: "rabbit", zone: "wilderness", name: "Coelho do bosque", homeX: 1000, homeY: 1020, radius: 85, speed: 57, domestic: false, feed: "wheat" },
  { id: "rabbit-3", species: "rabbit", zone: "wilderness", name: "Coelho da campina", homeX: 1280, homeY: 1890, radius: 85, speed: 56, domestic: false, feed: "wheat" },
  { id: "rabbit-4", species: "rabbit", zone: "wilderness", name: "Coelho do vale", homeX: 1830, homeY: 1900, radius: 85, speed: 54, domestic: false, feed: "wheat" },
  { id: "rabbit-5", species: "rabbit", zone: "wilderness", name: "Coelho do urzal", homeX: 2780, homeY: 1280, radius: 85, speed: 58, domestic: false, feed: "wheat" },
  { id: "rabbit-6", species: "rabbit", zone: "wilderness", name: "Coelho da colina", homeX: 2700, homeY: 490, radius: 85, speed: 55, domestic: false, feed: "wheat" },
  { id: "fox-1", species: "fox", zone: "wilderness", name: "Raposa do poente", homeX: 420, homeY: 800, radius: 130, speed: 61, domestic: false, feed: null },
  { id: "fox-2", species: "fox", zone: "wilderness", name: "Raposa da encosta", homeX: 2540, homeY: 780, radius: 130, speed: 63, domestic: false, feed: null },
];

const definitions = new Map(ANIMAL_DEFS.map(definition => [definition.id, definition]));
export function animalDefinition(id: string): AnimalDefinition | undefined {
  return definitions.get(id);
}

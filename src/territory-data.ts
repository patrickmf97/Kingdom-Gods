import { ITEMS } from "./data";
import type { EstateHolding, EstateId, GameState, ItemId, WorldObject } from "./types";

export interface EstateDefinition {
  id: EstateId;
  name: string;
  kingdom: "Auren";
  zone: "wilderness";
  x: number;
  y: number;
  width: number;
  height: number;
  cost: number;
  description: string;
}

/** Authored legal parcels: ownership never expands beyond these boundaries. */
export const ESTATE_DEFS: EstateDefinition[] = [
  {
    id: "oak-hollow",
    name: "Clareira do Carvalho",
    kingdom: "Auren",
    zone: "wilderness",
    x: 1100,
    y: 1740,
    width: 220,
    height: 180,
    cost: 80,
    description: "Uma clareira registrada junto ao caminho de Valeverde. A posse permanece vinculada ao Reino de Auren.",
  },
  {
    id: "stone-rise",
    name: "Alto da Pedra",
    kingdom: "Auren",
    zone: "wilderness",
    x: 1880,
    y: 1370,
    width: 220,
    height: 180,
    cost: 120,
    description: "Um terreno elevado entre as rotas da mina e do lago, sujeito ao registro e aos tributos de Auren.",
  },
];

export const ESTATE_BUILDINGS = {
  warehouse: {
    name: "Armazém",
    wood: 8,
    stone: 4,
    stamina: 10,
    description: "Guarda até 120 de peso. Os bens ficam neste terreno e acompanham a herança da casa.",
  },
  shelter: {
    name: "Abrigo de viagem",
    wood: 6,
    stone: 3,
    stamina: 10,
    description: "Descanse quatro horas por uma madeira para a fogueira e recupere 20 de vitalidade e sua energia.",
  },
} as const;

export const ESTATE_STORAGE_CAPACITY = 120;

export function estateObject(id: EstateId): WorldObject {
  const definition = ESTATE_DEFS.find(estate => estate.id === id)!;
  return {
    id,
    kind: "estate",
    x: definition.x,
    y: definition.y,
    label: definition.name,
    w: definition.width,
    h: definition.height,
  };
}

/** The building base is north of its sign, leaving a clear southern approach. */
export function estateSolid(id: EstateId): { left: number; top: number; right: number; bottom: number } {
  const point = estateObject(id);
  return { left: point.x - 60, top: point.y - 130, right: point.x + 60, bottom: point.y - 65 };
}

export function estateBuildings(state: GameState): EstateId[] {
  return ESTATE_DEFS.filter(estate => {
    const parcel = state.territory.parcels[estate.id];
    return parcel.owned && parcel.building !== "none";
  }).map(estate => estate.id);
}

export function estateStorageWeight(holding: EstateHolding): number {
  return (Object.keys(ITEMS) as ItemId[]).reduce((total, id) => total + holding.storage[id] * ITEMS[id].weight, 0);
}

export function estateLimit(state: GameState): number {
  return state.territory.charter ? 2 : 1;
}

/** Historical civic orders rotate out of the noticeboard; their earned deeds persist. */
export function territoryDeedValue(id: string): number | null {
  if (/^frontier:(survey-trails|mine-supply|healing-herbs)$/.test(id)) return 4;
  if (id === "harvest:first" || id === "house:first" || /^building:(oak-hollow|stone-rise)$/.test(id)) return 2;
  const civic = /^civic:order-([1-9]\d{0,15})-(bread|wood|herb)$/.exec(id);
  if (civic && Number.isSafeInteger(Number(civic[1]))) return 3;
  return null;
}

export function territoryInfluence(deeds: string[]): number {
  let civicCount = 0;
  let total = 0;
  for (const id of new Set(deeds)) {
    const value = territoryDeedValue(id);
    if (value === null) continue;
    if (id.startsWith("civic:") && civicCount++ >= 6) continue;
    total += value;
  }
  return Math.min(100, total);
}

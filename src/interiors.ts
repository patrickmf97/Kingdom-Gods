import type { RegionDefinition, Rectangle } from "./regions";
import type { GameState, InteriorZone, OutdoorZone, Point, WorldObject, Zone } from "./types";

export type InteriorFurnitureKind =
  | "bed" | "table" | "chair" | "shelf" | "counter" | "oven" | "anvil"
  | "barrel" | "crate" | "sack" | "rug" | "desk" | "stove" | "altar"
  | "bench" | "wardrobe" | "plant" | "basin" | "lantern" | "books" | "wheel" | "grain";

/** Coordinates are the centre of the rendered footprint; rotations are radians. */
export interface InteriorFurniture {
  kind: InteriorFurnitureKind;
  x: number;
  y: number;
  w: number;
  d: number;
  rotation?: number;
  /** Physical furniture blocks by default; surface dressing explicitly opts out. */
  blocking?: boolean;
  color?: number;
}
export interface InteriorDefinition {
  zone: InteriorZone;
  name: string;
  theme: string;
  /** A reachable point directly in front of the visible exterior door. */
  entrance: { zone: OutdoorZone; objectId: string; x: number; y: number };
  spawn: Point;
  exit: Point;
  service?: string;
  stations: WorldObject[];
  furniture: InteriorFurniture[];
}

const prop = (kind: InteriorFurnitureKind, x: number, y: number, w: number, d: number,
  options: Pick<InteriorFurniture, "rotation" | "blocking" | "color"> = {}): InteriorFurniture =>
  ({ kind, x, y, w, d, ...options });
const dressing = (kind: InteriorFurnitureKind, x: number, y: number, w: number, d: number,
  color?: number): InteriorFurniture => prop(kind, x, y, w, d, { blocking: false, ...(color === undefined ? {} : { color }) });
const station = (id: string, kind: string, x: number, y: number, label: string): WorldObject =>
  ({ id, kind, x, y, label });
function room(zone: InteriorZone, name: string, theme: string, entrance: InteriorDefinition["entrance"],
  service: string | undefined, stations: WorldObject[], furniture: InteriorFurniture[]): InteriorDefinition {
  return { zone, name, theme, entrance, spawn: { x: 450, y: 730 }, exit: { x: 450, y: 790 },
    ...(service ? { service } : {}), stations, furniture };
}

/**
 * Authored rooms share their furniture record with rendering and navigation.
 * The central aisle and the southern arrival remain free, and station anchors
 * sit on the usable side of their counter, desk, anvil or hearth.
 */
export const INTERIORS: InteriorDefinition[] = [
  room("orphanage", "Orfanato de Santa Elara", "orphanage",
    { zone: "village", objectId: "orphanage", x: 736, y: 648 }, undefined, [], [
      prop("bed", 165, 250, 90, 145, { color: 0x718b78 }),
      prop("bed", 165, 460, 90, 145, { color: 0x9f7855 }),
      prop("bed", 735, 250, 90, 145, { color: 0x718b78 }),
      prop("bed", 735, 460, 90, 145, { color: 0x9f7855 }),
      prop("shelf", 300, 175, 130, 44), prop("stove", 610, 190, 85, 85),
      prop("desk", 245, 625, 130, 60), prop("chair", 245, 681, 36, 36),
      prop("wardrobe", 720, 620, 100, 58), prop("basin", 125, 650, 38, 38),
      prop("plant", 787, 700, 28, 28),
      dressing("rug", 450, 490, 220, 360, 0x9d6b52),
      dressing("books", 295, 175, 65, 21), dressing("books", 245, 625, 32, 22),
      dressing("lantern", 625, 150, 18, 18), dressing("lantern", 115, 175, 18, 18),
    ]),
  room("inn-room", "Estalagem do Carvalho", "inn",
    { zone: "village", objectId: "inn", x: 1025, y: 1108 }, "inn", [
      station("inn", "house", 235, 330, "Hospedagem do Carvalho"),
      station("market", "market", 665, 330, "Balcão de comércio e abastecimento"),
    ], [
      prop("counter", 235, 270, 245, 65), prop("counter", 665, 270, 220, 65),
      prop("shelf", 680, 175, 210, 40), prop("stove", 130, 180, 70, 70),
      prop("bed", 150, 500, 85, 140, { color: 0x9a7955 }),
      prop("bed", 750, 515, 85, 140, { color: 0x7c8d78 }),
      prop("table", 275, 460, 115, 100), prop("chair", 275, 540, 34, 36),
      prop("table", 630, 490, 105, 90), prop("chair", 630, 565, 34, 36),
      prop("barrel", 125, 660, 44, 44), prop("barrel", 180, 660, 44, 44),
      prop("wardrobe", 730, 675, 105, 60), prop("plant", 790, 365, 28, 28),
      dressing("rug", 450, 510, 155, 330, 0x8e634e),
      dressing("books", 250, 270, 48, 24), dressing("grain", 650, 270, 55, 24),
      dressing("lantern", 585, 175, 18, 18), dressing("lantern", 280, 460, 16, 16),
    ]),
  room("forge-room", "Forja de Aldric", "forge",
    { zone: "village", objectId: "forge", x: 1561, y: 686 }, "forge", [
      station("forge", "forge", 650, 435, "Bigorna e ferramentas de Aldric"),
    ], [
      prop("oven", 175, 250, 145, 145), prop("anvil", 650, 365, 115, 85),
      prop("bench", 190, 500, 165, 65), prop("shelf", 710, 180, 150, 44),
      prop("counter", 690, 650, 150, 65), prop("crate", 745, 535, 60, 60),
      prop("crate", 685, 550, 48, 48), prop("barrel", 125, 650, 48, 48),
      prop("sack", 200, 650, 42, 48), prop("basin", 280, 210, 38, 38),
      prop("chair", 270, 550, 38, 38),
      dressing("books", 690, 650, 42, 27), dressing("grain", 190, 500, 52, 26, 0x797c75),
      dressing("lantern", 790, 180, 18, 18), dressing("lantern", 120, 410, 18, 18),
    ]),
  room("mill-room", "Moinho de Valeverde", "mill",
    { zone: "village", objectId: "mill", x: 1259, y: 450 }, "mill", [
      station("mill", "mill", 255, 675, "Bancada de moagem"),
    ], [
      prop("wheel", 175, 300, 155, 155), prop("grain", 720, 270, 110, 100),
      prop("shelf", 685, 175, 200, 40), prop("counter", 255, 610, 165, 70),
      prop("crate", 155, 495, 60, 60), prop("crate", 225, 500, 50, 50),
      prop("sack", 650, 455, 44, 50), prop("sack", 720, 455, 44, 50),
      prop("sack", 750, 520, 44, 50), prop("barrel", 760, 650, 42, 42),
      prop("desk", 630, 635, 110, 55), prop("chair", 630, 690, 34, 34),
      dressing("grain", 250, 610, 80, 35), dressing("books", 630, 635, 40, 24),
      dressing("lantern", 590, 175, 18, 18), dressing("lantern", 125, 610, 18, 18),
    ]),
  room("bakery-room", "Padaria do Carvalho", "bakery",
    { zone: "village", objectId: "bakery", x: 1233, y: 1436 }, "bakery", [
      station("bakery", "bakery", 235, 565, "Mesa de amassar e fornada"),
    ], [
      prop("oven", 180, 245, 170, 145), prop("table", 235, 480, 200, 110),
      prop("counter", 660, 325, 225, 65), prop("shelf", 660, 175, 220, 42),
      prop("sack", 720, 500, 45, 52), prop("sack", 780, 500, 38, 48),
      prop("barrel", 650, 620, 44, 44), prop("basin", 740, 650, 45, 45),
      prop("bench", 205, 665, 150, 40), prop("crate", 285, 220, 48, 48),
      dressing("grain", 235, 480, 90, 35), dressing("grain", 640, 325, 70, 26),
      dressing("books", 720, 325, 35, 22), dressing("lantern", 570, 175, 18, 18),
      dressing("lantern", 125, 400, 18, 18),
    ]),
  room("mira-room", "Casa de Mira", "home",
    { zone: "village", objectId: "house1", x: 1661, y: 1128 }, "house1", [
      station("house1", "house", 680, 445, "Escrivaninha de Mira"),
    ], [
      prop("bed", 160, 275, 105, 170, { color: 0x788b84 }),
      prop("wardrobe", 275, 175, 105, 60), prop("shelf", 700, 180, 180, 42),
      prop("desk", 680, 380, 155, 70), prop("table", 245, 500, 140, 95),
      prop("bench", 225, 585, 115, 40), prop("stove", 730, 615, 80, 85),
      prop("plant", 125, 640, 35, 35), prop("plant", 790, 455, 28, 28),
      prop("basin", 650, 690, 40, 40), prop("chair", 740, 450, 36, 36),
      dressing("rug", 450, 450, 180, 350, 0x78927f),
      dressing("books", 680, 380, 52, 26), dressing("books", 710, 180, 80, 24),
      dressing("lantern", 615, 180, 18, 18), dressing("lantern", 250, 500, 16, 16),
    ]),
  room("farm-store-room", "Celeiro da Parcela do Moinho", "store",
    { zone: "village", objectId: "farm-store", x: 1970, y: 786 }, "property", [
      station("property", "farm", 250, 420, "Registros e sementes da parcela"),
    ], [
      prop("shelf", 175, 175, 150, 42), prop("shelf", 700, 175, 180, 42),
      prop("counter", 250, 345, 210, 65), prop("desk", 660, 345, 160, 70),
      prop("sack", 145, 520, 46, 54), prop("sack", 220, 540, 46, 54),
      prop("sack", 280, 510, 46, 54), prop("grain", 700, 505, 95, 90),
      prop("barrel", 765, 610, 46, 46), prop("crate", 665, 665, 66, 58),
      prop("crate", 160, 665, 60, 55), prop("basin", 300, 675, 38, 38),
      dressing("books", 250, 345, 50, 26), dressing("books", 670, 345, 36, 22),
      dressing("grain", 690, 175, 72, 25), dressing("lantern", 125, 175, 18, 18),
      dressing("lantern", 775, 175, 18, 18),
    ]),
  room("farmhouse-room", "Moradia da linhagem", "farmhouse",
    { zone: "village", objectId: "farmhouse", x: 2090, y: 815 }, "property", [
      station("property", "farm", 255, 390, "Escrivaninha da propriedade"),
      station("home-bed", "house", 630, 350, "Cama da linhagem"),
    ], [
      prop("bed", 730, 285, 110, 175, { color: 0x938060 }),
      prop("wardrobe", 730, 160, 120, 45), prop("stove", 150, 200, 95, 100),
      prop("desk", 255, 310, 150, 70), prop("table", 245, 500, 150, 90),
      prop("chair", 245, 575, 36, 36), prop("shelf", 650, 515, 150, 45),
      prop("bench", 700, 650, 145, 42), prop("basin", 780, 575, 38, 38),
      prop("plant", 130, 650, 35, 35), prop("barrel", 205, 680, 42, 42),
      dressing("rug", 450, 450, 190, 330, 0x8e7859),
      dressing("books", 255, 310, 48, 24), dressing("books", 665, 515, 60, 24),
      dressing("lantern", 245, 500, 16, 16), dressing("lantern", 780, 175, 18, 18),
    ]),
  room("oak-room", "Abrigo da Clareira do Carvalho", "shelter",
    { zone: "wilderness", objectId: "oak-hollow", x: 1114, y: 1713 }, "oak-hollow", [
      station("oak-hollow", "estate", 680, 420, "Balcão da Clareira do Carvalho"),
    ], [
      prop("bed", 160, 275, 110, 170, { color: 0x7f8c68 }),
      prop("stove", 700, 230, 100, 100), prop("counter", 680, 355, 190, 65),
      prop("table", 240, 500, 145, 90), prop("bench", 240, 585, 135, 40),
      prop("shelf", 285, 175, 115, 42), prop("crate", 670, 545, 65, 60),
      prop("crate", 755, 545, 50, 50), prop("barrel", 735, 675, 46, 46),
      prop("sack", 650, 675, 44, 50), prop("basin", 125, 665, 40, 40),
      dressing("rug", 450, 480, 165, 330, 0x8c815c),
      dressing("books", 675, 355, 45, 24), dressing("books", 285, 175, 50, 24),
      dressing("lantern", 125, 175, 18, 18), dressing("lantern", 240, 500, 16, 16),
    ]),
  room("stone-room", "Casa do Alto da Pedra", "warehouse",
    { zone: "wilderness", objectId: "stone-rise", x: 1894, y: 1343 }, "stone-rise", [
      station("stone-rise", "estate", 255, 420, "Registro do Alto da Pedra"),
    ], [
      prop("shelf", 170, 175, 145, 45), prop("shelf", 700, 175, 190, 45),
      prop("desk", 255, 345, 190, 65), prop("wardrobe", 735, 320, 100, 65),
      prop("bed", 165, 585, 100, 150, { color: 0x7c808b }),
      prop("crate", 640, 490, 62, 60), prop("crate", 720, 490, 62, 60),
      prop("crate", 765, 570, 48, 48), prop("barrel", 655, 660, 46, 46),
      prop("sack", 730, 680, 45, 50), prop("stove", 295, 185, 75, 75),
      prop("chair", 295, 600, 36, 36),
      dressing("rug", 450, 490, 160, 330, 0x7d8381),
      dressing("books", 255, 345, 65, 26), dressing("grain", 700, 175, 75, 26),
      dressing("lantern", 125, 175, 18, 18), dressing("lantern", 790, 175, 18, 18),
    ]),
  room("camp-room", "Tenda dos viajantes", "camp",
    { zone: "wilderness", objectId: "wild-camp", x: 1075, y: 1456 }, "wild-camp", [
      station("wild-camp", "camp", 650, 580, "Fogueira dos viajantes"),
    ], [
      prop("bed", 165, 280, 110, 160, { color: 0x7e895d }),
      prop("bed", 735, 280, 110, 160, { color: 0x92765b }),
      prop("stove", 650, 500, 100, 100), prop("table", 235, 525, 130, 85),
      prop("bench", 235, 605, 120, 36), prop("crate", 150, 680, 54, 50),
      prop("barrel", 720, 660, 44, 44), prop("sack", 780, 650, 38, 46),
      prop("sack", 285, 185, 42, 50), prop("basin", 125, 440, 38, 38),
      dressing("rug", 450, 470, 180, 350, 0x9d7351),
      dressing("books", 235, 525, 42, 24), dressing("grain", 285, 185, 22, 22),
      dressing("lantern", 125, 175, 18, 18), dressing("lantern", 790, 175, 18, 18),
    ]),
  room("ranger-room", "Alojamento dos guardas de Brumavale", "ranger",
    { zone: "highlands", objectId: "highland-ranger-lodge", x: 926, y: 668 }, "highland-ranger-lodge", [
      station("highland-ranger-lodge", "house", 245, 555, "Mesa dos guardas de Brumavale"),
    ], [
      prop("bed", 160, 285, 105, 155, { color: 0x6c7b70 }),
      prop("bed", 735, 285, 105, 155, { color: 0x6c7b70 }),
      prop("shelf", 700, 175, 185, 42), prop("wardrobe", 275, 175, 110, 60),
      prop("desk", 245, 490, 155, 75), prop("table", 680, 520, 145, 85),
      prop("bench", 680, 600, 130, 36), prop("stove", 650, 410, 85, 80),
      prop("crate", 155, 675, 58, 55), prop("barrel", 230, 675, 44, 44),
      prop("basin", 780, 690, 38, 38),
      dressing("rug", 450, 460, 170, 340, 0x708177),
      dressing("books", 245, 490, 80, 30), dressing("books", 690, 175, 75, 24),
      dressing("lantern", 125, 175, 18, 18), dressing("lantern", 680, 520, 16, 16),
    ]),
  room("chapel-room", "Capela de Nossa Senhora das Nuvens", "chapel",
    { zone: "highlands", objectId: "highland-chapel", x: 1774, y: 988 }, "highland-chapel", [
      station("highland-chapel", "house", 450, 285, "Altar de Nossa Senhora das Nuvens"),
    ], [
      prop("altar", 450, 185, 225, 70),
      prop("bench", 245, 360, 185, 50), prop("bench", 655, 360, 185, 50),
      prop("bench", 245, 470, 185, 50), prop("bench", 655, 470, 185, 50),
      prop("bench", 245, 580, 185, 50), prop("bench", 655, 580, 185, 50),
      prop("shelf", 170, 175, 125, 42), prop("basin", 745, 245, 48, 48),
      prop("plant", 155, 690, 38, 38), prop("plant", 745, 690, 38, 38),
      dressing("rug", 450, 485, 145, 435, 0x8f5f53),
      dressing("books", 450, 185, 70, 28), dressing("books", 170, 175, 55, 24),
      dressing("lantern", 365, 185, 18, 18), dressing("lantern", 535, 185, 18, 18),
      dressing("lantern", 130, 285, 18, 18), dressing("lantern", 785, 285, 18, 18),
    ]),
];

export function interiorForZone(zone: Zone): InteriorDefinition | undefined {
  return INTERIORS.find(definition => definition.zone === zone);
}
export function entranceForObject(zone: Zone, id: string): InteriorDefinition | undefined {
  return INTERIORS.find(definition => definition.entrance.zone === zone && definition.entrance.objectId === id);
}

/** Exact axis-aligned envelope of the same rotated footprint used by Three.js. */
export function furnitureRectangle(furniture: InteriorFurniture): Rectangle {
  const rotation = furniture.rotation ?? 0;
  const width = Math.abs(Math.cos(rotation)) * furniture.w + Math.abs(Math.sin(rotation)) * furniture.d;
  const depth = Math.abs(Math.sin(rotation)) * furniture.w + Math.abs(Math.cos(rotation)) * furniture.d;
  return { left: furniture.x - width / 2, right: furniture.x + width / 2,
    top: furniture.y - depth / 2, bottom: furniture.y + depth / 2 };
}
export function interiorRegion(definition: InteriorDefinition): RegionDefinition {
  const exit = { id: "exit", kind: "portal", x: definition.exit.x, y: definition.exit.y,
    label: `Sair de ${definition.name}`, to: definition.entrance.zone,
    spawn: { x: definition.entrance.x, y: definition.entrance.y } };
  return { id: definition.zone, name: definition.name, width: 900, height: 900,
    objects: [...definition.stations, exit], portals: [exit], decor: [],
    solids: definition.furniture.filter(furniture => furniture.blocking !== false).map(furnitureRectangle) };
}
export function interiorAllowed(state: GameState, definition: InteriorDefinition): boolean {
  if (definition.zone === "farmhouse-room") return state.property.owned && state.property.building;
  if (definition.zone === "farm-store-room") return state.property.owned;
  if (definition.zone === "oak-room" || definition.zone === "stone-room") {
    const holding = state.territory.parcels[definition.zone === "oak-room" ? "oak-hollow" : "stone-rise"];
    return holding.owned && holding.building !== "none";
  }
  return true;
}

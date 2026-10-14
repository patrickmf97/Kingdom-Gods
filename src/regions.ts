import { villageDecor, type VillageDecoration } from "./art";
import { OBJECTS, WORLD_H, WORLD_W } from "./data";
import type { Point, ResourceNodeDefinition, WorldObject, Zone } from "./types";

export interface Rectangle { left: number; top: number; right: number; bottom: number }
export interface Portal extends WorldObject { to: Zone; spawn: Point }
export interface RegionDefinition {
  id: Zone;
  name: string;
  width: number;
  height: number;
  objects: WorldObject[];
  portals: Portal[];
  decor: VillageDecoration[];
  solids: Rectangle[];
  /** Union of authored ground rectangles. Outside this union is solid rock. */
  walkableAreas?: Rectangle[];
}
const rect = (left: number, top: number, right: number, bottom: number): Rectangle =>
  ({ left, top, right, bottom });

export const RESOURCE_NODES: ResourceNodeDefinition[] = [
  { id: "tree1", zone: "village", kind: "resource", x: 590, y: 1080, label: "Ramos caídos do carvalho", resource: "wood", tool: null, duration: 2, stamina: 4, yield: 2, capacity: 4, respawnDays: 2, skill: "woodcutting" },
  { id: "herb1", zone: "village", kind: "herb", x: 1800, y: 440, label: "Ervas medicinais", resource: "herb", tool: null, duration: 2, stamina: 4, yield: 2, capacity: 5, respawnDays: 2, skill: "herbalism" },
  { id: "stone1", zone: "village", kind: "stone", x: 1780, y: 1320, label: "Pedras soltas do caminho", resource: "stone", tool: null, duration: 2, stamina: 4, yield: 2, capacity: 5, respawnDays: 2, skill: "mining" },
  { id: "wild-oak", zone: "wilderness", kind: "resource", x: 760, y: 1260, label: "Carvalho da clareira", resource: "wood", tool: "axe", duration: 3, stamina: 6, yield: 3, capacity: 4, respawnDays: 2, skill: "woodcutting" },
  { id: "wild-herbs", zone: "wilderness", kind: "herb", x: 1370, y: 700, label: "Ervas do vale", resource: "herb", tool: null, duration: 2, stamina: 4, yield: 2, capacity: 5, respawnDays: 2, skill: "herbalism" },
  { id: "wild-stone", zone: "wilderness", kind: "stone", x: 2030, y: 1090, label: "Afloramento de pedra", resource: "stone", tool: "pickaxe", duration: 3, stamina: 6, yield: 3, capacity: 5, respawnDays: 2, skill: "mining" },
  { id: "mine-iron-west", zone: "mine", kind: "ore", x: 270, y: 250, label: "Veio de ferro · galeria oeste", resource: "ore", tool: "pickaxe", duration: 4, stamina: 8, yield: 2, capacity: 4, respawnDays: 3, skill: "mining" },
  { id: "mine-iron-east", zone: "mine", kind: "ore", x: 1040, y: 490, label: "Veio de ferro · galeria leste", resource: "ore", tool: "pickaxe", duration: 4, stamina: 8, yield: 2, capacity: 4, respawnDays: 3, skill: "mining" },
  { id: "mine-iron-deep", zone: "mine", kind: "ore", x: 1020, y: 225, label: "Veio de ferro · galeria profunda", resource: "ore", tool: "pickaxe", duration: 4, stamina: 8, yield: 2, capacity: 4, respawnDays: 3, skill: "mining" },
  { id: "mine-stone", zone: "mine", kind: "stone", x: 960, y: 930, label: "Pedra da galeria inferior", resource: "stone", tool: "pickaxe", duration: 3, stamina: 6, yield: 3, capacity: 5, respawnDays: 2, skill: "mining" },
];

const villagePortals: Portal[] = [
  { id: "wild-gate", kind: "portal", x: 2170, y: 1660, label: "Trilha para os Ermos de Alvor", to: "wilderness", spawn: { x: 400, y: 1780 } },
];
const wildernessPortals: Portal[] = [
  { id: "wild-village", kind: "portal", x: 400, y: 1820, label: "Caminho para Valeverde", to: "village", spawn: { x: 2170, y: 1580 } },
  { id: "wild-mine", kind: "cave", x: 2250, y: 450, label: "Mina do Ferro Antigo", w: 220, h: 180, to: "mine", spawn: { x: 400, y: 970 } },
];
const minePortals: Portal[] = [
  { id: "mine-exit", kind: "portal", x: 400, y: 1010, label: "Saída para os Ermos", to: "wilderness", spawn: { x: 2250, y: 600 } },
];
const orphanagePortals: Portal[] = [
  { id: "exit", kind: "portal", x: 450, y: 790, label: "Sair para Valeverde", to: "village", spawn: { x: 710, y: 760 } },
];
const dungeonPortals: Portal[] = [
  { id: "exit", kind: "portal", x: 450, y: 790, label: "Sair da cripta", to: "village", spawn: { x: 2110, y: 470 } },
];

/** Painted roads are also reserved when placing trees, so all approaches stay clear. */
export const WILDERNESS_ROADS: Point[][] = [
  [{ x: 400, y: 1820 }, { x: 700, y: 1580 }, { x: 1100, y: 1450 }, { x: 1480, y: 1220 }, { x: 1700, y: 1000 }, { x: 1980, y: 750 }, { x: 2250, y: 450 }],
  [{ x: 1100, y: 1450 }, { x: 900, y: 1300 }, { x: 760, y: 1260 }],
  [{ x: 1700, y: 1000 }, { x: 1530, y: 820 }, { x: 1370, y: 700 }],
  [{ x: 1700, y: 1000 }, { x: 2030, y: 1090 }, { x: 2190, y: 1300 }, { x: 2210, y: 1740 }, { x: 2460, y: 1690 }],
];
function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fraction = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy);
}
const wildernessLandmarks: WorldObject[] = [
  { id: "wild-camp", kind: "camp", x: 1100, y: 1450, label: "Acampamento dos viajantes", w: 240, h: 190 },
  { id: "wild-ruins", kind: "ruins", x: 1700, y: 1000, label: "Ruínas da Torre de Alvor", w: 240, h: 200 },
  { id: "wild-lake", kind: "lake", x: 2460, y: 1650, label: "Lago do Espelho", w: 360, h: 220 },
];
const wildernessObjects: WorldObject[] = [
  ...wildernessPortals, ...wildernessLandmarks,
  ...RESOURCE_NODES.filter((node) => node.zone === "wilderness"),
];
const wildernessDecor: VillageDecoration[] = [];
let forestSeed = 829173;
function forestRandom(): number {
  forestSeed = (Math.imul(1664525, forestSeed) + 1013904223) >>> 0;
  return forestSeed / 4294967296;
}
for (let row = 0; row < 17; row++) {
  for (let column = 0; column < 25; column++) {
    const x = 120 + column * 115 + (forestRandom() - 0.5) * 72;
    const y = 190 + row * 117 + (forestRandom() - 0.5) * 66;
    const clearRoad = WILDERNESS_ROADS.some((road) => road.some((a, index) => index > 0 && segmentDistance({ x, y }, road[index - 1], a) < 90));
    const clearLandmark = wildernessObjects.some((object) => Math.abs(x - object.x) < (object.w ?? 100) / 2 + 110 && Math.abs(y - object.y + (object.h ?? 100) / 2) < (object.h ?? 100) / 2 + 100);
    if (clearRoad || clearLandmark || (x > 2150 && x < 2740 && y > 1320 && y < 1760)) continue;
    wildernessDecor.push({ x: Math.round(x), y: Math.round(y), key: (row + column) % 4 === 0 ? "pine" : (row + column) % 3 === 0 ? "tree2" : "tree1", scale: 0.85 + forestRandom() * 0.35 });
  }
}

const villageWalls: Rectangle[] = [
  rect(616, 524, 810, 610), rect(912, 984, 1094, 1070), rect(1566, 1024, 1720, 1090),
  rect(1486, 578, 1636, 648), rect(1217, 308, 1301, 412), rect(1185, 392, 1215, 416),
  rect(1158.5, 1324, 1278.5, 1398), rect(1274.5, 1338, 1312.5, 1398),
  rect(1211, 774, 1341, 810), rect(1207, 750, 1213, 810), rect(1341, 750, 1347, 810),
  rect(1195, 794, 1211, 812), rect(1349, 786, 1363, 808), rect(2055, 240, 2167, 316),
  rect(1370, 1062, 1376, 1082), rect(1404, 1062, 1410, 1082),
  rect(782, 1108, 968, 1114), rect(782, 1198, 968, 1204),
  rect(1928, 706, 1996, 748), rect(1784, 728, 1914, 736), rect(1790, 734, 1794, 870),
  rect(2010, 738, 2014, 870), rect(1784, 862, 1862, 868), rect(1926, 862, 2014, 868),
];
const nodeFootprint = (node: ResourceNodeDefinition): Rectangle =>
  node.kind === "resource" ? rect(node.x - 8, node.y - 20, node.x + 8, node.y - 4) : rect(node.x - 16, node.y - 22, node.x + 16, node.y - 6);

export const REGIONS: Record<Zone, RegionDefinition> = {
  village: { id: "village", name: "Valeverde", width: WORLD_W, height: WORLD_H,
    objects: [...OBJECTS, ...villagePortals], portals: villagePortals, decor: villageDecor, solids: villageWalls },
  orphanage: { id: "orphanage", name: "Orfanato de Santa Elara", width: 900, height: 900,
    objects: orphanagePortals, portals: orphanagePortals, decor: [], solids: [] },
  dungeon: { id: "dungeon", name: "Cripta das Raízes", width: 900, height: 900,
    objects: dungeonPortals, portals: dungeonPortals, decor: [], solids: [] },
  wilderness: { id: "wilderness", name: "Ermos de Alvor", width: 3072, height: 2304,
    objects: wildernessObjects, portals: wildernessPortals, decor: wildernessDecor,
    solids: [rect(2168, 330, 2332, 424), rect(1035, 1372, 1115, 1418),
      rect(1610, 864, 1630, 958), rect(1770, 864, 1790, 958), rect(1610, 864, 1790, 886),
      rect(2280, 1430, 2640, 1630),
      ...RESOURCE_NODES.filter((node) => node.zone === "wilderness" && node.kind !== "herb").map(nodeFootprint),
      ...wildernessDecor.map((item) => { const scale = item.scale ?? 1; return rect(item.x - 6 * scale, item.y - 19 * scale, item.x + 8 * scale, item.y - 5 * scale); }),
    ] },
  mine: { id: "mine", name: "Mina do Ferro Antigo", width: 1280, height: 1120,
    objects: [...minePortals, ...RESOURCE_NODES.filter((node) => node.zone === "mine")],
    portals: minePortals, decor: [], solids: RESOURCE_NODES.filter((node) => node.zone === "mine").map(nodeFootprint),
    walkableAreas: [rect(160, 820, 640, 1040), rect(320, 480, 520, 960), rect(300, 380, 980, 680),
      rect(840, 260, 1120, 600), rect(760, 120, 1160, 380), rect(450, 180, 620, 540),
      rect(160, 120, 680, 340), rect(760, 760, 1120, 1020), rect(880, 580, 1040, 850)],
  },
};
export function regionForZone(zone: Zone): RegionDefinition { return REGIONS[zone]; }
export function objectsForZone(zone: Zone): WorldObject[] { return REGIONS[zone].objects; }
export function portalForZone(zone: Zone, id: string): Portal | undefined {
  return REGIONS[zone].portals.find((portal) => portal.id === id);
}
export function resourceNode(id: string): ResourceNodeDefinition | undefined {
  return RESOURCE_NODES.find((node) => node.id === id);
}

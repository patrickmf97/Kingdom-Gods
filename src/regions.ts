import { villageDecor, type VillageDecoration } from "./village-decor";
import { INTERIORS, interiorRegion } from "./interiors";
import { HIGHLANDS_REGION, HIGHLAND_RESOURCE_NODES, WILDERNESS_HIGHLANDS_PORTAL } from "./highlands";
import { OBJECTS, WORLD_H, WORLD_W } from "./data";
import { ESTATE_DEFS, estateObject } from "./territory-data";
import type { InteriorZone, Point, ResourceNodeDefinition, WorldObject, Zone } from "./types";

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

const legacyResourceNodes: ResourceNodeDefinition[] = [
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

/** Historical save schemas describe exactly these ten deposits and their caps. */
export const LEGACY_RESOURCE_NODES: readonly ResourceNodeDefinition[] = Object.freeze(
  legacyResourceNodes.map(node => Object.freeze(node)),
);

function outdoorNode(id: string, zone: "village" | "wilderness", resource: "wood" | "stone" | "herb", x: number, y: number, label: string): ResourceNodeDefinition {
  return { id, zone, x, y, label, resource,
    kind: resource === "wood" ? "resource" : resource === "stone" ? "stone" : "herb",
    tool: resource === "wood" ? "axe" : resource === "stone" ? "pickaxe" : null,
    duration: resource === "herb" ? 2 : 3, stamina: resource === "herb" ? 4 : 6,
    yield: resource === "herb" ? 2 : 3, capacity: resource === "wood" ? 4 : 5, respawnDays: 2,
    skill: resource === "wood" ? "woodcutting" : resource === "stone" ? "mining" : "herbalism",
  };
}

// Stable authored places spread gathering around the village and the open world.
// New trees and outcrops use the same finite work balance as their wild peers.
const additionalResourceNodes: ResourceNodeDefinition[] = [
  outdoorNode("village-oak-south-meadow", "village", "wood", 660, 1700, "Carvalho do prado sul"),
  outdoorNode("village-pine-north-grove", "village", "wood", 930, 350, "Pinheiro do bosque norte"),
  outdoorNode("village-oak-east-orchard", "village", "wood", 2180, 1100, "Carvalho do pomar leste"),
  outdoorNode("village-willow-south-field", "village", "wood", 1520, 1760, "Salgueiro do campo sul"),
  outdoorNode("village-stone-west-meadow", "village", "stone", 740, 1290, "Pedreira do prado oeste"),
  outdoorNode("village-stone-north-ridge", "village", "stone", 1630, 290, "Afloramento da encosta norte"),
  outdoorNode("village-stone-east-ridge", "village", "stone", 2300, 700, "Pedras da colina leste"),
  outdoorNode("village-stone-south-pasture", "village", "stone", 2060, 1510, "Afloramento do pasto sul"),
  outdoorNode("village-herbs-orphanage", "village", "herb", 570, 460, "Ervas do jardim de Santa Elara"),
  outdoorNode("village-herbs-west-bank", "village", "herb", 520, 1210, "Ervas da margem oeste"),
  outdoorNode("village-herbs-east-orchard", "village", "herb", 2210, 1360, "Ervas do pomar leste"),
  outdoorNode("village-herbs-south-meadow", "village", "herb", 1710, 1640, "Ervas do prado sul"),

  outdoorNode("wild-oak-west-hollow", "wilderness", "wood", 360, 1220, "Carvalho da baixada oeste"),
  outdoorNode("wild-pine-west-slope", "wilderness", "wood", 470, 650, "Pinheiro da encosta oeste"),
  outdoorNode("wild-oak-north-grove", "wilderness", "wood", 1030, 400, "Carvalho do bosque norte"),
  outdoorNode("wild-pine-north-ridge", "wilderness", "wood", 1740, 350, "Pinheiro da serra norte"),
  outdoorNode("wild-oak-east-ridge", "wilderness", "wood", 2730, 660, "Carvalho da serra leste"),
  outdoorNode("wild-pine-east-grove", "wilderness", "wood", 2830, 1120, "Pinheiro do bosque leste"),
  outdoorNode("wild-oak-lakeside", "wilderness", "wood", 2780, 1760, "Carvalho além do lago"),
  outdoorNode("wild-oak-south-grove", "wilderness", "wood", 2510, 2070, "Carvalho do bosque sul"),
  outdoorNode("wild-pine-south-ridge", "wilderness", "wood", 1690, 2060, "Pinheiro da serra sul"),
  outdoorNode("wild-oak-southwest", "wilderness", "wood", 600, 2060, "Carvalho da fronteira sudoeste"),
  outdoorNode("wild-pine-central-grove", "wilderness", "wood", 1470, 1630, "Pinheiro entre as clareiras"),
  outdoorNode("wild-stone-west-bluff", "wilderness", "stone", 230, 940, "Pedra do penhasco oeste"),
  outdoorNode("wild-stone-west-ridge", "wilderness", "stone", 760, 500, "Afloramento da serra oeste"),
  outdoorNode("wild-stone-north-ridge", "wilderness", "stone", 1310, 280, "Pedra da crista norte"),
  outdoorNode("wild-stone-mine-ridge", "wilderness", "stone", 2160, 200, "Afloramento acima da mina"),
  outdoorNode("wild-stone-east-bluff", "wilderness", "stone", 2860, 390, "Pedra do penhasco leste"),
  outdoorNode("wild-stone-east-slope", "wilderness", "stone", 2590, 1020, "Afloramento da encosta leste"),
  outdoorNode("wild-stone-lakeshore", "wilderness", "stone", 2740, 1460, "Pedra da margem do espelho"),
  outdoorNode("wild-stone-south-ridge", "wilderness", "stone", 2190, 2070, "Afloramento da serra sul"),
  outdoorNode("wild-stone-southwest", "wilderness", "stone", 990, 2090, "Pedra da fronteira sudoeste"),
  outdoorNode("wild-stone-west-meadow", "wilderness", "stone", 380, 1500, "Afloramento do prado oeste"),
  outdoorNode("wild-stone-central-rise", "wilderness", "stone", 1370, 1060, "Pedra do alto central"),
  outdoorNode("wild-herbs-west-hollow", "wilderness", "herb", 260, 420, "Ervas da baixada oeste"),
  outdoorNode("wild-herbs-west-grove", "wilderness", "herb", 840, 850, "Ervas do bosque oeste"),
  outdoorNode("wild-herbs-north-grove", "wilderness", "herb", 1450, 480, "Ervas do bosque norte"),
  outdoorNode("wild-herbs-cave-heath", "wilderness", "herb", 2390, 230, "Ervas do urzal da mina"),
  outdoorNode("wild-herbs-east-heath", "wilderness", "herb", 2850, 850, "Ervas do urzal leste"),
  outdoorNode("wild-herbs-lake-meadow", "wilderness", "herb", 2860, 1950, "Ervas do prado do lago"),
  outdoorNode("wild-herbs-south-valley", "wilderness", "herb", 1900, 2210, "Ervas do vale sul"),
  outdoorNode("wild-herbs-southwest", "wilderness", "herb", 1350, 2040, "Ervas da campina sudoeste"),
  outdoorNode("wild-herbs-return-path", "wilderness", "herb", 590, 1840, "Ervas do regresso a Valeverde"),
  outdoorNode("wild-herbs-central-meadow", "wilderness", "herb", 1510, 1830, "Ervas da campina central"),
  outdoorNode("wild-herbs-eastern-ruins", "wilderness", "herb", 2350, 1210, "Ervas a leste das ruínas"),
];
export const V5_RESOURCE_NODES: readonly ResourceNodeDefinition[] = Object.freeze([...LEGACY_RESOURCE_NODES, ...additionalResourceNodes].map(node => Object.freeze(node)));
export const RESOURCE_NODES: ResourceNodeDefinition[] = [...V5_RESOURCE_NODES, ...HIGHLAND_RESOURCE_NODES];

/** Clear a visible work space, including canopy overhangs from trees south of it. */
function hidesResource(item: VillageDecoration, node: ResourceNodeDefinition): boolean {
  return Math.abs(item.x - node.x) < 100 && item.y > node.y - 60 && item.y < node.y + 150;
}
const gatheringVillageDecor = villageDecor.filter(item => !additionalResourceNodes.some(node =>
  node.zone === "village" && hidesResource(item, node)));

const villagePortals: Portal[] = [
  { id: "wild-gate", kind: "portal", x: 2170, y: 1660, label: "Trilha para os Ermos de Alvor", to: "wilderness", spawn: { x: 400, y: 1780 } },
];
const wildernessPortals: Portal[] = [
  WILDERNESS_HIGHLANDS_PORTAL,
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
// The original exclusion list also controls whether a scale PRNG draw occurs.
// Expanding it before generation would move every later decorative tree.
const originalWildernessObjects: WorldObject[] = [
  ...wildernessPortals.filter(portal => portal.id !== "wild-highlands"), ...wildernessLandmarks,
  ...LEGACY_RESOURCE_NODES.filter(node => node.zone === "wilderness"),
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
    const clearLandmark = originalWildernessObjects.some((object) => Math.abs(x - object.x) < (object.w ?? 100) / 2 + 110 && Math.abs(y - object.y + (object.h ?? 100) / 2) < (object.h ?? 100) / 2 + 100);
    if (clearRoad || clearLandmark || (x > 2150 && x < 2740 && y > 1320 && y < 1760)) continue;
    wildernessDecor.push({ x: Math.round(x), y: Math.round(y), key: (row + column) % 4 === 0 ? "pine" : (row + column) % 3 === 0 ? "tree2" : "tree1", scale: 0.85 + forestRandom() * 0.35 });
  }
}
// Generate the original forest first. Its scale draws share the coordinate
// generator, so inserting parcel exclusions inside the loop would move every
// later tree in existing campaigns. Clear the two plots, their approaches and
// the new gathering places only afterward, including canopy overhangs.
for (let index = wildernessDecor.length - 1; index >= 0; index--) {
  const item = wildernessDecor[index];
  const reserved = ESTATE_DEFS.some((estate) =>
    item.x >= estate.x - estate.width / 2 - 75 &&
    item.x <= estate.x + estate.width / 2 + 75 &&
    item.y >= estate.y - estate.height - 40 &&
    item.y <= estate.y + 180);
  const workClearing = additionalResourceNodes.some(node => node.zone === "wilderness" && hidesResource(item, node));
  if (reserved || workClearing) wildernessDecor.splice(index, 1);
}
wildernessObjects.push(...ESTATE_DEFS.map((estate) => estateObject(estate.id)));

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

const interiorRegions = Object.fromEntries(INTERIORS.map(definition => [definition.zone, interiorRegion(definition)])) as Record<InteriorZone, RegionDefinition>;

export const REGIONS: Record<Zone, RegionDefinition> = {
  village: { id: "village", name: "Valeverde", width: WORLD_W, height: WORLD_H,
    objects: [...OBJECTS, ...villagePortals, ...additionalResourceNodes.filter(node => node.zone === "village"),
      { id: "farm-store", kind: "door", x: 1970, y: 786, label: "Porta do celeiro" },
      { id: "farmhouse", kind: "door", x: 2090, y: 815, label: "Porta da casa da linhagem" }],
    portals: villagePortals, decor: gatheringVillageDecor,
    // Environment surfaces address the first 24 authored wall bases by index.
    solids: [...villageWalls, ...additionalResourceNodes.filter(node => node.zone === "village" && node.kind !== "herb").map(nodeFootprint)] },
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
  highlands: HIGHLANDS_REGION,
  ...interiorRegions,
};
export function regionForZone(zone: Zone): RegionDefinition { return REGIONS[zone]; }
export function objectsForZone(zone: Zone): WorldObject[] { return REGIONS[zone].objects; }
export function portalForZone(zone: Zone, id: string): Portal | undefined {
  return REGIONS[zone].portals.find((portal) => portal.id === id);
}
export function resourceNode(id: string): ResourceNodeDefinition | undefined {
  return RESOURCE_NODES.find((node) => node.id === id);
}

import type { VillageDecoration } from "./art";
import type { Portal, Rectangle, RegionDefinition } from "./regions";
import type { Point, ResourceNodeDefinition, WorldObject } from "./types";

const rect = (left: number, top: number, right: number, bottom: number): Rectangle => ({ left, top, right, bottom });

export const WILDERNESS_HIGHLANDS_PORTAL: Portal = {
  id: "wild-highlands", kind: "portal", x: 2960, y: 580,
  label: "Desfiladeiro para as Terras Altas de Brumavale", to: "highlands", spawn: { x: 360, y: 1640 },
};

export const HIGHLAND_EXIT: Portal = {
  id: "highlands-wilderness", kind: "portal", x: 360, y: 1710,
  label: "Descer aos Ermos de Alvor", to: "wilderness", spawn: { x: 2790, y: 500 },
};

/** Painted trails also reserve clear ground for the forest and meadow layers. */
export const HIGHLAND_ROADS: Point[][] = [
  [[360, 1710], [360, 1640], [530, 1440], [650, 1190], [780, 930], [900, 740], [900, 680]],
  [[780, 930], [1100, 1080], [1390, 1160], [1620, 1110], [1750, 1060], [1750, 1000]],
  [[900, 740], [1180, 690], [1430, 560], [1800, 490], [2150, 650]],
  [[1390, 1160], [1520, 1430], [1900, 1530], [2220, 1390]],
].map(path => path.map(([x, y]) => ({ x, y })));

function reserve(id: string, resource: "wood" | "stone" | "herb" | "ore", x: number, y: number, label: string): ResourceNodeDefinition {
  return { id, zone: "highlands", resource, x, y, label,
    kind: resource === "wood" ? "resource" : resource,
    tool: resource === "wood" ? "axe" : resource === "herb" ? null : "pickaxe",
    duration: resource === "herb" ? 2 : resource === "ore" ? 4 : 3,
    stamina: resource === "herb" ? 4 : resource === "ore" ? 8 : 6,
    yield: resource === "herb" || resource === "ore" ? 2 : 3,
    capacity: resource === "wood" || resource === "ore" ? 4 : 5,
    respawnDays: resource === "ore" ? 3 : 2,
    skill: resource === "wood" ? "woodcutting" : resource === "herb" ? "herbalism" : "mining",
  };
}

/** Stable IDs are persisted independently; the historical 55 reserves stay untouched. */
export const HIGHLAND_RESOURCE_NODES: readonly ResourceNodeDefinition[] = Object.freeze([
  reserve("highland-pine-west-grove", "wood", 370, 1100, "Pinheiro do bosque da neblina"),
  reserve("highland-pine-ranger-grove", "wood", 1180, 850, "Pinheiro da guarda da serra"),
  reserve("highland-pine-east-grove", "wood", 2110, 1080, "Pinheiro do bosque dos sinos"),
  reserve("highland-stone-west-bluff", "stone", 420, 700, "Pedra da escarpa oeste"),
  reserve("highland-stone-north-pass", "stone", 1570, 360, "Afloramento do passo norte"),
  reserve("highland-stone-south-ridge", "stone", 1940, 1720, "Pedra da encosta do vento"),
  reserve("highland-herbs-south-meadow", "herb", 870, 1560, "Ervas do prado de Brumavale"),
  reserve("highland-herbs-chapel-meadow", "herb", 1470, 940, "Ervas do jardim dos peregrinos"),
  reserve("highland-herbs-east-heath", "herb", 2280, 880, "Ervas do urzal das nuvens"),
  reserve("highland-iron-west-ridge", "ore", 680, 360, "Veio de ferro da crista oeste"),
  reserve("highland-iron-north-ridge", "ore", 1950, 260, "Veio de ferro da coroa da serra"),
  reserve("highland-iron-east-ridge", "ore", 2290, 1590, "Veio de ferro do contraforte leste"),
].map(node => Object.freeze(node)));

/** Visible ground-level building bodies use these exact navigation footprints. */
export const HIGHLAND_BUILDINGS = [
  { id: "highland-ranger-lodge", kind: "ranger-lodge", x: 900, y: 680,
    label: "Alojamento dos guardas de Brumavale", w: 220, h: 160, footprint: rect(790, 520, 1010, 630) },
  { id: "highland-chapel", kind: "chapel", x: 1750, y: 1000,
    label: "Capela de Nossa Senhora das Nuvens", w: 200, h: 210, footprint: rect(1650, 790, 1850, 950) },
] satisfies (WorldObject & { footprint: Rectangle })[];

export const HIGHLAND_RIDGES: Rectangle[] = [
  rect(100, 150, 410, 300), rect(840, 110, 1290, 300), rect(2180, 110, 2450, 320),
  rect(102, 730, 210, 1130), rect(1290, 1330, 1370, 1580), rect(2370, 1100, 2450, 1420),
];

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
}

const decor: VillageDecoration[] = [];
let seed = 719331;
function random(): number { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
for (let row = 0; row < 18; row++) for (let column = 0; column < 24; column++) {
  const x = 130 + column * 99 + (random() - .5) * 54;
  const y = 140 + row * 94 + (random() - .5) * 52;
  const point = { x, y };
  const clearRoad = HIGHLAND_ROADS.some(path => path.some((b, index) => index > 0 && distanceToSegment(point, path[index - 1], b) < 100));
  const clearBuilding = HIGHLAND_BUILDINGS.some(building => x > building.footprint.left - 105 && x < building.footprint.right + 105 &&
    y > building.footprint.top - 70 && y < building.y + 170);
  const clearReserve = HIGHLAND_RESOURCE_NODES.some(node => Math.abs(x - node.x) < 110 && y > node.y - 80 && y < node.y + 165);
  const solidRidge = HIGHLAND_RIDGES.some(area => x > area.left - 35 && x < area.right + 35 && y > area.top - 35 && y < area.bottom + 35);
  const clearEntry = Math.hypot(x - 360, y - 1680) < 170;
  // A broad open eastern and southern meadow keeps the mountain silhouettes legible.
  const meadow = ((x - 1730) / 560) ** 2 + ((y - 1410) / 260) ** 2 < 1;
  if (clearRoad || clearBuilding || clearReserve || solidRidge || clearEntry || meadow) continue;
  decor.push({ x: Math.round(x), y: Math.round(y), key: "pine", scale: .76 + random() * .42 });
}

export const HIGHLANDS_REGION: RegionDefinition = {
  id: "highlands", name: "Terras Altas de Brumavale", width: 2560, height: 1920,
  objects: [HIGHLAND_EXIT, ...HIGHLAND_BUILDINGS, ...HIGHLAND_RESOURCE_NODES],
  portals: [HIGHLAND_EXIT], decor,
  solids: [
    ...HIGHLAND_BUILDINGS.map(building => building.footprint), ...HIGHLAND_RIDGES,
    ...HIGHLAND_RESOURCE_NODES.filter(node => node.kind !== "herb").map(node => node.kind === "resource"
      ? rect(node.x - 8, node.y - 20, node.x + 8, node.y - 4)
      : rect(node.x - 16, node.y - 22, node.x + 16, node.y - 6)),
    ...decor.map(item => { const scale = item.scale ?? 1; return rect(item.x - 6 * scale, item.y - 19 * scale, item.x + 8 * scale, item.y - 5 * scale); }),
  ],
};

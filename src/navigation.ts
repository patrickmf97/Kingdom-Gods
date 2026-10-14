import { villageDecor } from "./art";
import { OBJECTS, WORLD_H, WORLD_W } from "./data";
import type { Zone } from "./types";

export type Point = { x: number; y: number };
export type NavigationContext = { zone: Zone; building: boolean };

const FEET_RADIUS = 9;
const STEP = 4;
const GRID = 24;
const BUCKET = 128;
const RIVER = [
  [-120, 436], [102, 524], [244, 702], [388, 908], [320, 1130],
  [274, 1304], [406, 1554], [300, 1774], [136, 1980],
];
type Rectangle = { kind: "rectangle"; left: number; top: number; right: number; bottom: number };
type Circle = { kind: "circle"; x: number; y: number; radius: number };
type Solid = Rectangle | Circle;
const rectangle = (left: number, top: number, right: number, bottom: number): Rectangle =>
  ({ kind: "rectangle", left, top, right, bottom });
const circle = (x: number, y: number, radius: number): Circle => ({ kind: "circle", x, y, radius });

// These are painted wall/counter bases, not roof or canopy bounding boxes.
// The same footprints apply to the apostle, NPC routines and planned routes.
const solids: Solid[] = [
  rectangle(616, 524, 810, 610), // orphanage facade and side wall
  rectangle(912, 984, 1094, 1070), // inn
  rectangle(1566, 1024, 1720, 1090), // Mira's home
  rectangle(1486, 578, 1636, 648), // forge
  rectangle(1217, 308, 1301, 412), // mill tower; sails remain passable
  rectangle(1185, 392, 1215, 416), // mill sacks
  circle(1315, 402, 18), // mill grinding stone
  rectangle(1158.5, 1324, 1278.5, 1398), // bakery facade
  rectangle(1274.5, 1338, 1312.5, 1398), // stone oven
  rectangle(1211, 774, 1341, 810), // market counter
  rectangle(1207, 750, 1213, 810), // market posts
  rectangle(1341, 750, 1347, 810),
  rectangle(1195, 794, 1211, 812), // market baskets
  rectangle(1349, 786, 1363, 808),
  circle(1130, 778, 31), // well stone rim
  circle(591, 1068, 8), // harvestable oak trunk
  circle(1780, 1311, 20), // harvestable stone
  rectangle(2055, 240, 2167, 316), // crypt exterior; front steps lead to the instance
  rectangle(1370, 1062, 1376, 1082), // noticeboard's painted left leg
  rectangle(1404, 1062, 1410, 1082), // noticeboard's painted right leg
  // The inn's kitchen garden is open at both sides, with two horizontal rails.
  rectangle(782, 1108, 968, 1114),
  rectangle(782, 1198, 968, 1204),
  // Farm soil and crops are freely walkable; only its shed and fences are solid.
  rectangle(1928, 706, 1996, 748),
  rectangle(1784, 728, 1914, 736),
  rectangle(1790, 734, 1794, 870),
  rectangle(2010, 738, 2014, 870),
  rectangle(1784, 862, 1862, 868),
  rectangle(1926, 862, 2014, 868),
  ...villageDecor.map((item) => {
    const scale = item.scale ?? 1;
    return circle(item.x + scale, item.y - 12 * scale, 7 * scale);
  }),
];
const builtHouse = rectangle(2026, 718, 2160, 778);

const buckets = new Map<string, Solid[]>();
for (const solid of solids) {
  const left = solid.kind === "circle" ? solid.x - solid.radius : solid.left;
  const right = solid.kind === "circle" ? solid.x + solid.radius : solid.right;
  const top = solid.kind === "circle" ? solid.y - solid.radius : solid.top;
  const bottom = solid.kind === "circle" ? solid.y + solid.radius : solid.bottom;
  for (let x = Math.floor((left - FEET_RADIUS) / BUCKET); x <= Math.floor((right + FEET_RADIUS) / BUCKET); x++) {
    for (let y = Math.floor((top - FEET_RADIUS) / BUCKET); y <= Math.floor((bottom + FEET_RADIUS) / BUCKET); y++) {
      const key = `${x},${y}`;
      const entries = buckets.get(key) ?? [];
      entries.push(solid);
      buckets.set(key, entries);
    }
  }
}

function bounds(context: NavigationContext) {
  return context.zone === "village"
    ? { left: 70, right: WORLD_W - 70, top: 90, bottom: WORLD_H - 70 }
    : { left: 72, right: 828, top: 135, bottom: 800 };
}
const finite = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function touchesSolid(point: Point, solid: Solid): boolean {
  if (solid.kind === "circle")
    return (point.x - solid.x) ** 2 + (point.y - solid.y) ** 2 < (solid.radius + FEET_RADIUS) ** 2;
  const nearestX = Math.max(solid.left, Math.min(solid.right, point.x));
  const nearestY = Math.max(solid.top, Math.min(solid.bottom, point.y));
  return (point.x - nearestX) ** 2 + (point.y - nearestY) ** 2 < FEET_RADIUS ** 2;
}

function riverDistanceSquared(point: Point): number {
  let result = Infinity;
  for (let index = 0; index < RIVER.length - 1; index++) {
    const [ax, ay] = RIVER[index];
    const [bx, by] = RIVER[index + 1];
    const dx = bx - ax, dy = by - ay;
    const along = Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / (dx * dx + dy * dy)));
    result = Math.min(result, (point.x - ax - along * dx) ** 2 + (point.y - ay - along * dy) ** 2);
  }
  return result;
}

export function isWalkable(point: Point, context: NavigationContext): boolean {
  if (!finite(point)) return false;
  const area = bounds(context);
  if (point.x < area.left || point.x > area.right || point.y < area.top || point.y > area.bottom) return false;
  if (context.zone !== "village") return true;
  // The bridge joins dry banks horizontally. Keep the whole feet circle inside
  // its vertical rails, allowing entry at the ends only where the banks meet it.
  const bridge = point.x >= 285 && point.x <= 485 && point.y >= 856 + FEET_RADIUS && point.y <= 930 - FEET_RADIUS;
  if (!bridge && riverDistanceSquared(point) < (47 + FEET_RADIUS) ** 2) return false;
  const nearby = buckets.get(`${Math.floor(point.x / BUCKET)},${Math.floor(point.y / BUCKET)}`) ?? [];
  if (nearby.some((solid) => touchesSolid(point, solid))) return false;
  return !context.building || !touchesSolid(point, builtHouse);
}

export function nearestWalkable(point: Point, context: NavigationContext): Point {
  const area = bounds(context);
  const fallback = context.zone === "village" ? { x: 710, y: 760 } : { x: 450, y: 750 };
  const desired = finite(point) ? point : fallback;
  const start = {
    x: Math.max(area.left, Math.min(area.right, desired.x)),
    y: Math.max(area.top, Math.min(area.bottom, desired.y)),
  };
  if (isWalkable(start, context)) return start;
  // Search locally first so loading an old save preserves its surroundings.
  for (let radius = 4; radius <= 192; radius += 4) {
    const count = Math.ceil((2 * Math.PI * radius) / 4);
    for (let index = 0; index < count; index++) {
      const angle = (index * 2 * Math.PI) / count;
      const candidate = { x: start.x + Math.cos(angle) * radius, y: start.y + Math.sin(angle) * radius };
      if (isWalkable(candidate, context)) return candidate;
    }
  }
  // A bounded map scan covers extreme/corrupt coordinates without an open loop.
  let result = fallback, best = Infinity;
  for (let y = Math.ceil(area.top / GRID) * GRID; y <= area.bottom; y += GRID) {
    for (let x = Math.ceil(area.left / GRID) * GRID; x <= area.right; x += GRID) {
      const candidate = { x, y };
      const d = distance(candidate, start);
      if (d < best && isWalkable(candidate, context)) { result = candidate; best = d; }
    }
  }
  return result;
}

export function moveWithCollisions(from: Point, delta: Point, context: NavigationContext): Point {
  if (!finite(delta)) return { ...from };
  let position = isWalkable(from, context) ? { ...from } : nearestWalkable(from, context);
  // A movement request can never require more sweeps than the map's diameter.
  const dx = Math.max(-WORLD_W, Math.min(WORLD_W, delta.x));
  const dy = Math.max(-WORLD_H, Math.min(WORLD_H, delta.y));
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / STEP));
  const sx = dx / steps, sy = dy / steps;
  for (let step = 0; step < steps; step++) {
    const next = { x: position.x + sx, y: position.y + sy };
    if (isWalkable(next, context)) { position = next; continue; }
    const horizontal = { x: position.x + sx, y: position.y };
    if (isWalkable(horizontal, context)) position = horizontal;
    const vertical = { x: position.x, y: position.y + sy };
    if (isWalkable(vertical, context)) position = vertical;
  }
  return position;
}

function clearSegment(from: Point, to: Point, context: NavigationContext): boolean {
  const count = Math.max(1, Math.ceil(distance(from, to) / STEP));
  for (let index = 0; index <= count; index++) {
    const fraction = index / count;
    if (!isWalkable({ x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction }, context)) return false;
  }
  return true;
}

type GridData = { columns: number; rows: number; walkable: Uint8Array; edges: Uint16Array };
const grids = new Map<string, GridData>();
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function gridFor(context: NavigationContext): GridData {
  const key = `${context.zone}:${context.building ? 1 : 0}`;
  let grid = grids.get(key);
  if (grid) return grid;
  const columns = Math.floor((context.zone === "village" ? WORLD_W : 900) / GRID) + 1;
  const rows = Math.floor((context.zone === "village" ? WORLD_H : 900) / GRID) + 1;
  const walkable = new Uint8Array(columns * rows);
  for (let index = 0; index < walkable.length; index++) {
    walkable[index] = isWalkable({ x: (index % columns) * GRID, y: Math.floor(index / columns) * GRID }, context) ? 1 : 0;
  }
  grid = { columns, rows, walkable, edges: new Uint16Array(walkable.length).fill(256) };
  grids.set(key, grid);
  return grid;
}
function gridPoint(index: number, grid: GridData): Point {
  return { x: (index % grid.columns) * GRID, y: Math.floor(index / grid.columns) * GRID };
}
function connectNode(point: Point, grid: GridData, context: NavigationContext): number {
  const cx = Math.round(point.x / GRID), cy = Math.round(point.y / GRID);
  let best = Infinity, result = -1;
  for (let y = Math.max(0, cy - 4); y <= Math.min(grid.rows - 1, cy + 4); y++) {
    for (let x = Math.max(0, cx - 4); x <= Math.min(grid.columns - 1, cx + 4); x++) {
      const index = y * grid.columns + x;
      if (!grid.walkable[index]) continue;
      const candidate = gridPoint(index, grid), d = distance(point, candidate);
      if (d < best && clearSegment(point, candidate, context)) { result = index; best = d; }
    }
  }
  return result;
}
function edgesFor(index: number, grid: GridData, context: NavigationContext): number {
  if (grid.edges[index] !== 256) return grid.edges[index];
  const x = index % grid.columns, y = Math.floor(index / grid.columns);
  const from = gridPoint(index, grid);
  let bits = 0;
  DIRECTIONS.forEach(([dx, dy], direction) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= grid.columns || ny >= grid.rows) return;
    const next = ny * grid.columns + nx;
    if (!grid.walkable[next]) return;
    // Diagonal nodes may not cut a blocked cardinal corner, and thin fences
    // are checked along the complete edge rather than only at its endpoints.
    if (dx && dy && (!grid.walkable[y * grid.columns + nx] || !grid.walkable[ny * grid.columns + x])) return;
    if (clearSegment(from, gridPoint(next, grid), context)) bits |= 1 << direction;
  });
  grid.edges[index] = bits;
  return bits;
}

class MinHeap {
  private entries: { index: number; priority: number }[] = [];
  get size() { return this.entries.length; }
  push(index: number, priority: number): void {
    const entry = { index, priority };
    this.entries.push(entry);
    let position = this.entries.length - 1;
    while (position > 0) {
      const parent = Math.floor((position - 1) / 2);
      if (this.entries[parent].priority <= priority) break;
      this.entries[position] = this.entries[parent]; position = parent;
    }
    this.entries[position] = entry;
  }
  pop(): number {
    const first = this.entries[0], last = this.entries.pop()!;
    if (this.entries.length) {
      let position = 0;
      while (true) {
        const left = position * 2 + 1, right = left + 1;
        if (left >= this.entries.length) break;
        const child = right < this.entries.length && this.entries[right].priority < this.entries[left].priority ? right : left;
        if (this.entries[child].priority >= last.priority) break;
        this.entries[position] = this.entries[child]; position = child;
      }
      this.entries[position] = last;
    }
    return first.index;
  }
}

export function findPath(from: Point, to: Point, context: NavigationContext): Point[] {
  if (!finite(from) || !finite(to)) return [];
  const start = nearestWalkable(from, context), target = nearestWalkable(to, context);
  if (distance(start, target) < 0.01) return [];
  if (clearSegment(start, target, context)) return [target];
  const grid = gridFor(context);
  const first = connectNode(start, grid, context), last = connectNode(target, grid, context);
  if (first < 0 || last < 0) return [];
  const cost = new Float64Array(grid.walkable.length).fill(Infinity);
  const parent = new Int32Array(grid.walkable.length).fill(-1);
  const closed = new Uint8Array(grid.walkable.length);
  const frontier = new MinHeap();
  cost[first] = 0; frontier.push(first, distance(gridPoint(first, grid), target));
  let reached = false, expanded = 0;
  while (frontier.size && expanded < grid.walkable.length) {
    const index = frontier.pop();
    if (closed[index]) continue;
    if (index === last) { reached = true; break; }
    closed[index] = 1; expanded++;
    const edge = edgesFor(index, grid, context);
    DIRECTIONS.forEach(([dx, dy], direction) => {
      if (!(edge & (1 << direction))) return;
      const next = index + dx + dy * grid.columns;
      if (closed[next]) return;
      const nextCost = cost[index] + (dx && dy ? GRID * Math.SQRT2 : GRID);
      if (nextCost >= cost[next]) return;
      cost[next] = nextCost; parent[next] = index;
      frontier.push(next, nextCost + distance(gridPoint(next, grid), gridPoint(last, grid)));
    });
  }
  if (!reached) return [];
  const reversed: Point[] = [];
  for (let index = last; index !== -1; index = parent[index]) reversed.push(gridPoint(index, grid));
  const points = [start, ...reversed.reverse(), target];
  const result: Point[] = [];
  let index = 0;
  while (index < points.length - 1) {
    let next = points.length - 1;
    while (next > index + 1 && !clearSegment(points[index], points[next], context)) next--;
    if (distance(points[index], points[next]) > 0.01) result.push(points[next]);
    index = next;
  }
  return result;
}

export function objectApproach(id: string, context: NavigationContext): Point {
  if (context.zone !== "village") {
    return nearestWalkable(id === "exit" ? { x: 450, y: 775 } : { x: 450, y: 750 }, context);
  }
  const object = OBJECTS.find((entry) => entry.id === id);
  if (!object) return nearestWalkable({ x: 710, y: 760 }, context);
  // The property is approached through its gate, not its interior/side fence.
  const destination = id === "property"
    ? { x: 1894, y: 906 }
    : { x: object.x, y: object.y + (id === "dungeon" ? 60 : 28) };
  return nearestWalkable(destination, context);
}

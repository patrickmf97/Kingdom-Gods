import { objectsForZone, regionForZone, type Rectangle as RegionRectangle } from "./regions";
import { ESTATE_DEFS, estateSolid } from "./territory-data";
import { interiorForZone } from "./interiors";
import type { EstateId, Zone } from "./types";

export type Point = { x: number; y: number };
export type NavigationContext = { zone: Zone; building: boolean; estates?: EstateId[] };

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

// Circle footprints remain exact for the village's painted well and trunks.
// Every region supplies its authored wall bases through the shared map contract.
const villageCircles: Circle[] = [
  circle(1315, 402, 18), circle(1130, 778, 31), circle(591, 1068, 8), circle(1780, 1311, 20),
  ...regionForZone("village").decor.map((item) => {
    const scale = item.scale ?? 1;
    return circle(item.x + scale, item.y - 12 * scale, 7 * scale);
  }),
];
const builtHouse = rectangle(2026, 718, 2160, 778);
const estateSolids = new Map(ESTATE_DEFS.map((estate) => [estate.id,
  { ...estateSolid(estate.id), kind: "rectangle" as const },
]));

const regionBuckets = new Map<Zone, Map<string, Solid[]>>();
function bucketsFor(zone: Zone): Map<string, Solid[]> {
  const existing = regionBuckets.get(zone);
  if (existing) return existing;
  const buckets = new Map<string, Solid[]>();
  const solids: Solid[] = [
    ...regionForZone(zone).solids.map((solid) => ({ ...solid, kind: "rectangle" as const })),
    ...(zone === "village" ? villageCircles : []),
  ];
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
  regionBuckets.set(zone, buckets);
  return buckets;
}

function bounds(context: NavigationContext) {
  const region = regionForZone(context.zone);
  return interiorForZone(context.zone) || context.zone === "dungeon"
    ? { left: 72, right: 828, top: 135, bottom: 800 }
    : { left: 70, right: region.width - 70, top: 90, bottom: region.height - 70 };
}
function fallbackFor(zone: Zone): Point {
  if (zone === "village") return { x: 710, y: 760 };
  if (zone === "wilderness") return { x: 400, y: 1780 };
  if (zone === "mine") return { x: 400, y: 970 };
  return { x: 450, y: 750 };
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

type Boundary = { from: Point; to: Point };
const regionBoundaries = new Map<Zone, Boundary[]>();
function boundariesFor(zone: Zone, areas: RegionRectangle[]): Boundary[] {
  const cached = regionBoundaries.get(zone);
  if (cached) return cached;
  const boundaries: Boundary[] = [];
  // Remove overlapping internal rectangle edges; only the exposed union border
  // constrains feet. This leaves chamber/corridor joins completely open.
  for (const area of areas) {
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const horizontal = side === "top" || side === "bottom";
      const coordinate = area[side];
      let intervals = [[horizontal ? area.left : area.top, horizontal ? area.right : area.bottom]];
      for (const other of areas) {
        if (other === area) continue;
        const extendsOutside = side === "top" ? other.top < coordinate && other.bottom >= coordinate
          : side === "bottom" ? other.top <= coordinate && other.bottom > coordinate
          : side === "left" ? other.left < coordinate && other.right >= coordinate
          : other.left <= coordinate && other.right > coordinate;
        if (!extendsOutside) continue;
        const low = horizontal ? other.left : other.top, high = horizontal ? other.right : other.bottom;
        const next: number[][] = [];
        for (const [start, end] of intervals) {
          if (low >= end || high <= start) { next.push([start, end]); continue; }
          if (low > start) next.push([start, low]);
          if (high < end) next.push([high, end]);
        }
        intervals = next;
      }
      for (const [start, end] of intervals) {
        if (end <= start) continue;
        boundaries.push(horizontal
          ? { from: { x: start, y: coordinate }, to: { x: end, y: coordinate } }
          : { from: { x: coordinate, y: start }, to: { x: coordinate, y: end } });
      }
    }
  }
  regionBoundaries.set(zone, boundaries);
  return boundaries;
}
function withinGround(point: Point, zone: Zone, areas: RegionRectangle[]): boolean {
  if (!areas.some((area) => point.x >= area.left && point.x <= area.right && point.y >= area.top && point.y <= area.bottom)) return false;
  return boundariesFor(zone, areas).every(({ from, to }) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    const fraction = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
    return (point.x - from.x - fraction * dx) ** 2 + (point.y - from.y - fraction * dy) ** 2 >= FEET_RADIUS ** 2;
  });
}
export function isWalkable(point: Point, context: NavigationContext): boolean {
  if (!finite(point)) return false;
  const area = bounds(context);
  // Swept steps can differ from an exact border endpoint by machine precision.
  const epsilon = 1e-7;
  if (point.x < area.left - epsilon || point.x > area.right + epsilon || point.y < area.top - epsilon || point.y > area.bottom + epsilon) return false;
  const ground = regionForZone(context.zone).walkableAreas;
  if (ground && !withinGround(point, context.zone, ground)) return false;
  if (context.zone === "village") {
    // The bridge joins dry banks horizontally; feet stay within its rails.
    const bridge = point.x >= 285 && point.x <= 485 && point.y >= 856 + FEET_RADIUS && point.y <= 930 - FEET_RADIUS;
    if (!bridge && riverDistanceSquared(point) < (47 + FEET_RADIUS) ** 2) return false;
  }
  const nearby = bucketsFor(context.zone).get(`${Math.floor(point.x / BUCKET)},${Math.floor(point.y / BUCKET)}`) ?? [];
  if (nearby.some((solid) => touchesSolid(point, solid))) return false;
  if (context.zone === "wilderness" && context.estates?.some((id) => {
    const solid = estateSolids.get(id);
    return solid && touchesSolid(point, solid);
  })) return false;
  return context.zone !== "village" || !context.building || !touchesSolid(point, builtHouse);
}

export function nearestWalkable(point: Point, context: NavigationContext): Point {
  const area = bounds(context);
  const fallback = fallbackFor(context.zone);
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
  const region = regionForZone(context.zone);
  const dx = Math.max(-region.width, Math.min(region.width, delta.x));
  const dy = Math.max(-region.height, Math.min(region.height, delta.y));
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
  // Each finite set of constructed estates has its own grid. A plot acquired
  // after an earlier route search immediately adds walls to future routes.
  const estates = context.zone === "wilderness"
    ? ESTATE_DEFS.filter((estate) => context.estates?.includes(estate.id)).map((estate) => estate.id).join(",")
    : "";
  const key = `${context.zone}:${context.building ? 1 : 0}:${estates}`;
  let grid = grids.get(key);
  if (grid) return grid;
  const region = regionForZone(context.zone);
  const columns = Math.floor(region.width / GRID) + 1;
  const rows = Math.floor(region.height / GRID) + 1;
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
  if (id === "exit" && (interiorForZone(context.zone) || context.zone === "dungeon")) {
    return nearestWalkable({ x: 450, y: 775 }, context);
  }
  const object = objectsForZone(context.zone).find((entry) => entry.id === id);
  if (!object) return nearestWalkable(fallbackFor(context.zone), context);
  // The property's gate is the entrance; other objects expose an open front.
  const destination = id === "property" && context.zone === "village"
    ? { x: 1894, y: 906 }
    : { x: object.x, y: object.y + (object.kind === "estate" ? 15 : id === "dungeon" ? 60 : 28) };
  return nearestWalkable(destination, context);
}

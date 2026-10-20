import type { Point } from "./types";

/** One logical shoreline for collision, water triangles, banks, reeds and maps. */
export const LAKE_OUTLINE: readonly Point[] = Object.freeze([
  [2316, 1460], [2364, 1438], [2440, 1430], [2506, 1440], [2580, 1452], [2634, 1490],
  [2640, 1546], [2616, 1592], [2568, 1624], [2498, 1630], [2438, 1614], [2378, 1622],
  [2324, 1590], [2290, 1566], [2280, 1514], [2294, 1482],
].map(([x, y]) => Object.freeze({ x, y })));
export const LAKE_BOUNDS = Object.freeze({
  left: Math.min(...LAKE_OUTLINE.map(point => point.x)), right: Math.max(...LAKE_OUTLINE.map(point => point.x)),
  top: Math.min(...LAKE_OUTLINE.map(point => point.y)), bottom: Math.max(...LAKE_OUTLINE.map(point => point.y)),
});
export const RIVER_WIDTH = 94;
export const RIVER_BRIDGE = Object.freeze({ left: 285, right: 485, top: 856, bottom: 930 });
export const RIVER_CENTERLINE: Point[] = [[-120, 436], [102, 524], [244, 702], [388, 908], [320, 1130],
  [274, 1304], [406, 1554], [300, 1774], [136, 1980]].map(([x, y]) => ({ x, y }));

export function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fraction = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - fraction * dx, point.y - a.y - fraction * dy);
}
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function lakeEdgeDistance(point: Point): number {
  let nearest = Infinity;
  for (let i = 0; i < LAKE_OUTLINE.length; i++) nearest = Math.min(nearest, segmentDistance(point, LAKE_OUTLINE[i], LAKE_OUTLINE[(i + 1) % LAKE_OUTLINE.length]));
  return nearest;
}
export function lakeContainsFeet(point: Point, radius = 9): boolean {
  if (point.x < LAKE_BOUNDS.left - radius || point.x > LAKE_BOUNDS.right + radius ||
      point.y < LAKE_BOUNDS.top - radius || point.y > LAKE_BOUNDS.bottom + radius) return false;
  return pointInPolygon(point, LAKE_OUTLINE) || lakeEdgeDistance(point) < radius;
}
/** Counterclockwise in logical screen coordinates: right normal points onto dry ground. */
export function shorelinePoint(fraction: number, outward: number): Point {
  const lengths = LAKE_OUTLINE.map((a, i) => { const b = LAKE_OUTLINE[(i + 1) % LAKE_OUTLINE.length]; return Math.hypot(b.x - a.x, b.y - a.y); });
  let remaining = ((fraction % 1) + 1) % 1 * lengths.reduce((a, b) => a + b, 0);
  let i = 0;
  while (i < lengths.length - 1 && remaining > lengths[i]) remaining -= lengths[i++];
  const a = LAKE_OUTLINE[i], b = LAKE_OUTLINE[(i + 1) % LAKE_OUTLINE.length], length = lengths[i];
  return { x: a.x + (b.x - a.x) * remaining / length + (b.y - a.y) / length * outward,
    y: a.y + (b.y - a.y) * remaining / length - (b.x - a.x) / length * outward };
}

import { populationDefinition, isVisitor } from './population';
import { travelerDestination, updateTravelerRoutes } from './travelers';
import { weatherFor } from './weather';
import { interiorForZone } from "./interiors";
import { npcGoalDestination, type NpcDestination } from "./life";
import { findPath, isWalkable, moveWithCollisions, nearestWalkable, type NavigationContext } from "./navigation";
import { regionForZone, type Portal } from "./regions";
import { estateBuildings } from "./territory-data";
import type { GameState, Npc, Point, Zone } from "./types";

export type NpcRouteCache = Map<string, { target: string; points: Point[] }>;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const outdoors = (point: Point): NpcDestination => ({ ...point, zone: "village" });
const room = (zone: Zone, point: Point): NpcDestination => ({ zone, ...point });
const workplace = (zone: Zone, id: string): NpcDestination => {
  const station = interiorForZone(zone)!.stations.find(object => object.id === id)!;
  return room(zone, { x: station.x - 75, y: station.y + 30 });
};
const evening: Record<string, Point> = {
  merchant: { x: 940, y: 1180 }, mira: { x: 1040, y: 1180 },
  aldric: { x: 1140, y: 1180 }, guard: { x: 980, y: 1280 }, farmer: { x: 1100, y: 1280 },
};
const sleep: Record<string, NpcDestination> = {
  merchant: room("inn-room", { x: 350, y: 550 }),
  mira: room("mira-room", { x: 550, y: 550 }),
  aldric: room("forge-room", { x: 350, y: 650 }),
  guard: room("inn-room", { x: 550, y: 650 }),
  farmer: room("inn-room", { x: 350, y: 650 }),
};

/** A routine expresses the final region; crossing it always uses authored doors below. */
export function npcRoutineDestination(state: GameState, npc: Npc): NpcDestination | null {
  if (npc.id === "matron") return null;
  if (isVisitor(state, npc.id)) return travelerDestination(state, npc);
  const profile = populationDefinition(state, npc.id);
  if (weatherFor(state.day, state.minutes, npc.zone).kind === 'storm') {
    if (interiorForZone(npc.zone)) return room(npc.zone, npc);
    return profile?.shelter ?? sleep[npc.id] ?? room('inn-room', { x: 450, y: 550 });
  }
  const need = npcGoalDestination(state, npc);
  if (need) return need;
  const hour = ((state.minutes % 1440) + 1440) % 1440 / 60;
  if (hour >= 22 || hour < 6) {
    if (npc.id === state.apostle.partnerId && state.property.owned && state.property.building)
      return room("farmhouse-room", { x: 550, y: 650 });
    if (profile) return profile.shelter;
    return sleep[npc.id] ?? room("inn-room", { x: 450, y: 550 });
  }
  if (profile) {
    if (hour < 7 || hour >= 18) return { zone: profile.npc.zone, x: npc.homeX, y: npc.homeY };
    return profile.work;
  }
  if (hour < 7) return outdoors({ x: npc.homeX, y: npc.homeY });
  if (hour >= 18) return evening[npc.id] ? outdoors(evening[npc.id]) : null;
  if (npc.id === "merchant") return workplace("inn-room", "market");
  if (npc.id === "mira") return workplace("mira-room", "house1");
  if (npc.id === "aldric") return workplace("forge-room", "forge");
  if (npc.id === "guard") return outdoors({ x: 2050, y: 450 });
  if (npc.id === "farmer") return outdoors(state.economy.worker?.npcId === "farmer"
    ? { x: 1900, y: 810 } : { x: 1830, y: 1040 });
  return outdoors({ x: npc.homeX, y: npc.homeY });
}

function firstPortal(from: Zone, to: Zone): Portal | null {
  const queue: { zone: Zone; first: Portal | null }[] = [{ zone: from, first: null }];
  const seen = new Set<Zone>([from]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const portal of regionForZone(current.zone).portals) {
      if (seen.has(portal.to)) continue;
      const first = current.first ?? portal;
      if (portal.to === to) return first;
      seen.add(portal.to); queue.push({ zone: portal.to, first });
    }
  }
  return null;
}

/** Every citizen navigates its own map, including maps currently offscreen. */
export function updateNpcRoutines(state: GameState, delta: number, cache: NpcRouteCache,
  options: { companionId?: string } = {}): void {
  if (!state.started || state.phase !== "playing" || !state.apostle.alive ||
      !Number.isFinite(delta) || delta <= 0) return;
  const estates = estateBuildings(state);
  for (const npc of state.npcs) {
    if (npc.id === "matron" || state.family.find(person => person.id === npc.id)?.alive === false) continue;
    const companion = !isVisitor(state, npc.id) && npc.id === options.companionId && npc.zone === state.zone;
    const context: NavigationContext = { zone: npc.zone, building: state.property.building, estates };
    if (!isWalkable(npc, context)) { Object.assign(npc, nearestWalkable(npc, context)); cache.delete(npc.id); }
    const destination = companion ? { zone: npc.zone, ...nearestWalkable({ x: state.apostle.x + 40, y: state.apostle.y + 35 }, context) }
      : npcRoutineDestination(state, npc);
    if (!destination) continue;
    let stage: Point = destination;
    let cross: { zone: Zone; spawn: Point } | null = null;
    if (npc.zone !== destination.zone) {
      const currentRoom = interiorForZone(npc.zone);
      const targetRoom = interiorForZone(destination.zone);
      if (currentRoom) {
        stage = currentRoom.exit;
        cross = { zone: currentRoom.entrance.zone, spawn: currentRoom.entrance };
      } else if (targetRoom && npc.zone === targetRoom.entrance.zone) {
        stage = targetRoom.entrance;
        cross = { zone: targetRoom.zone, spawn: targetRoom.spawn };
      } else {
        const portal = firstPortal(npc.zone, targetRoom?.entrance.zone ?? destination.zone);
        if (!portal) continue;
        stage = portal; cross = { zone: portal.to, spawn: portal.spawn };
      }
    }
    const safe = nearestWalkable(stage, context);
    const key = `${npc.zone}:${context.building}:${estates.join(",")}:${Math.round(safe.x / (companion ? 32 : 1))}:${Math.round(safe.y / (companion ? 32 : 1))}`;
    let route = cache.get(npc.id);
    if (!route || route.target !== key) {
      route = { target: key, points: findPath(npc, safe, context) };
      cache.set(npc.id, route);
    }
    let remaining = (companion ? 180 : 74) * Math.min(delta, 1);
    while (route.points.length && remaining > 0) {
      const point = route.points[0], range = distance(npc, point);
      if (range < .5) { route.points.shift(); continue; }
      const step = Math.min(remaining, range);
      const next = moveWithCollisions(npc, { x: (point.x - npc.x) / range * step, y: (point.y - npc.y) / range * step }, context);
      const travelled = distance(npc, next);
      Object.assign(npc, next); remaining -= step;
      if (travelled < step * .8) { cache.delete(npc.id); break; }
      if (step === range) route.points.shift();
    }
    if (cross && distance(npc, stage) <= 12) {
      const nextContext = { ...context, zone: cross.zone };
      npc.zone = cross.zone;
      Object.assign(npc, nearestWalkable(cross.spawn, nextContext));
      cache.delete(npc.id);
    } else if (!cross && distance(npc, safe) <= 2 && (state.minutes >= 22 * 60 || state.minutes < 6 * 60)) {
      npc.mood = "Descansando em abrigo";
    }
  }
  updateTravelerRoutes(state, delta);
}

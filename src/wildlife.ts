import { ITEMS } from "./data";
import { findPath, isWalkable, moveWithCollisions, type NavigationContext } from "./navigation";
import { regionForZone } from "./regions";
import { LEGACY_WILDERNESS_ROADS } from "./landscape-paths";
import { ESTATE_DEFS } from "./territory-data";
import { ANIMAL_DEFS, animalDefinition, type AnimalDefinition } from "./wildlife-data";
import type { AnimalState, Dialog, ExpansionHooks, GameState, Point, WildlifeState, Zone } from "./types";

const TAU = Math.PI * 2;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const home = (definition: AnimalDefinition): Point => ({ x: definition.homeX, y: definition.homeY });
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const contextFor = (zone: Zone): NavigationContext => ({
  zone, building: true, estates: ESTATE_DEFS.map(estate => estate.id),
});

function segmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  const fraction = clamp(((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(point.x - from.x - dx * fraction, point.y - from.y - dy * fraction);
}

/** Shared by migration and simulation: future plots and travel approaches stay clear. */
export function isAnimalHabitatPoint(definition: AnimalDefinition, point: Point): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || distance(point, home(definition)) > definition.radius + 0.001 ||
      !isWalkable(point, contextFor(definition.zone))) return false;
  if (definition.zone !== "wilderness") return true;
  if (ESTATE_DEFS.some(estate => point.x >= estate.x - estate.width / 2 - 35 &&
      point.x <= estate.x + estate.width / 2 + 35 &&
      point.y >= estate.y - estate.height - 35 && point.y <= estate.y + 60)) return false;
  if (regionForZone("wilderness").portals.some(portal => distance(point, portal) < 165)) return false;
  // Keep the original accepted habitat domain for every save version.
  if (point.x > 2271 && point.x < 2649 && point.y > 1421 && point.y < 1639) {
    const x = Math.max(2280, Math.min(2640, point.x)), y = Math.max(1430, Math.min(1630, point.y));
    if ((point.x - x) ** 2 + (point.y - y) ** 2 < 81) return false;
  }
  return !LEGACY_WILDERNESS_ROADS.some(road => road.some((pointOnRoad, index) => index > 0 &&
    segmentDistance(point, road[index - 1], pointOnRoad) < 65));
}

function initialSeed(id: string, day: number): number {
  let value = (2166136261 ^ day) >>> 0;
  for (const character of id) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
  return value;
}
function random(animal: AnimalState): number {
  animal.seed = (Math.imul(animal.seed, 1664525) + 1013904223) >>> 0;
  return animal.seed / 4294967296;
}

export function createWildlifeState(day: number): WildlifeState {
  const startDay = Number.isSafeInteger(day) && day >= 1 ? day : 1;
  return {
    animals: Object.fromEntries(ANIMAL_DEFS.map(definition => [definition.id, {
      id: definition.id, species: definition.species, zone: definition.zone,
      x: definition.homeX, y: definition.homeY, facing: 0, behavior: "idle",
      target: null, wait: 1 + (initialSeed(definition.id, startDay) % 300) / 100,
      trust: definition.species === "dog" ? 55 : definition.domestic ? 25 : 0,
      fear: 0, lastFedDay: null, seed: initialSeed(definition.id, startDay),
    } as AnimalState])),
    observed: [],
  };
}

export function animalsForZone(state: GameState, zone: Zone): AnimalState[] {
  return ANIMAL_DEFS.filter(definition => definition.zone === zone)
    .map(definition => state.wildlife.animals[definition.id]).filter((animal): animal is AnimalState => !!animal);
}

type Route = { target: string; points: Point[] };
// Routes are bounded transient caches; positions, intentions and randomness stay in the save.
const routes = new WeakMap<WildlifeState, Map<string, Route>>();
function habitatSegment(definition: AnimalDefinition, from: Point, to: Point): boolean {
  const samples = Math.max(1, Math.ceil(distance(from, to) / 4));
  for (let index = 0; index <= samples; index++) {
    const along = index / samples;
    if (!isAnimalHabitatPoint(definition, { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along })) return false;
  }
  return true;
}
function resting(definition: AnimalDefinition, minutes: number): boolean {
  const hour = ((minutes % 1440) + 1440) % 1440 / 60;
  return definition.species === "fox" ? hour >= 8 && hour < 17 : hour < 6 || hour >= 20;
}
function clearTarget(animal: AnimalState, cache: Map<string, Route>): void {
  animal.target = null;
  cache.delete(animal.id);
}

function chooseTarget(animal: AnimalState, definition: AnimalDefinition, player: Point | null, flee: boolean): Point | null {
  let result: Point | null = null, best = -Infinity;
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = random(animal) * TAU;
    const length = definition.radius * (0.25 + random(animal) * 0.65);
    const candidate = { x: definition.homeX + Math.cos(angle) * length, y: definition.homeY + Math.sin(angle) * length };
    if (!isAnimalHabitatPoint(definition, candidate)) continue;
    if (!flee) return candidate;
    const score = player ? distance(candidate, player) - distance(candidate, animal) * 0.25 : 0;
    if (score > best && (!player || distance(candidate, player) > distance(animal, player) + 8)) { result = candidate; best = score; }
  }
  return result;
}

/** Only the active outdoor region ticks; dt is bounded and never represents offline time. */
export function updateWildlife(state: GameState, deltaSeconds: number): void {
  if (state.phase !== "playing" || !state.apostle.alive || state.apostle.hp <= 0 ||
      !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
  const dt = Math.min(deltaSeconds, 1);
  let cache = routes.get(state.wildlife);
  if (!cache) { cache = new Map(); routes.set(state.wildlife, cache); }
  let searches = 2;
  for (const animal of animalsForZone(state, state.zone)) {
    const definition = animalDefinition(animal.id)!;
    const playerDistance = distance(animal, state.apostle);
    const frightDistance = definition.domestic ? Math.max(22, 48 - animal.trust * 0.35) : Math.max(65, 155 - animal.trust);
    const frightened = playerDistance < frightDistance && animal.trust < 65;
    animal.fear = clamp(animal.fear + (frightened ? 24 : -10) * dt, 0, 100);
    const wasMoving = animal.behavior === "flee" || animal.behavior === "walk" || animal.behavior === "approach";
    animal.wait = Math.max(0, animal.wait - dt);
    if (frightened && animal.fear <= 24 * dt + .001 && !wasMoving) animal.wait = 0;
    if (frightened) {
      // A bounded habitat may have no retreat farther from a stationary visitor.
      // Keep the failed-route delay instead of rolling a fresh fleeing target every frame.
      if (animal.target && animal.behavior !== "flee") clearTarget(animal, cache);
      if (animal.target && distance(animal, animal.target) < 6) clearTarget(animal, cache);
      if (!animal.target && animal.wait <= 0) {
        animal.target = chooseTarget(animal, definition, state.apostle, true);
        if (!animal.target) animal.wait = 2.5;
      }
      animal.behavior = animal.target ? "flee" : resting(definition, state.minutes) ? "rest" : "idle";
    } else if (resting(definition, state.minutes)) {
      clearTarget(animal, cache);
      animal.behavior = "rest";
      animal.wait = 3;
    } else if (animal.behavior === "rest") {
      animal.behavior = "idle";
      animal.wait = 0;
    } else if (animal.behavior === "flee" && animal.fear <= 12) {
      clearTarget(animal, cache);
      animal.behavior = "idle";
      animal.wait = 1;
    }
    if (animal.behavior === "rest" || (frightened && !animal.target)) continue;
    if (!frightened && animal.fear <= 12 && animal.trust >= 45 && playerDistance > 75 && playerDistance < 220) {
      const along = 1 - 60 / playerDistance;
      const target = { x: animal.x + (state.apostle.x - animal.x) * along, y: animal.y + (state.apostle.y - animal.y) * along };
      if (isAnimalHabitatPoint(definition, target) && (!animal.target || distance(animal.target, target) > 35)) {
        clearTarget(animal, cache); animal.target = target; animal.behavior = "approach";
      }
    }
    if (!animal.target && animal.wait <= 0 && animal.behavior !== "flee") {
      if (random(animal) < 0.62) {
        animal.behavior = definition.species === "dog" || definition.species === "fox" ? "idle" : "graze";
        animal.wait = 2 + random(animal) * 5;
      } else {
        animal.target = chooseTarget(animal, definition, null, false);
        animal.behavior = animal.target ? "walk" : "idle";
        animal.wait = animal.target ? 0 : 2;
      }
    }
    if (!animal.target) continue;
    const key = `${animal.target.x},${animal.target.y}`;
    let route = cache.get(animal.id);
    if (route?.target !== key) {
      if (searches <= 0) continue;
      searches--;
      const points = findPath(animal, animal.target, contextFor(animal.zone));
      let from: Point = animal;
      const valid = points.length <= 24 && points.every(point => {
        const legal = habitatSegment(definition, from, point); from = point; return legal;
      });
      route = { target: key, points: valid ? points : [] };
      cache.set(animal.id, route);
    }
    if (!route.points.length) {
      clearTarget(animal, cache); animal.wait = 1.5;
      animal.behavior = resting(definition, state.minutes) ? "rest" : "idle";
      continue;
    }
    const point = route.points[0], remaining = distance(animal, point);
    const step = Math.min(remaining, definition.speed * (animal.behavior === "flee" ? 1.55 : 1) * dt);
    if (remaining > 0.001) {
      const from = { x: animal.x, y: animal.y };
      const moved = moveWithCollisions(animal, { x: (point.x - animal.x) / remaining * step, y: (point.y - animal.y) / remaining * step }, contextFor(animal.zone));
      if (habitatSegment(definition, from, moved) && distance(from, moved) > 0.01) {
        animal.facing = (Math.atan2(moved.y - from.y, moved.x - from.x) + TAU) % TAU;
        Object.assign(animal, moved);
      } else {
        clearTarget(animal, cache);
        animal.behavior = resting(definition, state.minutes) ? "rest" : "idle";
        animal.wait = 2.5;
        continue;
      }
    }
    if (distance(animal, point) < 1) route.points.shift();
    if (!route.points.length) {
      clearTarget(animal, cache);
      animal.behavior = resting(definition, state.minutes) ? "rest" : "idle";
      animal.wait = 1 + random(animal) * 3;
    }
  }
}

function nearby(state: GameState, animal: AnimalState): boolean {
  return state.phase === "playing" && state.apostle.alive && state.apostle.hp > 0 && state.zone === animal.zone && distance(state.apostle, animal) <= 150;
}
const behaviorText = { idle: "observa os arredores", walk: "caminha pelo seu habitat", graze: "procura alimento no chão", rest: "descansa", flee: "se afasta assustado", approach: "se aproxima com confiança" };
const speciesText = { chicken: "Galinha de Valeverde", sheep: "Ovelha de Valeverde", cow: "Vaca de Valeverde", dog: "Cão de Valeverde", deer: "Cervo dos Ermos", rabbit: "Coelho dos Ermos", fox: "Raposa dos Ermos" };

export function animalDialog(state: GameState, id: string): Dialog | null {
  const definition = animalDefinition(id), animal = state.wildlife.animals[id];
  if (!definition || !animal || !nearby(state, animal)) return null;
  const fed = animal.lastFedDay === state.day;
  return {
    name: definition.name, role: speciesText[animal.species],
    text: `${definition.name} ${behaviorText[animal.behavior]}. Confiança: ${Math.round(animal.trust)} · Medo: ${Math.round(animal.fear)}.${fed ? " Já recebeu alimento hoje." : ""}`,
    options: [
      { label: state.wildlife.observed.includes(id) ? "Encontro registrado" : "Observar e registrar encontro", action: `animal-observe:${id}`, disabled: state.wildlife.observed.includes(id) },
      ...(definition.feed ? [{ label: fed ? "Já alimentado hoje" : `Oferecer 1 ${ITEMS[definition.feed].name}`, action: `animal-feed:${id}`, disabled: fed || state.inventory[definition.feed] < 1 }] : []),
      { label: "Voltar", action: "close" },
    ],
  };
}

export function executeWildlifeAction(state: GameState, action: string, hooks: ExpansionHooks): boolean {
  const match = /^(animal-observe|animal-feed):([^:]+)$/.exec(action);
  if (!match) return false;
  const [, verb, id] = match, definition = animalDefinition(id), animal = state.wildlife.animals[id];
  if (!definition || !animal || !nearby(state, animal)) {
    hooks.message("Aproxime-se do animal para interagir.", "warning"); return true;
  }
  if (verb === "animal-observe") {
    if (!state.wildlife.observed.includes(id)) {
      state.wildlife.observed.push(id);
      hooks.remember("Um encontro na paisagem", `Observei ${definition.name} enquanto ${behaviorText[animal.behavior]}.`, "Curiosidade", 45);
      hooks.message(`Encontro com ${definition.name} registrado.`, "success");
    }
    return true;
  }
  if (!definition.feed) { hooks.message("Este animal deve procurar seu próprio alimento.", "warning"); return true; }
  if (animal.lastFedDay === state.day) { hooks.message(`${definition.name} já recebeu alimento hoje.`, "warning"); return true; }
  if (state.inventory[definition.feed] < 1) { hooks.message(`Você precisa de 1 ${ITEMS[definition.feed].name}.`, "warning"); return true; }
  state.inventory[definition.feed]--;
  animal.lastFedDay = state.day;
  const priorTrust = animal.trust, priorFear = animal.fear;
  animal.trust = Math.min(100, animal.trust + 16);
  animal.fear = Math.max(0, animal.fear - 35);
  animal.target = null; animal.wait = 2;
  animal.behavior = resting(definition, state.minutes) ? "rest" : "idle";
  routes.get(state.wildlife)?.delete(id);
  hooks.remember("Alimento e confiança", `Ofereci 1 ${ITEMS[definition.feed].name} a ${definition.name}. Confiança: ${Math.round(priorTrust)} → ${Math.round(animal.trust)}; medo: ${Math.round(priorFear)} → ${Math.round(animal.fear)}.`, "Cuidado", 55);
  hooks.message(`${definition.name} aceitou o alimento. Confiança +${Math.round(animal.trust - priorTrust)}.`, "success");
  return true;
}

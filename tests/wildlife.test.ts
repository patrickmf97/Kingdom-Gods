import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../src/simulation";
import { ANIMAL_DEFS, animalDefinition } from "../src/wildlife-data";
import { animalDialog, animalsForZone, createWildlifeState, executeWildlifeAction, isAnimalHabitatPoint, updateWildlife } from "../src/wildlife";
import { ESTATE_DEFS } from "../src/territory-data";
import { WILDERNESS_ROADS } from "../src/regions";
import { isWalkable } from "../src/navigation";
import type { ExpansionHooks, GameState, Point, Zone } from "../src/types";

function game(zone: Zone = "village") {
  const state = initialState();
  state.started = true; state.phase = "playing"; state.intro = false;
  state.zone = zone; state.minutes = 12 * 60;
  Object.assign(state.apostle, { x: 710, y: 760 });
  const hooks: ExpansionHooks = {
    message: (text, type = "info") => state.messages.push({ id: state.messages.length, text, type }),
    remember: (title, text, emotion, intensity = 60) => state.apostle.memories.push({ id: String(state.apostle.memories.length), day: state.day, title, text, emotion, intensity }),
    practice: () => assert.fail("wildlife interactions must not award skill experience"),
    nearObject: () => false, nearNpc: () => false,
  };
  return { state, hooks };
}
function near(state: GameState, id: string, offset = 0) {
  const animal = state.wildlife.animals[id];
  state.zone = animal.zone;
  Object.assign(state.apostle, { x: animal.x + offset, y: animal.y });
  return animal;
}
const separation = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

test("new campaigns author exactly 22 named animals with stable legal habitats", () => {
  const { state } = game();
  assert.equal(state.version, 6);
  assert.equal(ANIMAL_DEFS.length, 22);
  assert.equal(new Set(ANIMAL_DEFS.map(animal => animal.id)).size, 22);
  assert.equal(new Set(ANIMAL_DEFS.map(animal => animal.name)).size, 22);
  assert.deepEqual(ANIMAL_DEFS.reduce<Record<string, number>>((counts, animal) => {
    counts[animal.species] = (counts[animal.species] ?? 0) + 1; return counts;
  }, {}), { chicken: 4, sheep: 3, cow: 2, dog: 1, deer: 4, rabbit: 6, fox: 2 });
  assert.equal(animalsForZone(state, "village").length, 10);
  assert.equal(animalsForZone(state, "wilderness").length, 12);
  for (const definition of ANIMAL_DEFS) {
    const animal = state.wildlife.animals[definition.id];
    assert.equal(animal.zone, definition.domestic ? "village" : "wilderness");
    assert.ok(isAnimalHabitatPoint(definition, animal), definition.id);
    assert.ok(Number.isInteger(animal.seed) && animal.seed >= 0 && animal.seed <= 0xffffffff);
    assert.equal(animal.lastFedDay, null);
  }
  assert.ok(separation(state.wildlife.animals["dog-1"], { x: 1280, y: 940 }) < 150, "Bento can be encountered at the central market");
});

test("habitat validation rejects map edges, solid ground, roads, portals and every future estate", () => {
  const def = animalDefinition("deer-1")!;
  assert.equal(isAnimalHabitatPoint(def, { x: NaN, y: def.homeY }), false);
  assert.equal(isAnimalHabitatPoint(def, { x: def.homeX + def.radius + 1, y: def.homeY }), false);
  const anywhere = { ...def, radius: 10000 };
  for (const point of [{ x: 0, y: 0 }, { x: 2460, y: 1530 }, { x: 400, y: 1820 }, ...WILDERNESS_ROADS.flat(),
    ...ESTATE_DEFS.map(estate => ({ x: estate.x, y: estate.y - 80 }))]) {
    assert.equal(isAnimalHabitatPoint(anywhere, point), false, JSON.stringify(point));
  }
  const village = { ...animalDefinition("dog-1")!, radius: 10000 };
  assert.equal(isAnimalHabitatPoint(village, { x: 1270, y: 790 }), false, "market wall");
  assert.equal(isAnimalHabitatPoint(village, { x: 244, y: 702 }), false, "river");
  assert.equal(isAnimalHabitatPoint(village, { x: 2090, y: 750 }), false, "future house");
});

test("deterministic wandering remains on navigable habitat throughout both outdoor regions", () => {
  const a = game().state, b = game().state;
  for (const zone of ["village", "wilderness"] as const) {
    a.zone = b.zone = zone;
    Object.assign(a.apostle, { x: 400, y: 1780 }); Object.assign(b.apostle, a.apostle);
    const before = structuredClone(a.wildlife);
    for (let step = 0; step < 280; step++) {
      updateWildlife(a, 0.25); updateWildlife(b, 0.25);
      for (const animal of animalsForZone(a, zone)) {
        assert.ok(isAnimalHabitatPoint(animalDefinition(animal.id)!, animal), `${animal.id} escaped on ${step}`);
        assert.ok(isWalkable(animal, { zone, building: true, estates: ["oak-hollow", "stone-rise"] }));
        if (animal.target) assert.ok(isAnimalHabitatPoint(animalDefinition(animal.id)!, animal.target));
      }
    }
    assert.ok(animalsForZone(a, zone).some(animal => separation(animal, before.animals[animal.id]) > 5), `${zone} animals actually move`);
    assert.deepEqual(a.wildlife, b.wildlife);
  }
});

test("day grazing, night rest and crepuscular fox activity follow the actual calendar", () => {
  const { state } = game();
  state.minutes = 22 * 60;
  updateWildlife(state, 0.25);
  assert.ok(animalsForZone(state, "village").every(animal => animal.behavior === "rest" && animal.target === null));
  state.minutes = 12 * 60;
  for (let step = 0; step < 100; step++) updateWildlife(state, 0.25);
  assert.ok(animalsForZone(state, "village").some(animal => animal.behavior === "graze"));
  state.zone = "wilderness";
  updateWildlife(state, 0.25);
  assert.equal(state.wildlife.animals["fox-1"].behavior, "rest");
  state.minutes = 19 * 60;
  updateWildlife(state, 0.25);
  assert.notEqual(state.wildlife.animals["fox-1"].behavior, "rest");
  state.minutes = 23 * 60;
  updateWildlife(state, 0.25);
  assert.equal(state.wildlife.animals["deer-1"].behavior, "rest");
  assert.notEqual(state.wildlife.animals["fox-1"].behavior, "rest");
});

test("wild animals flee nearby strangers and fear settles when the stranger leaves", () => {
  const { state } = game("wilderness");
  const deer = near(state, "deer-1", 20), original = { x: deer.x, y: deer.y };
  for (let step = 0; step < 20; step++) updateWildlife(state, 0.1);
  assert.equal(deer.behavior, "flee");
  assert.ok(deer.fear > 0);
  assert.ok(separation(deer, state.apostle) > separation(original, state.apostle), "fleeing increases distance");
  Object.assign(state.apostle, { x: 400, y: 1780 });
  for (let step = 0; step < 80; step++) updateWildlife(state, 0.25);
  assert.equal(deer.fear, 0);
  assert.notEqual(deer.behavior, "flee");
});

test("a trusted dog approaches within its habitat without blocking or chasing the apostle", () => {
  const { state } = game();
  const dog = near(state, "dog-1", 100), before = separation(dog, state.apostle);
  updateWildlife(state, 0.25);
  assert.equal(dog.behavior, "approach");
  assert.ok(separation(dog, state.apostle) < before);
  const player = structuredClone(state.apostle);
  for (let step = 0; step < 30; step++) updateWildlife(state, 0.1);
  assert.deepEqual(state.apostle, player);
  assert.ok(separation(dog, state.apostle) >= 59);
});

test("zero and invalid dt, inactive regions and stopped campaigns cannot advance animals", () => {
  const { state } = game();
  const snapshot = structuredClone(state.wildlife);
  for (const dt of [0, -1, NaN, Infinity]) updateWildlife(state, dt);
  assert.deepEqual(state.wildlife, snapshot);
  state.zone = "mine"; updateWildlife(state, 1);
  assert.deepEqual(state.wildlife, snapshot);
  state.zone = "village"; state.phase = "title"; updateWildlife(state, 1);
  state.phase = "playing"; state.apostle.alive = false; updateWildlife(state, 1);
  assert.deepEqual(state.wildlife, snapshot);
  state.apostle.alive = true;
  const dormant = structuredClone(animalsForZone(state, "wilderness"));
  updateWildlife(state, 1);
  assert.deepEqual(animalsForZone(state, "wilderness"), dormant);
});

test("an oversized dt has bounded work and movement rather than offline catchup", () => {
  const a = game().state, b = game().state;
  near(a, "dog-1", 100); near(b, "dog-1", 100);
  updateWildlife(a, 86400); updateWildlife(b, 1);
  assert.deepEqual(a.wildlife, b.wildlife);
});

test("observation is one truthful encounter memory with no inventory, currency or experience reward", () => {
  const { state, hooks } = game();
  const animal = near(state, "chicken-1"); animal.behavior = "graze";
  const inventory = structuredClone(state.inventory), skills = structuredClone(state.apostle.skills), gold = state.gold;
  assert.equal(executeWildlifeAction(state, "animal-observe:chicken-1", hooks), true);
  executeWildlifeAction(state, "animal-observe:chicken-1", hooks);
  assert.deepEqual(state.wildlife.observed, ["chicken-1"]);
  assert.equal(state.apostle.memories.length, 1);
  assert.match(state.apostle.memories[0].text, /Pipoca.*procura alimento/);
  assert.deepEqual(state.inventory, inventory); assert.deepEqual(state.apostle.skills, skills); assert.equal(state.gold, gold);
});

test("feeding consumes one compatible item per animal per day and changes persistent trust and fear", () => {
  const { state, hooks } = game();
  const sheep = near(state, "sheep-1"); sheep.fear = 60;
  state.inventory.wheat = 3;
  const gold = state.gold, merchant = state.merchantGold, market = structuredClone(state.market), skills = structuredClone(state.apostle.skills);
  executeWildlifeAction(state, "animal-feed:sheep-1", hooks);
  assert.equal(state.inventory.wheat, 2); assert.equal(sheep.trust, 41); assert.equal(sheep.fear, 25); assert.equal(sheep.lastFedDay, 1);
  executeWildlifeAction(state, "animal-feed:sheep-1", hooks);
  assert.equal(state.inventory.wheat, 2); assert.equal(sheep.trust, 41); assert.equal(state.apostle.memories.length, 1);
  state.day++;
  executeWildlifeAction(state, "animal-feed:sheep-1", hooks);
  assert.equal(state.inventory.wheat, 1); assert.equal(sheep.trust, 57); assert.equal(sheep.fear, 0); assert.equal(sheep.lastFedDay, 2);
  assert.equal(state.gold, gold); assert.equal(state.merchantGold, merchant); assert.deepEqual(state.market, market); assert.deepEqual(state.apostle.skills, skills);
  const dog = near(state, "dog-1"); state.inventory.bread = 1;
  executeWildlifeAction(state, "animal-feed:dog-1", hooks);
  assert.equal(state.inventory.bread, 0); assert.equal(state.inventory.wheat, 1); assert.equal(dog.lastFedDay, state.day);
});

test("actions recheck proximity, zone, food, species and life instead of trusting the open dialog", () => {
  const { state, hooks } = game();
  state.inventory.wheat = 4; state.inventory.bread = 2;
  const sheep = near(state, "sheep-1", 150);
  assert.ok(animalDialog(state, "sheep-1"));
  state.apostle.x += 0.01;
  assert.equal(animalDialog(state, "sheep-1"), null);
  const wildlife = structuredClone(state.wildlife), inventory = structuredClone(state.inventory);
  executeWildlifeAction(state, "animal-feed:sheep-1", hooks);
  executeWildlifeAction(state, "animal-observe:sheep-1", hooks);
  near(state, "sheep-1"); state.zone = "orphanage";
  executeWildlifeAction(state, "animal-feed:sheep-1", hooks);
  near(state, "fox-1"); executeWildlifeAction(state, "animal-feed:fox-1", hooks);
  near(state, "dog-1"); state.apostle.alive = false;
  executeWildlifeAction(state, "animal-feed:dog-1", hooks);
  executeWildlifeAction(state, "animal-feed:invented", hooks);
  assert.equal(executeWildlifeAction(state, "buy:wheat", hooks), false);
  assert.deepEqual(state.wildlife, wildlife); assert.deepEqual(state.inventory, inventory);
  state.apostle.alive = true; state.inventory.bread = 0;
  executeWildlifeAction(state, "animal-feed:dog-1", hooks);
  assert.equal(state.wildlife.animals["dog-1"].lastFedDay, null);
  assert.equal(sheep.lastFedDay, null);
});

test("feed memory and notification report the actual bounded trust change", () => {
  const { state, hooks } = game(); const dog = near(state, "dog-1");
  dog.trust = 98; state.inventory.bread = 1;
  executeWildlifeAction(state, "animal-feed:dog-1", hooks);
  assert.equal(dog.trust, 100);
  assert.match(state.messages.at(-1)!.text, /Confiança \+2/);
  assert.match(state.apostle.memories.at(-1)!.text, /98 → 100/);
});

test("separate campaigns never share animals, observed IDs or initial random seeds", () => {
  const a = createWildlifeState(1), b = createWildlifeState(1);
  assert.deepEqual(a, b);
  a.animals["dog-1"].trust = 99; a.observed.push("dog-1");
  assert.equal(b.animals["dog-1"].trust, 55); assert.deepEqual(b.observed, []);
  assert.notEqual(createWildlifeState(2).animals["dog-1"].seed, b.animals["dog-1"].seed);
});

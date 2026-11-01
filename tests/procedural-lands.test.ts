import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LANDS, isLandZone, kingdomFor, landForZone, landHeader, landKind, landZone, setLandSeed,
} from "../src/lands";
import { HIGHLAND_LANDS_PORTAL, HIGHLANDS_REGION } from "../src/highlands";
import { findPath, isWalkable, nearestWalkable } from "../src/navigation";
import { portalForZone, regionForZone, resourceNode } from "../src/regions";
import { processFrontierDay, reserveRemaining } from "../src/frontier";
import { GameStore } from "../src/simulation";
import { validateState } from "../src/persistence";
import { LAND_INN_PRICE } from "../src/land-life";
import type { ExpansionHooks } from "../src/types";

const hooks: ExpansionHooks = { message() {}, remember() {}, practice() {}, nearObject: () => true, nearNpc: () => false };

test("land zones are a closed, bounded pattern", () => {
  assert.ok(isLandZone("terra-1") && isLandZone(`terra-${MAX_LANDS}`));
  for (const bad of ["terra-0", "terra-01", `terra-${MAX_LANDS + 1}`, "terra-1.5", "terra--2", "terra-", "village", 3, null])
    assert.equal(isLandZone(bad), false, String(bad));
});

test("the same seed always yields the same lands; another seed yields others", () => {
  setLandSeed(424242);
  const first = JSON.stringify(landForZone("terra-3").region);
  const name = landHeader(3).name;
  setLandSeed(99);
  const other = landForZone("terra-3");
  assert.notEqual(JSON.stringify(other.region), first);
  setLandSeed(424242);
  assert.equal(JSON.stringify(landForZone("terra-3").region), first);
  assert.equal(landHeader(3).name, name);
});

test("the road follows Auren's rules: the March, the mist, then kingdom seats, villages and border wilds", () => {
  assert.equal(landKind(1), "aldeia");
  assert.equal(landKind(2), "ermo");
  for (let index = 3; index <= MAX_LANDS; index++) {
    assert.equal(landKind(index), (["cidade", "aldeia", "ermo"] as const)[(index - 3) % 3]);
    assert.ok(!(landKind(index) === "ermo" && landKind(index - 1) === "ermo"), "never two wilds in a row");
  }
  for (const seed of [1, 7, 31337]) {
    setLandSeed(seed);
    assert.equal(landForZone("terra-1").kingdom.name, "Reino de Auren");
    assert.equal(landForZone("terra-2").kingdom.name, "Reino de Auren");
    const kingdoms = Array.from({ length: 9 }, (_, i) => kingdomFor(i + 1));
    assert.equal(new Set(kingdoms.map(k => k.name)).size, kingdoms.length, "each kingdom has its own name");
    assert.equal(new Set(kingdoms.map(k => k.ruler.split(" ").slice(-2, -1)[0])).size, kingdoms.length, "rulers are not repeated");
    for (const kingdom of kingdoms) assert.match(kingdom.legend, /Alvor|Elara|Antigos|Brumavale|bênção/);
    for (let index = 3; index <= MAX_LANDS; index++) {
      const land = landForZone(landZone(index));
      if (land.kind === "cidade") {
        assert.ok(land.buildings.some(b => b.model === "keep") && land.buildings.some(b => b.model === "orphanage"), "a seat has a keep and a chapel");
        assert.notEqual(land.kingdom.name, landForZone(landZone(index - 1)).kingdom.name, "a new kingdom begins at its seat");
      } else assert.equal(land.kingdom.name, landForZone(landZone(index - 1)).kingdom.name);
    }
  }
});

test("every generated land is connected: walkable road, portals, people and reserves", () => {
  for (const seed of [3, 42, 2024, 777777]) {
    setLandSeed(seed);
    for (let index = 1; index <= MAX_LANDS; index++) {
      const land = landForZone(landZone(index));
      const context = { zone: land.zone, building: false };
      for (const point of land.roads[0]) assert.ok(isWalkable(point, context), `${seed} ${land.zone} road ${point.x},${point.y}`);
      const back = land.portals[0], ahead = land.portals[1];
      assert.ok(isWalkable(back, context) && (!ahead || isWalkable(ahead, context)), `${land.zone} portals`);
      if (ahead) {
        const route = findPath(nearestWalkable({ x: back.x + 110, y: back.y }, context), nearestWalkable({ x: ahead.x - 110, y: ahead.y }, context), context);
        assert.ok(route.length >= 1 && Math.hypot(route.at(-1)!.x - ahead.x, route.at(-1)!.y - ahead.y) < 200, `${seed} ${land.zone} has a route from west to east`);
        const next = landForZone(ahead.to as `terra-${number}`);
        assert.ok(Math.hypot(ahead.spawn.x - next.portals[0].x, ahead.spawn.y - next.portals[0].y) < 160, "arrives by the next land's west gate");
        assert.ok(isWalkable(nearestWalkable(ahead.spawn, { zone: next.zone, building: false }), { zone: next.zone, building: false }));
      } else assert.equal(index, MAX_LANDS);
      for (const local of land.locals) assert.ok(isWalkable(nearestWalkable(local, context), context));
      const ids = new Set(land.region.objects.map(object => object.id));
      assert.equal(ids.size, land.region.objects.length, "object ids are unique");
      for (const node of land.resources) {
        assert.equal(resourceNode(node.id), node);
        assert.ok(node.id.startsWith(`${land.zone}/`));
        assert.ok(node.capacity === (node.resource === "wood" || node.resource === "ore" ? 4 : 5));
        if (node.resource === "ore") assert.ok(land.biome === "serra" || land.biome === "charneca" || land.kind === "ermo");
        const approach = nearestWalkable({ x: node.x, y: node.y + 30 }, context);
        assert.ok(Math.hypot(approach.x - node.x, approach.y - node.y) < 120, `${node.id} can be worked`);
      }
      assert.ok(land.resources.length >= 8, `${land.zone} offers work`);
      if (land.kind !== "ermo") assert.ok(land.locals.length >= 4 && land.buildings.length >= 4, "settlements are inhabited");
    }
  }
});

test("Brumavale's eastern road leads to the first land and back", () => {
  setLandSeed(5150);
  assert.ok(HIGHLANDS_REGION.portals.includes(HIGHLAND_LANDS_PORTAL));
  assert.equal(HIGHLAND_LANDS_PORTAL.to, "terra-1");
  assert.equal(HIGHLAND_LANDS_PORTAL.spawn.y, landHeader(1).westY, "the arrival follows the seed");
  const back = landForZone("terra-1").portals[0];
  assert.equal(back.to, "highlands");
  assert.ok(isWalkable(nearestWalkable(back.spawn, { zone: "highlands", building: false }), { zone: "highlands", building: false }));
  assert.ok(Math.hypot(back.spawn.x - HIGHLAND_LANDS_PORTAL.x, back.spawn.y - HIGHLAND_LANDS_PORTAL.y) < 160);
  assert.ok(isWalkable(HIGHLAND_LANDS_PORTAL, { zone: "highlands", building: false }));
});

function traveller(): GameStore {
  const game = new GameStore();
  game.create({ name: "Aelia", surname: "Valen", sex: "female", skin: "#d3a17b", hair: "#493327", eyes: "#7ca078", outfit: "#6d8866", blessing: "vigor" });
  game.state.intro = false;
  game.state.lands!.seed = 8080;
  game.state.zone = "highlands";
  Object.assign(game.state.apostle, { x: HIGHLAND_LANDS_PORTAL.x - 40, y: HIGHLAND_LANDS_PORTAL.y });
  return game;
}

test("travelling beyond the mist records the new land once and keeps a valid campaign", () => {
  const game = traveller();
  const dialog = game.interact(HIGHLAND_LANDS_PORTAL.id);
  assert.ok(dialog?.options.some(option => option.action === `travel:${HIGHLAND_LANDS_PORTAL.id}`));
  game.choose(`travel:${HIGHLAND_LANDS_PORTAL.id}`);
  assert.equal(game.state.zone, "terra-1");
  assert.equal(game.state.lands!.furthest, 1);
  const land = landForZone("terra-1");
  assert.equal(regionForZone("terra-1").name, land.name);
  assert.ok(game.state.apostle.memories.some(memory => memory.text.includes(land.name)));
  assert.ok(validateState(structuredClone(game.state)), "a save in a generated land is valid");
  const memories = game.state.apostle.memories.length;
  // Back to Brumavale and in again: no second arrival memory.
  const back = land.portals[0];
  Object.assign(game.state.apostle, nearestWalkable({ x: back.x + 40, y: back.y }, { zone: "terra-1", building: false }));
  game.choose(`travel:${back.id}`);
  assert.equal(game.state.zone, "highlands");
  Object.assign(game.state.apostle, { x: HIGHLAND_LANDS_PORTAL.x - 40, y: HIGHLAND_LANDS_PORTAL.y });
  game.choose(`travel:${HIGHLAND_LANDS_PORTAL.id}`);
  assert.equal(game.state.zone, "terra-1");
  assert.ok(game.state.apostle.memories.length <= memories + 1, "no repeated discovery");
});

test("people, the inn and the chapel of a generated land", () => {
  const game = traveller();
  game.choose(`travel:${HIGHLAND_LANDS_PORTAL.id}`);
  const land = landForZone("terra-1");
  const local = land.locals[0];
  Object.assign(game.state.apostle, { x: local.x, y: local.y + 30 });
  const talk = game.interact(local.id);
  assert.equal(talk?.name, local.name);
  assert.ok(talk!.text.length > 40);
  const lore = game.choose(`land-lore:${local.id}`);
  assert.equal(lore?.name, land.kingdom.name);
  const inn = land.buildings.find(building => building.model === "inn")!;
  Object.assign(game.state.apostle, { x: inn.x, y: inn.y + 10, stamina: 5 });
  game.state.gold = 20;
  const merchant = game.state.merchantGold, day = game.state.day, minutes = game.state.minutes;
  assert.ok(game.interact(inn.id)?.options.some(option => option.action === `land-rest:${inn.id}`));
  game.choose(`land-rest:${inn.id}`);
  assert.equal(game.state.gold, 20 - LAND_INN_PRICE);
  assert.equal(game.state.merchantGold, merchant + LAND_INN_PRICE, "coins change hands, none vanish");
  assert.ok(game.state.day > day || game.state.minutes !== minutes);
  assert.equal(game.state.apostle.stamina, game.state.apostle.maxStamina);
  assert.ok(validateState(structuredClone(game.state)));
});

test("generated reserves are worked, saved sparsely and replenished", () => {
  const game = traveller();
  game.choose(`travel:${HIGHLAND_LANDS_PORTAL.id}`);
  const land = landForZone("terra-1");
  const node = land.resources.find(candidate => candidate.resource === "herb")!;
  assert.equal(reserveRemaining(game.state, node.id), node.capacity);
  assert.deepEqual(game.state.lands!.reserves, {}, "untouched reserves are not saved");
  Object.assign(game.state.apostle, nearestWalkable({ x: node.x, y: node.y + 30 }, { zone: "terra-1", building: false }), { stamina: 100 });
  game.state.inventory.herb = 0;
  game.choose(`start-work:${node.id}`);
  assert.equal(game.state.frontier.work?.nodeId, node.id);
  assert.ok(validateState(structuredClone(game.state)), "work in progress in a generated land is valid");
  game.tick(node.duration + 1);
  assert.ok(game.state.inventory.herb > 0);
  assert.equal(game.state.lands!.reserves[node.id].remaining, node.capacity - 1);
  game.state.lands!.reserves[node.id] = { remaining: 0, readyDay: game.state.day + 1 };
  assert.ok(validateState(structuredClone(game.state)));
  game.state.day++;
  processFrontierDay(game.state, hooks);
  assert.equal(game.state.lands!.reserves[node.id], undefined);
  assert.equal(reserveRemaining(game.state, node.id), node.capacity);
});

test("save validation guards the generated road", () => {
  const game = traveller();
  game.choose(`travel:${HIGHLAND_LANDS_PORTAL.id}`);
  const land = landForZone("terra-1");
  const node = land.resources[0];
  const valid = structuredClone(game.state);
  assert.ok(validateState(valid));
  const broken = [
    (s: typeof valid) => { s.lands!.reserves[node.id] = { remaining: node.capacity + 1, readyDay: null }; },
    (s: typeof valid) => { s.lands!.reserves["terra-1/nada-9"] = { remaining: 1, readyDay: null }; },
    (s: typeof valid) => { s.lands!.reserves["terra-5/herb-1"] = { remaining: 1, readyDay: null }; },
    (s: typeof valid) => { s.lands!.furthest = MAX_LANDS + 1; },
    (s: typeof valid) => { s.zone = "terra-4"; },
    (s: typeof valid) => { delete s.lands; },
    (s: typeof valid) => { s.lands!.discovered = ["terra-1/ruinas-falsas"]; },
    (s: typeof valid) => { s.lands!.seed = -1; },
  ];
  for (const [index, damage] of broken.entries()) {
    const copy = structuredClone(valid);
    damage(copy);
    assert.equal(validateState(copy), false, `damage ${index} is rejected`);
  }
  // A campaign that never left Auren stays valid without any lands record.
  const home = new GameStore();
  home.create({ name: "Bento", surname: "Sá", sex: "male", skin: "#d3a17b", hair: "#493327", eyes: "#7ca078", outfit: "#6d8866", blessing: "wisdom" });
  const old = structuredClone(home.state);
  delete old.lands;
  assert.ok(validateState(old), "older saves without lands still load");
});

test("portals of every land point to their neighbours", () => {
  setLandSeed(11);
  for (let index = 1; index < MAX_LANDS; index++) {
    const zone = landZone(index);
    const ahead = portalForZone(zone, `${zone}/adiante`)!;
    assert.equal(ahead.to, landZone(index + 1));
    assert.equal(portalForZone(ahead.to, `${ahead.to}/volta`)!.to, zone);
    assert.match(ahead.label, new RegExp(landHeader(index + 1).name.split(",")[0]));
  }
});

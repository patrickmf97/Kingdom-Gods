import test from "node:test";
import assert from "node:assert/strict";
import {
  findPath,
  isWalkable,
  moveWithCollisions,
  nearestWalkable,
  objectApproach,
  type Point,
} from "../src/navigation";
import { OBJECTS } from "../src/data";

const village = { zone: "village" as const, building: false };
const builtVillage = { ...village, building: true };
const interior = { zone: "orphanage" as const, building: false };

function assertClearRoute(start: Point, route: Point[]): void {
  let previous = start;
  for (const next of route) {
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
    for (let step = 0; step <= Math.ceil(distance / 3); step++) {
      const fraction = step / Math.max(1, Math.ceil(distance / 3));
      const sample = {
        x: previous.x + (next.x - previous.x) * fraction,
        y: previous.y + (next.y - previous.y) * fraction,
      };
      assert.ok(isWalkable(sample, village), `route cuts an obstacle at ${sample.x},${sample.y}`);
    }
    previous = next;
  }
}

test("authored walls block feet while the open area behind roof overhangs remains accessible", () => {
  assert.equal(isWalkable({ x: 710, y: 566 }, village), false);
  assert.equal(isWalkable({ x: 710, y: 500 }, village), true);
  assert.equal(isWalkable({ x: 1230, y: 1370 }, village), false);
  assert.equal(isWalkable({ x: 1300, y: 1390 }, village), false, "bakery oven is a solid wall");
  assert.equal(isWalkable({ x: 1180, y: 340 }, village), true, "mill sail silhouette is not a wall");
});

test("the merchant counter includes the feet radius and a dash cannot tunnel through it", () => {
  assert.equal(isWalkable({ x: 1280, y: 795 }, village), false);
  assert.equal(isWalkable({ x: 1280, y: 817 }, village), false);
  const start = { x: 1280, y: 850 };
  const end = moveWithCollisions(start, { x: 0, y: -180 }, village);
  assert.ok(end.y >= 819 && end.y < start.y);
  assert.ok(isWalkable(end, village));
});

test("diagonal movement slides along a wall without crossing its corner", () => {
  const start = { x: 1280, y: 840 };
  const end = moveWithCollisions(start, { x: 80, y: -70 }, village);
  assert.ok(end.x > start.x + 50, "horizontal travel should continue while the wall blocks vertical travel");
  assert.ok(isWalkable(end, village));
  assert.ok(end.y > 800 || end.x > 1356);
});

test("farm soil is walkable and its gate is the physical entrance through the fence", () => {
  assert.equal(isWalkable({ x: 1900, y: 810 }, village), true);
  const gate = moveWithCollisions({ x: 1890, y: 900 }, { x: 0, y: -110 }, village);
  assert.ok(gate.y < 820, "the open gate leads into the cultivated plot");
  const fence = moveWithCollisions({ x: 1830, y: 900 }, { x: 0, y: -110 }, village);
  assert.ok(fence.y > 868, "a dash cannot cross the front fence");
  assert.equal(isWalkable({ x: 1958, y: 731 }, village), false, "the shed is solid");
  assert.equal(isWalkable({ x: 1890, y: 735 }, village), false, "the rear fence is solid");
});

test("the acquired house introduces its own solid footprint without filling the farm", () => {
  assert.equal(isWalkable({ x: 2090, y: 750 }, village), true);
  assert.equal(isWalkable({ x: 2090, y: 750 }, builtVillage), false);
  assert.equal(isWalkable({ x: 1900, y: 810 }, builtVillage), true);
});

test("water remains impassable while the bridge has a safe crossing wide enough for feet", () => {
  assert.equal(isWalkable({ x: 274, y: 1304 }, village), false);
  assert.equal(isWalkable({ x: 388, y: 895 }, village), true);
  assert.equal(isWalkable({ x: 388, y: 856 }, village), false);
  const end = moveWithCollisions({ x: 520, y: 1304 }, { x: -420, y: 0 }, village);
  assert.ok(end.x > 300, "movement stops on the eastern bank instead of crossing water");
});

test("manual walking crosses both bridge ends in both directions throughout the deck", () => {
  for (const y of [875, 890, 910, 919]) {
    const west = { x: 260, y };
    const east = { x: 530, y };
    assert.ok(isWalkable(west, village));
    assert.ok(isWalkable(east, village));
    for (let x = west.x; x <= east.x; x++)
      assert.ok(isWalkable({ x, y }, village), `bridge approach has a gap at ${x},${y}`);
    const outward = moveWithCollisions(west, { x: 270, y: 0 }, village);
    const inward = moveWithCollisions(east, { x: -270, y: 0 }, village);
    assert.ok(Math.hypot(outward.x - east.x, outward.y - east.y) < 0.01, `west-to-east deck crossing is blocked at y=${y}`);
    assert.ok(Math.hypot(inward.x - west.x, inward.y - west.y) < 0.01, `east-to-west deck crossing is blocked at y=${y}`);
  }
});

test("objects and deterministic decorative trunks have feet-sized solid footprints", () => {
  assert.equal(isWalkable({ x: 1130, y: 778 }, village), false);
  assert.equal(isWalkable({ x: 590, y: 1069 }, village), false);
  assert.equal(isWalkable({ x: 1780, y: 1310 }, village), false);
  assert.equal(isWalkable({ x: 851, y: 592 }, village), false);
  assert.equal(isWalkable({ x: 820, y: 592 }, village), true, "a canopy does not have trunk-sized collision");
});

test("the crypt's exterior wall stops movement while its physical entrance stays reachable", () => {
  const stopped = moveWithCollisions({ x: 2145, y: 370 }, { x: 0, y: -120 }, village);
  assert.ok(stopped.y >= 325 && stopped.y < 370, "the exterior stone wall stops the apostle before it overlaps the facade");
  assert.equal(isWalkable({ x: 2145, y: 280 }, village), false);
  const entrance = objectApproach("dungeon", village);
  assert.ok(isWalkable(entrance, village));
  assert.ok(findPath({ x: 736, y: 648 }, entrance, village).length > 0);
});

test("both noticeboard legs block feet without blocking its front interaction approach", () => {
  assert.equal(isWalkable({ x: 1373, y: 1076 }, village), false, "the painted left leg is solid");
  assert.equal(isWalkable({ x: 1407, y: 1076 }, village), false, "the painted right leg is solid");
  assert.equal(isWalkable(objectApproach("sign", village), village), true);
});

test("the inn garden has solid horizontal fences and an accessible cultivated interior", () => {
  const inside = { x: 860, y: 1140 };
  assert.equal(isWalkable(inside, village), true);
  const north = moveWithCollisions(inside, { x: 0, y: -80 }, village);
  const south = moveWithCollisions(inside, { x: 0, y: 80 }, village);
  assert.ok(north.y >= 1123 && north.y < inside.y, "the rear garden fence cannot be crossed");
  assert.ok(south.y <= 1189 && south.y > inside.y, "the front garden fence cannot be crossed");
  const route = findPath({ x: 860, y: 1080 }, inside, village);
  assert.ok(route.length >= 2, "the open sides provide access around the fence");
  assertClearRoute({ x: 860, y: 1080 }, route);
});

test("all five evening meetings remain reachable after garden and exterior collision changes", () => {
  const starts = [{ x: 1280, y: 940 }, { x: 1580, y: 1220 }, { x: 1560, y: 790 }, { x: 2050, y: 450 }, { x: 1830, y: 1040 }];
  const meetings = [{ x: 940, y: 1180 }, { x: 1040, y: 1180 }, { x: 1140, y: 1180 }, { x: 980, y: 1280 }, { x: 1100, y: 1280 }];
  starts.forEach((start, index) => {
    const route = findPath(start, meetings[index], village);
    assert.ok(route.length > 0, `NPC ${index} can reach its meeting`);
    assertClearRoute(start, route);
    assert.deepEqual(route.at(-1), meetings[index]);
  });
});

test("walking bounds and invalid input are handled safely in every region", () => {
  assert.equal(isWalkable({ x: 69, y: 1200 }, village), false);
  assert.equal(isWalkable({ x: 72, y: 135 }, interior), true);
  assert.equal(isWalkable({ x: 72, y: 134 }, interior), false);
  assert.equal(isWalkable({ x: Number.NaN, y: 400 }, village), false);
  assert.deepEqual(moveWithCollisions({ x: 400, y: 400 }, { x: Infinity, y: 0 }, interior), { x: 400, y: 400 });
});

test("legacy saves inside newly solid walls recover nearby without trapping the player", () => {
  const restored = nearestWalkable({ x: 1280, y: 795 }, village);
  assert.ok(isWalkable(restored, village));
  assert.ok(Math.hypot(restored.x - 1280, restored.y - 795) < 80);
  const extreme = nearestWalkable({ x: -1e9, y: 1e9 }, village);
  assert.ok(isWalkable(extreme, village));
});

test("a route goes around the Casa de Mira rather than passing through its walls", () => {
  const start = { x: 1740, y: 1080 };
  const target = { x: 1500, y: 1080 };
  const route = findPath(start, target, village);
  assert.ok(route.length >= 2);
  assertClearRoute(start, route);
  assert.deepEqual(route.at(-1), target);
});

test("a route across the river uses the bridge, with no diagonal water corner cutting", () => {
  const start = { x: 200, y: 1000 };
  const target = { x: 650, y: 1000 };
  assert.ok(isWalkable(start, village));
  const route = findPath(start, target, village);
  assert.ok(route.length >= 2);
  assertClearRoute(start, route);
  assert.deepEqual(route.at(-1), target);
  assert.ok(route.some((point) => point.y < 940), "crossing the river requires travel to the bridge");
});

test("interaction anchors are reachable and path planning terminates for invalid requests", () => {
  for (const object of OBJECTS) {
    const anchor = objectApproach(object.id, builtVillage);
    assert.ok(isWalkable(anchor, builtVillage), object.id);
    assert.ok(Math.hypot(anchor.x - object.x, anchor.y - object.y) <= 110, `${object.id} remains within interaction range`);
    const start = { x: 736, y: 648 };
    const route = findPath(start, anchor, builtVillage);
    assert.ok(route.length > 0, `${object.id} can be reached from the orphanage exit`);
    let previous = start;
    for (const point of route) {
      const moved = moveWithCollisions(previous, { x: point.x - previous.x, y: point.y - previous.y }, builtVillage);
      assert.ok(Math.hypot(moved.x - point.x, moved.y - point.y) < 0.01, `${object.id} route survives swept movement`);
      previous = point;
    }
  }
  assert.deepEqual(findPath({ x: NaN, y: 700 }, { x: 1000, y: 900 }, village), []);
  assert.deepEqual(findPath({ x: 700, y: 760 }, { x: Infinity, y: 900 }, village), []);
  assert.deepEqual(findPath({ x: 400, y: 400 }, { x: 400, y: 400 }, interior), []);
});

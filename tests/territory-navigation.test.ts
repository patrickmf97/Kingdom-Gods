import test from "node:test";
import assert from "node:assert/strict";
import { ESTATE_DEFS, estateObject, estateSolid } from "../src/territory-data";
import { objectsForZone } from "../src/regions";
import {
  findPath, isWalkable, moveWithCollisions, nearestWalkable, objectApproach,
  type NavigationContext, type Point,
} from "../src/navigation";

const empty: NavigationContext = { zone: "wilderness", building: false };
const built: NavigationContext = {
  ...empty, estates: ESTATE_DEFS.map((estate) => estate.id),
};

function assertClearRoute(start: Point, route: Point[], context: NavigationContext) {
  assert.ok(route.length, "an authored destination must have a physical route");
  let from = start;
  for (const to of route) {
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 3));
    for (let step = 0; step <= count; step++) {
      const sample = {
        x: from.x + (to.x - from.x) * step / count,
        y: from.y + (to.y - from.y) * step / count,
      };
      assert.ok(isWalkable(sample, context), `route cuts solid ground at ${sample.x},${sample.y}`);
    }
    from = to;
  }
}

test("both legal plots have physical signs, cleared ground and open south approaches", () => {
  for (const estate of ESTATE_DEFS) {
    assert.deepEqual(objectsForZone("wilderness").find((object) => object.id === estate.id), estateObject(estate.id));
    for (let x = estate.x - estate.width / 2; x <= estate.x + estate.width / 2; x += 10) {
      for (let y = estate.y - estate.height; y <= estate.y + 35; y += 10)
        assert.ok(isWalkable({ x, y }, empty), `${estate.id} has a hidden trunk at ${x},${y}`);
    }
    const approach = objectApproach(estate.id, built);
    assert.ok(isWalkable(approach, built));
    assert.ok(Math.hypot(approach.x - estate.x, approach.y - estate.y) <= 120,
      "the approach must remain inside the physical interaction radius");
  }
});

test("camp, mine entrance and both plots remain connected in both directions after construction", () => {
  const landmarks = [objectApproach("wild-camp", built), objectApproach("wild-mine", built)];
  for (const estate of ESTATE_DEFS) {
    const approach = objectApproach(estate.id, built);
    for (const landmark of landmarks) {
      assertClearRoute(landmark, findPath(landmark, approach, built), built);
      assertClearRoute(approach, findPath(approach, landmark, built), built);
    }
  }
  const first = objectApproach(ESTATE_DEFS[0].id, built);
  const second = objectApproach(ESTATE_DEFS[1].id, built);
  assertClearRoute(first, findPath(first, second, built), built);
  assertClearRoute(second, findPath(second, first, built), built);
});

test("new walls block walking and long dodges while roofs and front signs stay approachable", () => {
  for (const estate of ESTATE_DEFS) {
    const solid = estateSolid(estate.id);
    const middle = { x: estate.x, y: (solid.top + solid.bottom) / 2 };
    assert.ok(isWalkable(middle, empty));
    assert.equal(isWalkable(middle, built), false);
    assert.ok(isWalkable({ x: estate.x, y: solid.top - 25 }, built),
      "roof overhang is scenery above traversable ground");
    const front = objectApproach(estate.id, built);
    const dash = moveWithCollisions(front, { x: 0, y: -300 }, built);
    assert.ok(dash.y >= solid.bottom + 9 && dash.y < front.y);
    let walk = front;
    for (let step = 0; step < 150; step++)
      walk = moveWithCollisions(walk, { x: 0, y: -2 }, built);
    assert.ok(walk.y >= solid.bottom + 9);
    const left = { x: solid.left - 30, y: middle.y };
    const crossed = moveWithCollisions(left, { x: 220, y: 0 }, built);
    assert.ok(crossed.x <= solid.left - 9);
    assert.ok(isWalkable(crossed, built));
  }
});

test("cached routes adapt when a previously empty plot gains its solid building base", () => {
  const cases = [
    { from: { x: 1100, y: 1320 }, to: { x: 1100, y: 1800 } },
    { from: { x: 1700, y: 830 }, to: { x: 1880, y: 1410 } },
  ];
  for (const { from, to } of cases) {
    assertClearRoute(from, findPath(from, to, empty), empty);
    assertClearRoute(from, findPath(from, to, built), built);
    assertClearRoute(to, findPath(to, from, built), built);
  }
  const from = objectApproach("oak-hollow", built);
  const to = objectApproach("stone-rise", built);
  assert.deepEqual(findPath(from, to, built), findPath(from, to, {
    ...built, estates: [...built.estates!].reverse(),
  }), "estate order cannot change the navigation geometry");
});

test("saved feet inside a newly constructed base recover nearby without leaving the estate", () => {
  for (const estate of ESTATE_DEFS) {
    const solid = estateSolid(estate.id);
    const inside = { x: estate.x, y: (solid.top + solid.bottom) / 2 };
    const recovered = nearestWalkable(inside, built);
    assert.ok(isWalkable(recovered, built));
    assert.ok(Math.hypot(inside.x - recovered.x, inside.y - recovered.y) < 80);
    const approach = objectApproach(estate.id, built);
    assertClearRoute(recovered, findPath(recovered, approach, built), built);
  }
});

test("estate flags never introduce wilderness building coordinates into the village or mine", () => {
  for (const zone of ["village", "mine"] as const) {
    const context = { zone, building: false };
    const withEstates = { ...context, estates: built.estates };
    for (const point of [{ x: 1100, y: 1620 }, { x: 1880, y: 1260 }, { x: 400, y: 970 }])
      assert.equal(isWalkable(point, context), isWalkable(point, withEstates));
  }
});

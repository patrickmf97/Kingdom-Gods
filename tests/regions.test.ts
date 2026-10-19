import test from "node:test";
import assert from "node:assert/strict";
import { findPath, isWalkable, moveWithCollisions, objectApproach } from "../src/navigation";
import { INTERIORS } from "../src/interiors";
import type { Point, Zone } from "../src/types";

const context = (zone: Zone) => ({ zone, building: false });

test("the open countryside uses its own large bounds rather than an interior room", () => {
  assert.ok(isWalkable({ x: 2800, y: 1800 }, context("wilderness")));
  assert.equal(isWalkable({ x: 3073, y: 1800 }, context("wilderness")), false);
});

test("mine chambers are connected ground surrounded by impassable rock", () => {
  assert.ok(isWalkable({ x: 400, y: 970 }, context("mine")), "the entrance is on ground");
  assert.equal(isWalkable({ x: 100, y: 600 }, context("mine")), false, "solid rock is not ground");
  assert.ok(findPath({ x: 400, y: 970 }, { x: 1020, y: 225 }, context("mine")).length > 0);
});

import { REGIONS, RESOURCE_NODES, objectsForZone, portalForZone, regionForZone, resourceNode } from "../src/regions";

function clearRoute(from: Point, route: Point[], zone: Zone): void {
  let previous = from;
  for (const next of route) {
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
    const count = Math.max(1, Math.ceil(distance / 3));
    for (let index = 0; index <= count; index++) {
      const fraction = index / count;
      const sample = { x: previous.x + (next.x - previous.x) * fraction, y: previous.y + (next.y - previous.y) * fraction };
      assert.ok(isWalkable(sample, context(zone)), `${zone} route crosses rock/water at ${sample.x},${sample.y}`);
    }
    const moved = moveWithCollisions(previous, { x: next.x - previous.x, y: next.y - previous.y }, context(zone));
    assert.ok(Math.hypot(moved.x - next.x, moved.y - next.y) < 0.01, "planned route survives swept movement");
    previous = next;
  }
}

test("every inter-region portal has a walkable destination and reachable physical approach", () => {
  const origins: Record<Zone, Point> = {
    village: { x: 736, y: 648 }, orphanage: { x: 400, y: 400 }, dungeon: { x: 450, y: 750 },
    wilderness: { x: 400, y: 1780 }, mine: { x: 400, y: 970 }, highlands: { x: 360, y: 1640 },
    ...Object.fromEntries(INTERIORS.map(room => [room.zone,room.spawn])),
  } as Record<Zone,Point>;
  for (const region of Object.values(REGIONS)) {
    for (const portal of region.portals) {
      assert.ok(isWalkable(portal.spawn, context(portal.to)), `${portal.id} destination is safe`);
      assert.equal(portalForZone(region.id, portal.id), portal);
      const target = objectApproach(portal.id, context(region.id));
      assert.ok(Math.hypot(target.x - portal.x, target.y - portal.y) < 110, `${portal.id} approach remains interactive`);
      const route = findPath(origins[region.id], target, context(region.id));
      assert.ok(route.length > 0, `${portal.id} can be physically reached`);
      clearRoute(origins[region.id], route, region.id);
    }
  }
});

test("each resource deposit is reachable without walking through its trunk or ore rock", () => {
  const origins = { village: { x: 736, y: 648 }, wilderness: { x: 400, y: 1780 }, mine: { x: 400, y: 970 }, highlands: { x: 360, y: 1640 } };
  assert.equal(new Set(RESOURCE_NODES.map((node) => node.id)).size, RESOURCE_NODES.length);
  for (const node of RESOURCE_NODES) {
    assert.equal(resourceNode(node.id), node);
    assert.ok(objectsForZone(node.zone).some((object) => object.id === node.id), `${node.id} is rendered in its region`);
    const origin = origins[node.zone as keyof typeof origins];
    const target = objectApproach(node.id, context(node.zone));
    assert.ok(isWalkable(target, context(node.zone)));
    assert.ok(Math.hypot(target.x - node.x, target.y - node.y) <= 90);
    const route = findPath(origin, target, context(node.zone));
    assert.ok(route.length > 0, `${node.id} has an accessible work position`);
    clearRoute(origin, route, node.zone);
  }
  assert.equal(resourceNode("missing-node"), undefined);
});

test("landmarks form a traversable open-world route while the lake and tent remain solid", () => {
  let position = { x: 400, y: 1780 };
  for (const id of ["wild-camp", "wild-ruins", "wild-lake", "wild-mine", "wild-village"]) {
    const target = objectApproach(id, context("wilderness"));
    const route = findPath(position, target, context("wilderness"));
    assert.ok(route.length > 0, `${id} has a route through the countryside`);
    clearRoute(position, route, "wilderness");
    position = target;
  }
  assert.equal(isWalkable({ x: 2460, y: 1510 }, context("wilderness")), false);
  assert.equal(isWalkable({ x: 1070, y: 1400 }, context("wilderness")), false);
  const bank = moveWithCollisions({ x: 2460, y: 1690 }, { x: 0, y: -400 }, context("wilderness"));
  assert.ok(bank.y >= 1639 && bank.y < 1690, "a dodge cannot tunnel through lake water");
});

test("mine wall edges include feet radius without introducing walls at overlapping chamber joins", () => {
  assert.equal(isWalkable({ x: 168, y: 900 }, context("mine")), false);
  assert.equal(isWalkable({ x: 169, y: 900 }, context("mine")), true);
  assert.equal(isWalkable({ x: 400, y: 830 }, context("mine")), true, "entrance-spine join stays open");
  const stopped = moveWithCollisions({ x: 200, y: 900 }, { x: -250, y: 0 }, context("mine"));
  assert.ok(stopped.x >= 169 && stopped.x < 200);
  const join = moveWithCollisions({ x: 400, y: 900 }, { x: 0, y: -300 }, context("mine"));
  assert.deepEqual(join, { x: 400, y: 600 }, "continuous corridor connects entrance to central chamber");
});

test("expanded regions support paths beyond the old village width and interior height", () => {
  const from = { x: 2800, y: 1800 };
  const to = { x: 2890, y: 2140 };
  assert.ok(isWalkable(from, context("wilderness")));
  assert.ok(isWalkable(to, context("wilderness")));
  const route = findPath(from, to, context("wilderness"));
  assert.ok(route.length > 0);
  clearRoute(from, route, "wilderness");
  assert.deepEqual(route.at(-1), to);
  assert.ok(regionForZone("mine").height > 900);
});

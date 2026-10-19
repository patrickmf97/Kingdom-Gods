import test from "node:test";
import assert from "node:assert/strict";
import { INTERIORS, furnitureRectangle } from "../src/interiors";
import { findPath, isWalkable, moveWithCollisions, objectApproach, type NavigationContext } from "../src/navigation";
import { objectsForZone, portalForZone, regionForZone } from "../src/regions";
import type { OutdoorZone, Point } from "../src/types";

function context(zone: NavigationContext["zone"]): NavigationContext {
  return { zone, building: true, estates: ["oak-hollow", "stone-rise"] };
}
function clearRoute(start: Point, target: Point, navigation: NavigationContext, message: string): void {
  assert.ok(isWalkable(start, navigation), `${message}: safe start`);
  assert.ok(isWalkable(target, navigation), `${message}: safe target`);
  const route = findPath(start, target, navigation);
  assert.ok(route.length > 0, `${message}: route exists`);
  assert.deepEqual(route.at(-1), target, `${message}: exact destination`);
  let previous = start;
  for (const next of route) {
    const distance = Math.hypot(next.x - previous.x, next.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / 3));
    for (let index = 0; index <= steps; index++) {
      const fraction = index / steps;
      const sample = { x: previous.x + (next.x - previous.x) * fraction, y: previous.y + (next.y - previous.y) * fraction };
      assert.ok(isWalkable(sample, navigation), `${message}: no obstacle crossed at ${sample.x},${sample.y}`);
    }
    const moved = moveWithCollisions(previous, { x: next.x - previous.x, y: next.y - previous.y }, navigation);
    assert.ok(Math.hypot(moved.x - next.x, moved.y - next.y) < .01, `${message}: planned movement survives collision sweep`);
    previous = next;
  }
}

test("all thirteen real interior regions connect arrival, local services and their own exit", () => {
  for (const room of INTERIORS) {
    const navigation = context(room.zone);
    assert.equal(isWalkable({ x: 72, y: 135 }, navigation), true, `${room.zone} shared room bounds`);
    for (const outside of [{ x: 71, y: 500 }, { x: 829, y: 500 }, { x: 450, y: 134 }, { x: 450, y: 801 }])
      assert.equal(isWalkable(outside, navigation), false, `${room.zone} shell cannot be crossed`);
    assert.deepEqual(regionForZone(room.zone).solids,
      room.furniture.filter(prop => prop.blocking !== false).map(furnitureRectangle));
    const exit = portalForZone(room.zone, "exit")!;
    assert.ok(exit);
    clearRoute(room.spawn, room.exit, navigation, `${room.zone} exit`);
    const exitApproach = objectApproach("exit", navigation);
    assert.ok(Math.hypot(exitApproach.x - exit.x, exitApproach.y - exit.y) <= 90);
    clearRoute(room.spawn, exitApproach, navigation, `${room.zone} exit interaction`);
    for (const station of room.stations) {
      assert.ok(objectsForZone(room.zone).some(object => object.id === station.id));
      const approach = objectApproach(station.id, navigation);
      assert.ok(Math.hypot(approach.x - station.x, approach.y - station.y) <= 90,
        `${room.zone} ${station.id} keeps a local interaction approach`);
      clearRoute(room.spawn, approach, navigation, `${room.zone} ${station.id} approach`);
      clearRoute(approach, room.exit, navigation, `${room.zone} ${station.id} return`);
    }
    if (room.zone === "orphanage")
      clearRoute(room.spawn, { x: 400, y: 290 }, navigation, "orphanage matron introduction");
  }
});

test("all exterior doors including both highland buildings are reachable and return to walkable ground", () => {
  const starts: Record<OutdoorZone, Point> = {
    village: { x: 710, y: 760 }, wilderness: { x: 400, y: 1780 }, highlands: { x: 360, y: 1640 },
  };
  for (const room of INTERIORS) {
    const navigation = context(room.entrance.zone);
    const returnPoint = portalForZone(room.zone, "exit")!.spawn;
    assert.deepEqual(returnPoint, { x: room.entrance.x, y: room.entrance.y });
    const object = objectsForZone(room.entrance.zone).find(object => object.id === room.entrance.objectId);
    assert.ok(object, `${room.zone} exterior door exists in the real region`);
    assert.ok(Math.hypot(returnPoint.x - object.x, returnPoint.y - object.y) <= 90,
      `${room.zone} returns at its own exterior door`);
    clearRoute(starts[room.entrance.zone], returnPoint, navigation, `${room.zone} exterior approach`);
    const approach = objectApproach(room.entrance.objectId, navigation);
    assert.ok(Math.hypot(approach.x - returnPoint.x, approach.y - returnPoint.y) <= 90,
      `${room.zone} door interaction stays at its physical facade`);
    clearRoute(returnPoint, approach, navigation, `${room.zone} exterior interaction`);
  }
});

test("furniture blocks movement and each physical prop has an accessible side", () => {
  for (const room of INTERIORS) {
    const navigation = context(room.zone);
    for (const furniture of room.furniture.filter(prop => prop.blocking !== false)) {
      assert.equal(isWalkable({ x: furniture.x, y: furniture.y }, navigation), false,
        `${room.zone} ${furniture.kind} has the same physical centre as its collision`);
      const area = furnitureRectangle(furniture);
      const candidates = [
        { x: furniture.x, y: area.bottom + 20 }, { x: furniture.x, y: area.top - 20 },
        { x: area.left - 20, y: furniture.y }, { x: area.right + 20, y: furniture.y },
      ];
      const approach = candidates.find(point => point.x > 82 && point.x < 818 && point.y > 145 && point.y < 790 &&
        isWalkable(point, navigation) && findPath(room.spawn, point, navigation).length > 0);
      assert.ok(approach, `${room.zone} ${furniture.kind} can be reached without crossing furniture`);
      clearRoute(room.spawn, approach, navigation, `${room.zone} ${furniture.kind} physical approach`);
    }
  }
});

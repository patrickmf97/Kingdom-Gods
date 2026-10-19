import test from "node:test";
import assert from "node:assert/strict";
import { HIGHLAND_BUILDINGS, HIGHLAND_EXIT, HIGHLAND_RESOURCE_NODES, HIGHLAND_ROADS, HIGHLANDS_REGION, WILDERNESS_HIGHLANDS_PORTAL } from "../src/highlands";
import { RESOURCE_NODES, objectsForZone, regionForZone } from "../src/regions";
import { findPath, isWalkable, moveWithCollisions, objectApproach } from "../src/navigation";
import { createFrontierState, executeFrontierAction, processFrontierDay, updateFrontierWork } from "../src/frontier";
import { initialState } from "../src/simulation";
import { ANIMAL_DEFS } from "../src/wildlife-data";
import type { ExpansionHooks, Point } from "../src/types";

const context = { zone: "highlands" as const, building: true };
const origin = WILDERNESS_HIGHLANDS_PORTAL.spawn;

function assertRoute(from: Point, to: Point): void {
  assert.ok(isWalkable(from, context), `safe origin ${from.x},${from.y}`);
  assert.ok(isWalkable(to, context), `safe destination ${to.x},${to.y}`);
  const route = findPath(from, to, context);
  assert.ok(route.length > 0, `route to ${to.x},${to.y}`);
  assert.deepEqual(route.at(-1), to);
  let previous = from;
  for (const point of route) {
    const reached = moveWithCollisions(previous, { x: point.x - previous.x, y: point.y - previous.y }, context);
    assert.ok(Math.hypot(reached.x - point.x, reached.y - point.y) < .01, "the actual controller follows the path");
    previous = point;
  }
}

test("Brumavale is a real large outdoor region reached through reciprocal physical portals", () => {
  assert.equal(regionForZone("highlands"), HIGHLANDS_REGION);
  assert.deepEqual([HIGHLANDS_REGION.width, HIGHLANDS_REGION.height], [2560, 1920]);
  assert.equal(WILDERNESS_HIGHLANDS_PORTAL.to, "highlands");
  assert.deepEqual([WILDERNESS_HIGHLANDS_PORTAL.x, WILDERNESS_HIGHLANDS_PORTAL.y], [2960, 580]);
  assert.deepEqual(origin, { x: 360, y: 1640 });
  assert.equal(HIGHLAND_EXIT.to, "wilderness");
  assert.ok(Math.hypot(HIGHLAND_EXIT.spawn.x - WILDERNESS_HIGHLANDS_PORTAL.x,
    HIGHLAND_EXIT.spawn.y - WILDERNESS_HIGHLANDS_PORTAL.y) < 220, "the return arrives beside the same physical pass");
  const wildernessContext = { zone: "wilderness" as const, building: true };
  assert.ok(isWalkable(HIGHLAND_EXIT.spawn, wildernessContext));
  const passApproach = objectApproach(WILDERNESS_HIGHLANDS_PORTAL.id, wildernessContext);
  for (const start of [{ x: 2250, y: 600 }, HIGHLAND_EXIT.spawn]) {
    const route = findPath(start, passApproach, wildernessContext);
    assert.ok(route.length > 0, "the original forest leaves a physical route to the mountain pass");
    let previous = start;
    for (const point of route) {
      const reached = moveWithCollisions(previous, { x: point.x - previous.x, y: point.y - previous.y }, wildernessContext);
      assert.ok(Math.hypot(reached.x - point.x, reached.y - point.y) < .01);
      previous = point;
    }
  }
  assertRoute(origin, objectApproach(HIGHLAND_EXIT.id, context));
  assert.ok(isWalkable({ x: 2250, y: 1750 }, context), "the eastern landscape extends beyond the small room bounds");
});

test("the new mountain pass preserves every point of the historical animal habitats", () => {
  for (const animal of ANIMAL_DEFS.filter(definition => definition.zone === "wilderness")) {
    const nearestHabitatPoint = Math.hypot(animal.homeX - WILDERNESS_HIGHLANDS_PORTAL.x,
      animal.homeY - WILDERNESS_HIGHLANDS_PORTAL.y) - animal.radius;
    assert.ok(nearestHabitatPoint >= 165, `${animal.id} keeps its full historical movement circle`);
  }
});

test("all twelve mountain reserves have stable unique identities and finite tool-based work", () => {
  assert.equal(HIGHLAND_RESOURCE_NODES.length, 12);
  assert.ok(Object.isFrozen(HIGHLAND_RESOURCE_NODES));
  const ids = new Set(RESOURCE_NODES.map(node => node.id));
  assert.equal(ids.size, RESOURCE_NODES.length);
  for (const resource of ["wood", "stone", "herb", "ore"] as const) {
    const nodes = HIGHLAND_RESOURCE_NODES.filter(node => node.resource === resource);
    assert.equal(nodes.length, 3);
    for (const node of nodes) {
      assert.ok(Object.isFrozen(node));
      assert.equal(node.zone, "highlands");
      assert.equal(node.tool, resource === "herb" ? null : resource === "wood" ? "axe" : "pickaxe");
      assert.equal(node.skill, resource === "herb" ? "herbalism" : resource === "wood" ? "woodcutting" : "mining");
      assert.ok(node.capacity > 0 && node.duration > 0 && node.stamina > 0 && node.respawnDays > 0);
      assert.equal(RESOURCE_NODES.filter(candidate => candidate.id === node.id).length, 1);
      assert.equal(objectsForZone("highlands").filter(candidate => candidate.id === node.id).length, 1);
    }
  }
});

test("the arrival, both new building doors, trails, every work point and the exit remain connected", () => {
  for (const building of HIGHLAND_BUILDINGS) {
    assertRoute(origin, objectApproach(building.id, context));
    assert.equal(isWalkable({ x: building.x, y: building.footprint.bottom - 20 }, context), false);
  }
  for (const road of HIGHLAND_ROADS) for (let index = 1; index < road.length; index++) {
    const a = road[index - 1], b = road[index], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12);
    for (let step = 0; step <= steps; step++) assert.ok(isWalkable({ x: a.x + (b.x - a.x) * step / steps,
      y: a.y + (b.y - a.y) * step / steps }, context), "the painted trail stays clear");
  }
  for (const node of HIGHLAND_RESOURCE_NODES) {
    const approach = objectApproach(node.id, context);
    assert.ok(Math.hypot(approach.x - node.x, approach.y - node.y) < 90, node.id);
    assertRoute(origin, approach);
    assertRoute(approach, objectApproach(HIGHLAND_EXIT.id, context));
    if (node.resource !== "herb") assert.equal(isWalkable({ x: node.x, y: node.y - 12 }, context), false);
  }
});

test("new resources enforce their real tools, deplete independently and regenerate on the calendar", () => {
  const hooks: ExpansionHooks = { message() {}, remember() {}, practice() {}, nearObject: () => false, nearNpc: () => false };
  for (const node of HIGHLAND_RESOURCE_NODES) {
    const state = initialState(); state.phase = "playing"; state.zone = "highlands";
    state.frontier = createFrontierState(state.day);
    Object.assign(state.apostle, objectApproach(node.id, context));
    if (node.tool) {
      executeFrontierAction(state, `start-work:${node.id}`, hooks);
      assert.equal(state.frontier.work, null, "a mountain deposit cannot bypass tool ownership");
      state.frontier.tools[node.tool] = { owned: true, durability: 100 };
    }
    const sibling = HIGHLAND_RESOURCE_NODES.find(candidate => candidate.resource === node.resource && candidate.id !== node.id)!;
    for (let charge = 0; charge < node.capacity; charge++) {
      state.apostle.stamina = 100;
      state.inventory[node.resource] = 0;
      executeFrontierAction(state, `start-work:${node.id}`, hooks);
      assert.equal(state.frontier.work?.nodeId, node.id);
      updateFrontierWork(state, node.duration - .1, hooks);
      assert.equal(state.inventory[node.resource], 0);
      updateFrontierWork(state, .1, hooks);
      assert.equal(state.inventory[node.resource], node.yield);
    }
    assert.equal(state.frontier.resources[node.id].remaining, 0);
    assert.equal(state.frontier.resources[sibling.id].remaining, sibling.capacity);
    state.day += node.respawnDays - 1; processFrontierDay(state, hooks);
    assert.equal(state.frontier.resources[node.id].remaining, 0);
    state.day++; processFrontierDay(state, hooks);
    assert.deepEqual(state.frontier.resources[node.id], { remaining: node.capacity, readyDay: null });
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import * as regions from "../src/regions";
import { villageDecor } from "../src/art";
import { ESTATE_DEFS } from "../src/territory-data";
import { findPath, isWalkable, moveWithCollisions, objectApproach } from "../src/navigation";
import { createFrontierState, executeFrontierAction, processFrontierDay, updateFrontierWork } from "../src/frontier";
import type { ExpansionHooks, Point, ResourceNodeDefinition, Zone } from "../src/types";

const originalIds = ["tree1", "herb1", "stone1", "wild-oak", "wild-herbs", "wild-stone", "mine-iron-west", "mine-iron-east", "mine-iron-deep", "mine-stone"];
const outdoorZones = ["village", "wilderness"] as const;
const addedNodes = () => regions.RESOURCE_NODES.filter(node => !originalIds.includes(node.id));

test("outdoor maps have separate, named wood, stone and herb deposits across the landscape", () => {
  assert.equal(regions.RESOURCE_NODES.length, 55);
  assert.equal(new Set(regions.RESOURCE_NODES.map(node => node.id)).size, 55);
  for (const zone of outdoorZones) {
    for (const resource of ["wood", "stone", "herb"]) {
      const nodes = regions.RESOURCE_NODES.filter(node => node.zone === zone && node.resource === resource);
      assert.equal(nodes.length, zone === "village" ? 5 : 12, `${zone} ${resource}`);
      assert.equal(new Set(nodes.map(node => node.label)).size, nodes.length, "each place has a distinguishable name");
      assert.ok(Math.max(...nodes.map(node => node.x)) - Math.min(...nodes.map(node => node.x)) > 900);
      assert.ok(Math.max(...nodes.map(node => node.y)) - Math.min(...nodes.map(node => node.y)) > 900);
    }
    const nodes = regions.RESOURCE_NODES.filter(node => node.zone === zone);
    for (const node of nodes) {
      assert.equal(regions.objectsForZone(zone).filter(object => object.id === node.id).length, 1, `${node.id} is rendered once`);
      for (const other of nodes) if (other !== node)
        assert.ok(Math.hypot(node.x - other.x, node.y - other.y) >= 100, `${node.id} overlaps ${other.id}`);
    }
  }
});

test("migration catalog preserves all ten original finite resource definitions immutably", () => {
  const legacy = (regions as unknown as { LEGACY_RESOURCE_NODES?: readonly ResourceNodeDefinition[] }).LEGACY_RESOURCE_NODES;
  assert.ok(legacy, "the original catalog is available to historical save validators");
  assert.ok(Object.isFrozen(legacy));
  assert.deepEqual(legacy.map(node => node.id), originalIds);
  const signatures = legacy.map(node => [node.id, node.zone, node.kind, node.x, node.y, node.label, node.resource, node.tool,
    node.duration, node.stamina, node.yield, node.capacity, node.respawnDays, node.skill]);
  assert.deepEqual(signatures, [
    ["tree1", "village", "resource", 590, 1080, "Ramos caídos do carvalho", "wood", null, 2, 4, 2, 4, 2, "woodcutting"],
    ["herb1", "village", "herb", 1800, 440, "Ervas medicinais", "herb", null, 2, 4, 2, 5, 2, "herbalism"],
    ["stone1", "village", "stone", 1780, 1320, "Pedras soltas do caminho", "stone", null, 2, 4, 2, 5, 2, "mining"],
    ["wild-oak", "wilderness", "resource", 760, 1260, "Carvalho da clareira", "wood", "axe", 3, 6, 3, 4, 2, "woodcutting"],
    ["wild-herbs", "wilderness", "herb", 1370, 700, "Ervas do vale", "herb", null, 2, 4, 2, 5, 2, "herbalism"],
    ["wild-stone", "wilderness", "stone", 2030, 1090, "Afloramento de pedra", "stone", "pickaxe", 3, 6, 3, 5, 2, "mining"],
    ["mine-iron-west", "mine", "ore", 270, 250, "Veio de ferro · galeria oeste", "ore", "pickaxe", 4, 8, 2, 4, 3, "mining"],
    ["mine-iron-east", "mine", "ore", 1040, 490, "Veio de ferro · galeria leste", "ore", "pickaxe", 4, 8, 2, 4, 3, "mining"],
    ["mine-iron-deep", "mine", "ore", 1020, 225, "Veio de ferro · galeria profunda", "ore", "pickaxe", 4, 8, 2, 4, 3, "mining"],
    ["mine-stone", "mine", "stone", 960, 930, "Pedra da galeria inferior", "stone", "pickaxe", 3, 6, 3, 5, 2, "mining"],
  ]);
  for (const node of legacy) {
    assert.ok(Object.isFrozen(node));
    assert.deepEqual(regions.resourceNode(node.id), node);
  }
});

test("new wilderness deposits leave roads, registered plots and landmark entrances clear", () => {
  for (const node of addedNodes().filter(node => node.zone === "wilderness")) {
    for (const road of regions.WILDERNESS_ROADS) {
      for (let index = 1; index < road.length; index++) {
        const a = road[index - 1], b = road[index];
        const dx = b.x - a.x, dy = b.y - a.y;
        const fraction = Math.max(0, Math.min(1, ((node.x - a.x) * dx + (node.y - a.y) * dy) / (dx * dx + dy * dy)));
        assert.ok(Math.hypot(node.x - a.x - fraction * dx, node.y - a.y - fraction * dy) >= 90, `${node.id} occupies a painted road`);
      }
    }
    for (const estate of ESTATE_DEFS) {
      assert.ok(node.x < estate.x - estate.width / 2 - 75 || node.x > estate.x + estate.width / 2 + 75 ||
        node.y < estate.y - estate.height - 40 || node.y > estate.y + 180, `${node.id} occupies ${estate.id} or its entrance`);
    }
    for (const portal of regions.REGIONS.wilderness.portals)
      assert.ok(Math.hypot(node.x - portal.x, node.y - portal.y) > 150, `${node.id} blocks ${portal.id}`);
  }
});

function assertRoute(from: Point, to: Point, zone: Zone, building: boolean): void {
  const context = { zone, building, estates: ["oak-hollow", "stone-rise"] as ("oak-hollow" | "stone-rise")[] };
  assert.ok(isWalkable(from, context));
  const route = findPath(from, to, context);
  assert.ok(route.length > 0, `a route from ${from.x},${from.y} to ${to.x},${to.y} exists`);
  assert.deepEqual(route.at(-1), to);
  let previous = from;
  for (const point of route) {
    const moved = moveWithCollisions(previous, { x: point.x - previous.x, y: point.y - previous.y }, context);
    assert.ok(Math.hypot(moved.x - point.x, moved.y - point.y) < 0.01, "the actual movement system follows the route");
    previous = point;
  }
}

test("every deposit can be worked from every regional entry with all acquired buildings present", () => {
  const entries = {
    village: [{ x: 710, y: 760 }, { x: 2170, y: 1580 }, { x: 2110, y: 470 }],
    wilderness: [{ x: 400, y: 1780 }, { x: 2250, y: 600 }],
    mine: [{ x: 400, y: 970 }],
  };
  for (const node of regions.RESOURCE_NODES) {
    const context = { zone: node.zone, building: true, estates: ["oak-hollow", "stone-rise"] as ("oak-hollow" | "stone-rise")[] };
    const approach = objectApproach(node.id, context);
    assert.ok(isWalkable(approach, context), `${node.id} has safe working ground`);
    assert.ok(Math.hypot(node.x - approach.x, node.y - approach.y) < 90, `${node.id} is within working reach`);
    for (const entry of entries[node.zone as keyof typeof entries]) assertRoute(entry, approach, node.zone, true);
    if (node.kind !== "herb") assert.equal(isWalkable({ x: node.x, y: node.y - 12 }, context), false, `${node.id} has a solid trunk or rock`);
  }
});

test("new gathering clearings remove nearby decorative trunks without shifting the old forest", () => {
  assert.notEqual(regions.REGIONS.village.decor, villageDecor, "the shared artwork catalog is not mutated");
  for (const node of addedNodes()) {
    for (const item of regions.REGIONS[node.zone].decor)
      assert.ok(Math.hypot(item.x - node.x, item.y - node.y) >= 55, `${node.id} shares a position with a decorative trunk`);
  }
  for (const original of [
    { x: 126, y: 183, key: "pine", scale: 1.0011420922121033 },
    { x: 2790, y: 284, key: "pine", scale: 0.8752030950738117 },
    { x: 371, y: 1102, key: "tree1", scale: 1.1945581880630924 },
    { x: 1411, y: 1457, key: "tree1", scale: 0.9113075441215187 },
    { x: 2320, y: 1846, key: "tree2", scale: 1.188349884469062 },
  ]) assert.ok(regions.REGIONS.wilderness.decor.some(item => JSON.stringify(item) === JSON.stringify(original)), `original forest tree at ${original.x},${original.y} is unchanged`);
  assert.ok(regions.REGIONS.wilderness.decor.length > 150, "resource clearings retain a substantial forest");
});

test("each added deposit uses real timed work, finite charges and calendar regeneration", async () => {
  assert.equal(addedNodes().length, 45);
  const { initialState } = await import("../src/simulation");
  for (const node of addedNodes()) {
    const state = initialState();
    state.phase = "playing";
    state.zone = node.zone;
    state.frontier = createFrontierState(state.day);
    const hooks: ExpansionHooks = { message: () => {}, remember: () => {}, practice: () => {}, nearObject: () => false, nearNpc: () => false };
    Object.assign(state.apostle, objectApproach(node.id, { zone: node.zone, building: false }));
    assert.equal(node.tool, node.resource === "herb" ? null : node.resource === "wood" ? "axe" : "pickaxe");
    const peer = regions.resourceNode(node.resource === "wood" ? "wild-oak" : node.resource === "stone" ? "wild-stone" : "wild-herbs")!;
    assert.deepEqual([node.duration, node.stamina, node.yield, node.capacity, node.respawnDays],
      [peer.duration, peer.stamina, peer.yield, peer.capacity, peer.respawnDays], "additional deposits preserve the existing work balance");
    if (node.tool) {
      executeFrontierAction(state, `start-work:${node.id}`, hooks);
      assert.equal(state.frontier.work, null, `${node.id} requires its real tool`);
      state.frontier.tools[node.tool] = { owned: true, durability: 100 };
    }
    const sibling = regions.RESOURCE_NODES.find(other => other.zone === node.zone && other.resource === node.resource && other.id !== node.id)!;
    for (let charge = 0; charge < node.capacity; charge++) {
      state.apostle.stamina = 100;
      state.inventory[node.resource] = 0;
      executeFrontierAction(state, `start-work:${node.id}`, hooks);
      assert.equal(state.frontier.work?.nodeId, node.id);
      assert.equal(state.apostle.stamina, 100 - node.stamina);
      updateFrontierWork(state, node.duration - 0.1, hooks);
      assert.equal(state.inventory[node.resource], 0, "resources do not arrive before work finishes");
      updateFrontierWork(state, 0.1, hooks);
      assert.equal(state.inventory[node.resource], node.yield);
      if (node.tool) assert.equal(state.frontier.tools[node.tool].durability, 100 - 3 * (charge + 1));
      assert.equal(state.frontier.resources[sibling.id].remaining, sibling.capacity, "charges belong to this deposit alone");
    }
    assert.equal(state.frontier.resources[node.id].remaining, 0);
    const readyDay = state.day + node.respawnDays;
    assert.equal(state.frontier.resources[node.id].readyDay, readyDay);
    executeFrontierAction(state, `start-work:${node.id}`, hooks);
    assert.equal(state.frontier.work, null);
    state.day = readyDay - 1;
    processFrontierDay(state, hooks);
    assert.equal(state.frontier.resources[node.id].remaining, 0);
    state.day = readyDay;
    processFrontierDay(state, hooks);
    assert.deepEqual(state.frontier.resources[node.id], { remaining: node.capacity, readyDay: null });
  }
});

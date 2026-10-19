import test from "node:test";
import assert from "node:assert/strict";
import {
  INTERIORS, entranceForObject, furnitureRectangle, interiorAllowed, interiorForZone, interiorRegion,
} from "../src/interiors";
import type { GameState, InteriorZone, Point } from "../src/types";
import { OBJECTS } from "../src/data";
import { estateObject } from "../src/territory-data";

const zones: InteriorZone[] = ["orphanage", "inn-room", "forge-room", "mill-room", "bakery-room", "mira-room",
  "farm-store-room", "farmhouse-room", "oak-room", "stone-room", "camp-room", "ranger-room", "chapel-room"];
const inside = (point: Point, area: ReturnType<typeof furnitureRectangle>, radius = 9): boolean => {
  const x = Math.max(area.left, Math.min(area.right, point.x));
  const y = Math.max(area.top, Math.min(area.bottom, point.y));
  return Math.hypot(point.x - x, point.y - y) < radius;
};
function allowedState(): GameState {
  return { property: { owned: false, building: false }, territory: { parcels: {
    "oak-hollow": { owned: false, building: "none" },
    "stone-rise": { owned: false, building: "none" },
  } } } as GameState;
}

test("all thirteen authored interiors keep stable doors, dimensions and shared collision furniture", () => {
  assert.deepEqual(INTERIORS.map(room => room.zone).sort(), [...zones].sort());
  assert.equal(new Set(INTERIORS.map(room => `${room.entrance.zone}:${room.entrance.objectId}`)).size, 13);
  for (const room of INTERIORS) {
    assert.equal(interiorForZone(room.zone), room);
    assert.equal(entranceForObject(room.entrance.zone, room.entrance.objectId), room);
    assert.equal(entranceForObject(room.zone, room.entrance.objectId), undefined);
    assert.deepEqual(room.spawn, { x: 450, y: 730 });
    assert.deepEqual(room.exit, { x: 450, y: 790 });
    const region = interiorRegion(room);
    assert.equal(region.id, room.zone);
    assert.equal(region.width, 900);
    assert.equal(region.height, 900);
    assert.deepEqual(region.objects, [...room.stations, ...region.portals]);
    assert.deepEqual(region.solids, room.furniture.filter(prop => prop.blocking !== false).map(furnitureRectangle));
    assert.equal(region.portals[0].id, "exit");
    assert.deepEqual(region.portals[0].spawn, { x: room.entrance.x, y: room.entrance.y });
    assert.equal(region.portals[0].to, room.entrance.zone);
    assert.ok(room.furniture.length >= 15 && room.furniture.length <= 24, `${room.zone} has a bounded detailed layout`);
    for (const prop of room.furniture) {
      assert.ok([prop.x, prop.y, prop.w, prop.d, prop.rotation ?? 0].every(Number.isFinite));
      assert.ok(prop.w > 0 && prop.d > 0);
      const area = furnitureRectangle(prop);
      assert.ok(area.left >= 72 && area.right <= 828 && area.top >= 135 && area.bottom <= 800,
        `${room.zone} ${prop.kind} stays within its authored room`);
    }
  }
  assert.equal(interiorForZone("mine"), undefined);
  assert.equal(interiorForZone("highlands"), undefined);
  assert.equal(entranceForObject("village", "well"), undefined);
  assert.equal(entranceForObject("village", "property"), undefined, "the farm gate is not a room door");
});

test("arrival, exit, centre aisle, station approaches and the matron's intro position stay clear", () => {
  for (const room of INTERIORS) {
    const solids = interiorRegion(room).solids;
    const reservations = [room.spawn, room.exit,
      ...Array.from({ length: 53 }, (_, index) => ({ x: 450, y: 270 + index * 10 })),
      ...room.stations.flatMap(station => [{ x: station.x, y: station.y }, { x: station.x, y: station.y + 28 }]),
    ];
    if (room.zone === "orphanage") reservations.push({ x: 400, y: 290 });
    for (const point of reservations)
      assert.equal(solids.some(solid => inside(point, solid)), false,
        `${room.zone} leaves a feet-wide approach at ${point.x},${point.y}`);
  }
});

test("legacy service IDs remain local to detailed rooms and new mountain rooms have their own services", () => {
  const services = new Set(INTERIORS.flatMap(room => room.stations.map(station => station.id)));
  for (const id of ["market", "inn", "forge", "mill", "bakery", "property", "wild-camp", "oak-hollow", "stone-rise"])
    assert.ok(services.has(id), `${id} keeps its existing service identity`);
  assert.equal(interiorForZone("inn-room")!.stations.find(station => station.id === "market")!.kind, "market");
  assert.equal(interiorForZone("farmhouse-room")!.entrance.objectId, "farmhouse");
  assert.deepEqual(interiorForZone("farmhouse-room")!.entrance, { zone: "village", objectId: "farmhouse", x: 2090, y: 815 });
  assert.equal(interiorForZone("ranger-room")!.entrance.objectId, "highland-ranger-lodge");
  assert.equal(interiorForZone("chapel-room")!.entrance.objectId, "highland-chapel");
});

test("owned rooms require actual property and completed estate construction", () => {
  const state = allowedState();
  const farmStore = interiorForZone("farm-store-room")!;
  const farmhouse = interiorForZone("farmhouse-room")!;
  const oak = interiorForZone("oak-room")!;
  const stone = interiorForZone("stone-room")!;
  assert.equal(interiorAllowed(state, farmStore), false);
  assert.equal(interiorAllowed(state, farmhouse), false);
  assert.equal(interiorAllowed(state, oak), false);
  assert.equal(interiorAllowed(state, stone), false);
  for (const room of INTERIORS.filter(room => ![farmStore, farmhouse, oak, stone].includes(room)))
    assert.equal(interiorAllowed(state, room), true, `${room.zone} is publicly accessible`);
  state.property.building = true;
  assert.equal(interiorAllowed(state, farmhouse), false, "a stale building flag cannot grant ownership");
  state.property.owned = true;
  assert.equal(interiorAllowed(state, farmStore), true);
  assert.equal(interiorAllowed(state, farmhouse), true);
  state.property.building = false;
  assert.equal(interiorAllowed(state, farmhouse), false);
  for (const [id, room] of [["oak-hollow", oak], ["stone-rise", stone]] as const) {
    state.territory.parcels[id].owned = true;
    assert.equal(interiorAllowed(state, room), false, "unbuilt land has no interior");
    for (const building of ["shelter", "warehouse"] as const) {
      state.territory.parcels[id].building = building;
      assert.equal(interiorAllowed(state, room), true);
    }
    state.territory.parcels[id].owned = false;
    assert.equal(interiorAllowed(state, room), false);
  }
});

test("rotated furniture keeps the exact shared collision envelope", () => {
  const area = furnitureRectangle({ kind: "bench", x: 300, y: 400, w: 100, d: 40, rotation: Math.PI / 2 });
  assert.ok(Math.abs(area.left - 280) < 1e-10);
  assert.ok(Math.abs(area.right - 320) < 1e-10);
  assert.ok(Math.abs(area.top - 350) < 1e-10);
  assert.ok(Math.abs(area.bottom - 450) < 1e-10);
});


test("door returns remain at the visible facade and within the legacy interaction distance", () => {
  for (const room of INTERIORS) {
    const id = room.entrance.objectId;
    const original = id === "oak-hollow" || id === "stone-rise" ? estateObject(id)
      : id === "wild-camp" ? { x: 1100, y: 1450 }
      : OBJECTS.find(object => object.id === id);
    if (!original) continue;
    assert.ok(Math.hypot(room.entrance.x - original.x, room.entrance.y - original.y) <= 90,
      `${room.zone} uses its own physical door instead of a remote village return`);
  }
  assert.equal(entranceForObject("village", "farm-store")!.zone, "farm-store-room");
  assert.notDeepEqual(interiorForZone("farm-store-room")!.entrance, interiorForZone("farmhouse-room")!.entrance);
});

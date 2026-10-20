import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isWalkable, moveWithCollisions, objectApproach } from "../src/navigation";
import { regionForZone, WILDERNESS_ROADS } from "../src/regions";
import { VILLAGE_LANDSCAPE_PATHS } from "../src/three/vegetation";
import { HIGHLAND_ROADS } from "../src/highlands";
import { ESTATE_DEFS } from "../src/territory-data";
import { ANIMAL_DEFS } from "../src/wildlife-data";
import { isAnimalHabitatPoint } from "../src/wildlife";

for (const [zone, roads] of [["village", VILLAGE_LANDSCAPE_PATHS], ["wilderness", WILDERNESS_ROADS], ["highlands", HIGHLAND_ROADS]] as const) {
  test(`${zone} every painted road supports continuous feet movement with all buildings present`, () => {
    const context = { zone, building: true, estates: ESTATE_DEFS.map(estate => estate.id) };
    for (const [route, road] of roads.entries()) for (let segment = 1; segment < road.length; segment++) {
      const a = road[segment - 1], b = road[segment];
      const count = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
      let previous = a;
      for (let i = 0; i <= count; i++) {
        const point = { x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count };
        assert.ok(isWalkable(point, context), `road ${route} segment ${segment} blocked at ${point.x},${point.y}`);
        const moved = moveWithCollisions(previous, { x: point.x - previous.x, y: point.y - previous.y }, context);
        assert.ok(Math.hypot(moved.x - point.x, moved.y - point.y) < .001, "swept feet must follow the painted centerline");
        previous = point;
      }
    }
  });
}

test("lake frees historical rectangular corners while protecting the south interaction", () => {
  const context = { zone: "wilderness" as const, building: true };
  for (const point of [{ x: 2290, y: 1440 }, { x: 2630, y: 1620 }]) assert.ok(isWalkable(point, context), JSON.stringify(point));
  assert.equal(isWalkable({ x: 2460, y: 1530 }, context), false);
  assert.deepEqual(objectApproach("wild-lake", context), { x: 2460, y: 1678 });
});

test("historical forest coordinates, scales and animal habitat domain remain unchanged", () => {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  assert.equal(hash(JSON.stringify(regionForZone("wilderness").decor)), "7c1e1f6c49d2b2b1998618f3546adbdd1ce21f814e63a02f999302437f8b8474");
  const habitat = createHash("sha256");
  for (const d of ANIMAL_DEFS) for (let y = d.homeY - d.radius; y <= d.homeY + d.radius; y += 13) for (let x = d.homeX - d.radius; x <= d.homeX + d.radius; x += 13) habitat.update(isAnimalHabitatPoint(d, { x, y }) ? "1" : "0");
  assert.equal(habitat.digest("hex"), "a9070158bd1d467c2d13e820e08a94c10b06a2d6f626f145ead89348de00c5ee");
});

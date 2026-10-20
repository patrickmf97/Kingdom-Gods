import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createRegionEnvironment } from "../src/three/environment";
import { initialState } from "../src/simulation";
import { isWalkable, moveWithCollisions } from "../src/navigation";
import { LAKE_OUTLINE, lakeEdgeDistance, pointInPolygon, lakeContainsFeet, shorelinePoint } from "../src/water";
import { RegionVegetation } from "../src/three/vegetation";

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const values: THREE.Mesh[] = []; root.traverse(object => { if (object instanceof THREE.Mesh) values.push(object); }); return values;
}
test("natural lake geometry uses precisely the shared shoreline and owns a bounded animated material", () => {
  const state = initialState(), before = JSON.stringify(state), environment = createRegionEnvironment("wilderness", state);
  const water = environment.group.getObjectByName("natural-lake-water") as THREE.Mesh;
  assert.ok(water, "replace the rectangular lake with a triangulated shared polygon");
  const vertices = water.geometry.getAttribute("position");
  const points = new Set(Array.from({ length: vertices.count }, (_, i) => `${Math.round(vertices.getX(i) * 24)},${Math.round(vertices.getZ(i) * 24)}`));
  for (const p of LAKE_OUTLINE) assert.ok(points.has(`${p.x},${p.y}`));
  for (let i = 0; i < vertices.count; i++) assert.ok(vertices.getX(i) * 24 >= 2279.999 && vertices.getX(i) * 24 <= 2640.001 && vertices.getZ(i) * 24 >= 1429.999 && vertices.getZ(i) * 24 <= 1630.001);
  assert.ok(environment.group.getObjectByName("natural-lake-bank"));
  const material = water.material as THREE.MeshStandardMaterial;
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  assert.ok(shader.uniforms.uWaterTime, "ripples animate inside the existing draw, without moving shore vertices");
  const positions = vertices.array.slice();
  environment.update(state, 27); assert.equal(shader.uniforms.uWaterTime.value, 27);
  environment.update(state, 27); assert.equal(shader.uniforms.uWaterTime.value, 27);
  environment.update(state, Number.NaN); assert.equal(shader.uniforms.uWaterTime.value, 27);
  assert.ok(material.emissive.toArray().every(Number.isFinite), "invalid presentation clocks cannot poison water highlights");
  assert.deepEqual(vertices.array, positions);
  assert.equal(JSON.stringify(state), before);
  const ray = new THREE.Raycaster(new THREE.Vector3(2460 / 24, 2, 1530 / 24), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(water).length, 0);
  let disposals = 0; material.addEventListener("dispose", () => disposals++);
  environment.dispose(); environment.dispose(); assert.equal(disposals, 1);
});

test("shared shoreline includes exactly nine pixels of feet clearance and stops swept dashes", () => {
  for (let i = 0; i < LAKE_OUTLINE.length; i++) {
    const a = LAKE_OUTLINE[i], b = LAKE_OUTLINE[(i + 1) % LAKE_OUTLINE.length], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const close = { x: p.x + dy / length * 8.9, y: p.y - dx / length * 8.9 };
    const dry = { x: p.x + dy / length * 10, y: p.y - dx / length * 10 };
    assert.equal(lakeContainsFeet(close), true); assert.equal(lakeContainsFeet(dry), false);
    assert.equal(isWalkable(close, { zone: "wilderness", building: false }), false);
  }
  const end = moveWithCollisions({ x: 2200, y: 1530 }, { x: 500, y: 0 }, { zone: "wilderness", building: false });
  assert.ok(end.x < 2280 && !lakeContainsFeet(end));
  for (let i = 0; i < 100; i++) { const p = shorelinePoint(i / 100, 30); assert.equal(pointInPolygon(p, LAKE_OUTLINE), false); assert.ok(lakeEdgeDistance(p) > 20); }
});

test("reeds follow the polygon while keeping the historical lake approach dry and clear", () => {
  const vegetation = new RegionVegetation("wilderness"), reeds = vegetation.group.getObjectByName("meadow-reeds") as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4(); assert.ok(reeds.count >= 50);
  for (let i = 0; i < reeds.count; i++) {
    reeds.getMatrixAt(i, matrix); const point = { x: matrix.elements[12] * 24, y: matrix.elements[14] * 24 };
    assert.equal(pointInPolygon(point, LAKE_OUTLINE), false);
    assert.ok(lakeEdgeDistance(point) < 49 && lakeEdgeDistance(point) > reeds.userData.footprintRadius + 9);
  }
  vegetation.dispose();
});

test("painted ribbons taper clear of walls and trunks along every outdoor road", () => {
  for (const zone of ["village", "wilderness"] as const) {
    const environment = createRegionEnvironment(zone, initialState());
    const roads = meshes(environment.group).filter(mesh => mesh.userData.paintedRoad);
    assert.equal(roads.length, 2);
    for (const road of roads) {
      const position = road.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) assert.ok(isWalkable({ x: Math.round(position.getX(i) * 24000) / 1000, y: Math.round(position.getZ(i) * 24000) / 1000 }, { zone, building: true }), `road edge cannot run through physical props ${position.getX(i) * 24},${position.getZ(i) * 24}`);
    }
    environment.dispose();
  }
});

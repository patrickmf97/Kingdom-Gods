import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createRegionEnvironment } from "../src/three/environment";
import { RegionVegetation, VILLAGE_LANDSCAPE_PATHS } from "../src/three/vegetation";
import { regionForZone, RESOURCE_NODES, WILDERNESS_ROADS } from "../src/regions";
import { initialState } from "../src/simulation";
import { ESTATE_DEFS } from "../src/territory-data";
import type { Point } from "../src/types";

function batches(root: THREE.Object3D): THREE.InstancedMesh[] {
  const result: THREE.InstancedMesh[] = [];
  root.traverse(object => { if (object instanceof THREE.InstancedMesh) result.push(object); });
  return result;
}
function distance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

for (const zone of ["village", "wilderness"] as const) {
  test(`${zone} enriches every existing tree without changing any physical trunk or resource`, () => {
    const state = initialState(), before = JSON.stringify(state);
    const environment = createRegionEnvironment(zone, state);
    const vegetation = environment.group.getObjectByName("living-vegetation");
    assert.ok(vegetation, "outside worlds need the richer landscape layer");
    const trunks = vegetation.getObjectByName("forest-trunks") as THREE.InstancedMesh;
    const decor = regionForZone(zone).decor;
    assert.equal(trunks.count, decor.length);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
    for (let i = 0; i < decor.length; i++) {
      trunks.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
      const tree = decor[i], size = tree.scale ?? 1;
      assert.ok(Math.abs(position.x * 24 - tree.x - size) < .001);
      assert.ok(Math.abs(position.z * 24 - tree.y + 12 * size) < .001);
      assert.ok(Math.abs(scale.x * 24 - 7 * size) < .001);
      assert.ok(Math.abs(position.y - scale.y / 2) < .00001, "trunks stay planted on the ground");
    }
    for (const node of RESOURCE_NODES.filter(node => node.zone === zone)) {
      assert.ok(environment.group.getObjectByName(`${node.id}-available`));
      assert.ok(environment.group.getObjectByName(`${node.id}-depleted`));
    }
    assert.equal(JSON.stringify(state), before, "landscape presentation cannot mutate saved simulation");
    environment.dispose();
  });

  test(`${zone} plants readable ground cover while preserving paths, work fronts and future property`, () => {
    const vegetation = new RegionVegetation(zone);
    const ground = batches(vegetation.group).filter(batch => batch.name.startsWith("meadow-"));
    assert.equal(ground.length, 5);
    const region = regionForZone(zone), paths = zone === "village" ? VILLAGE_LANDSCAPE_PATHS : WILDERNESS_ROADS;
    const matrix = new THREE.Matrix4();
    for (const batch of ground) {
      assert.ok(batch.count >= 50 && batch.count <= batch.userData.instanceBudget, `${batch.name} needs visible coverage with a fixed budget`);
      const geometry = batch.geometry;
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      assert.ok(bounds.max.y > .15 && bounds.min.y >= -.001, "plants rise from their roots rather than a flat decal");
      for (let i = 0; i < batch.count; i++) {
        batch.getMatrixAt(i, matrix);
        const x = matrix.elements[12] * 24, y = matrix.elements[14] * 24;
        const point = { x, y }, radius = batch.userData.footprintRadius as number;
        for (const path of paths) for (let segment = 1; segment < path.length; segment++) {
          assert.ok(distance(point, path[segment - 1], path[segment]) >= (zone === "village" ? 32 : 44) + radius,
            `${batch.name} ${i} cannot grow across the painted road`);
        }
        for (const object of region.objects) {
          assert.ok(Math.hypot(x - object.x, y - object.y - 23) >= 57 + radius,
            `${batch.name} ${i} must leave ${object.id}'s work and conversation front clear`);
        }
        if (zone === "wilderness") for (const estate of ESTATE_DEFS) {
          const overlaps = x > estate.x - estate.width / 2 - radius && x < estate.x + estate.width / 2 + radius &&
            y > estate.y - estate.height - radius && y < estate.y + 115 + radius;
          assert.equal(overlaps, false, `${batch.name} ${i} occupies future inherited property`);
        }
      }
    }
    assert.ok(batches(vegetation.group).length <= 12, "forests and meadows share a bounded draw budget");
    vegetation.dispose();
  });
}

test("wind advances only its uniform, leaving planted transforms and saved state untouched", () => {
  const vegetation = new RegionVegetation("village");
  const plants = batches(vegetation.group);
  const matrices = plants.map(batch => batch.instanceMatrix.array.slice());
  const windMaterials = plants.map(batch => batch.material).filter(material => material instanceof THREE.MeshStandardMaterial && material.userData.landscapeWind) as THREE.MeshStandardMaterial[];
  assert.ok(windMaterials.length >= 5);
  for (const batch of plants) {
    const material = batch.material as THREE.MeshStandardMaterial;
    if (!material.userData.landscapeWind) continue;
    const flex = batch.geometry.getAttribute("aVegetationFlex");
    assert.equal(flex.count, batch.geometry.getAttribute("position").count, "wind needs a bounded weight for every vertex");
    assert.ok(Array.from(flex.array).every(value => value >= 0 && value <= 1));
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
    assert.equal(shader.uniforms.uLandscapeTime, material.userData.landscapeWind.time);
    assert.ok(shader.vertexShader.includes("instanceMatrix[3].xyz"), "instanced plants need position-dependent gusts");
    assert.ok(shader.vertexShader.includes("aVegetationFlex"), "GPU wind must use the root-to-tip bend weights");
  }
  vegetation.update(12.5);
  for (const material of windMaterials) assert.equal(material.userData.landscapeWind.time.value, 12.5);
  vegetation.update(12.5);
  for (const material of windMaterials) assert.equal(material.userData.landscapeWind.time.value, 12.5, "a paused presentation clock stays frozen");
  vegetation.update(Number.NaN);
  for (const material of windMaterials) assert.equal(material.userData.landscapeWind.time.value, 12.5);
  plants.forEach((batch, index) => assert.deepEqual(batch.instanceMatrix.array, matrices[index]));
  vegetation.dispose();
});

test("vegetation teardown releases its GPU resources exactly once and ignores subsequent frames", () => {
  const vegetation = new RegionVegetation("wilderness"), resources = new Set<THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh>();
  vegetation.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    resources.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => resources.add(material));
    if (object instanceof THREE.InstancedMesh) resources.add(object);
  });
  const released = new Map<object, number>();
  resources.forEach(resource => {
    const record = () => { released.set(resource, (released.get(resource) ?? 0) + 1); };
    if (resource instanceof THREE.InstancedMesh) resource.addEventListener("dispose", record);
    else resource.addEventListener("dispose", record);
  });
  vegetation.dispose(); vegetation.dispose(); vegetation.update(42);
  assert.equal(vegetation.group.children.length, 0);
  resources.forEach(resource => assert.equal(released.get(resource), 1));
});

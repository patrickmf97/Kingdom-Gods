import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createRegionEnvironment } from "../src/three/environment";
import { initialState } from "../src/simulation";
import { regionForZone } from "../src/regions";

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) result.push(object); });
  return result;
}

for (const zone of ["village", "wilderness"] as const) test(`${zone} has a lightweight complete outdoor horizon that never intercepts interaction rays`, () => {
  const environment = createRegionEnvironment(zone, initialState());
  const horizon = environment.group.getObjectByName(`horizon-${zone}`);
  assert.ok(horizon, "outdoor regions need a sky, mountains and a ground apron");
  const scenery = meshes(horizon);
  assert.equal(scenery.length, 4);
  let triangles = 0, drawCalls = 0;
  for (const mesh of scenery) {
    const material = mesh.material as THREE.MeshBasicMaterial;
    assert.equal(material.fog, false, "distant silhouettes must survive the gameplay fog");
    assert.equal(mesh.castShadow, false);
    drawCalls += material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
    const bounds = new THREE.Box3().setFromObject(mesh);
    const ray = new THREE.Raycaster(bounds.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 300, 0)), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(mesh).length, 0, "decorative land must not become a click destination");
  }
  assert.equal(drawCalls, 4, "transparent two-sided scenery must avoid Three's automatic second draw pass");
  assert.ok(triangles < 2000, `bounded mobile geometry budget, got ${triangles} triangles`);
  const skirt = horizon.getObjectByName("horizon-ground") as THREE.Mesh;
  const skirtBounds = new THREE.Box3().setFromObject(skirt);
  assert.ok(skirtBounds.max.y < -.015, "the apron must sit below the playable floor");
  const region = regionForZone(zone), width = region.width / 24, depth = region.height / 24;
  assert.ok(skirtBounds.min.x < -20 && skirtBounds.max.x > width + 20);
  assert.ok(skirtBounds.min.z < -20 && skirtBounds.max.z > depth + 20);
  for (const mesh of scenery.filter(mesh => mesh.name.startsWith("horizon-mountains"))) {
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      assert.ok(x < 0 || x > width || z < 0 || z > depth, "mountains must remain beyond the map bounds");
    }
  }
  const sky = horizon.getObjectByName("horizon-sky") as THREE.Mesh;
  const skyMaterial = sky.material as THREE.MeshBasicMaterial;
  stateMinutes(environment, 720);
  const dayBrightness = skyMaterial.color.r;
  stateMinutes(environment, 0);
  assert.ok(skyMaterial.color.r < dayBrightness, "the sky must follow the existing world clock");
  environment.dispose();
});

function stateMinutes(environment: ReturnType<typeof createRegionEnvironment>, minutes: number): void {
  const state = initialState(); state.minutes = minutes;
  environment.update(state, 1);
}

test("interiors do not acquire outdoor sky or mountain geometry", () => {
  for (const zone of ["orphanage", "dungeon", "mine"] as const) {
    const environment = createRegionEnvironment(zone, initialState());
    assert.equal(environment.group.getObjectByName(`horizon-${zone}`), undefined);
    environment.dispose();
  }
});

test("the widest camera view retains both mountain silhouettes and visible sky at outdoor edges", () => {
  for (const zone of ["village", "wilderness"] as const) {
    const environment = createRegionEnvironment(zone, initialState());
    const horizon = environment.group.getObjectByName(`horizon-${zone}`)!;
    const scenery = meshes(horizon);
    const sky = horizon.getObjectByName("horizon-sky")!;
    const x = regionForZone(zone).width / 48, z = 3;
    for (const [aspect, fov] of [[1.6, 42], [390 / 690, 48]]) for (const yaw of [-Math.PI / 3, Math.PI / 10, Math.PI / 3]) {
      const camera = new THREE.PerspectiveCamera(fov, aspect, .1, 230);
      camera.position.set(x + Math.sin(yaw) * 48 * .77, .7 + 48 * .9, z + Math.cos(yaw) * 48 * .77);
      camera.lookAt(x, .7, z); camera.updateMatrixWorld();
      sky.position.copy(camera.position); horizon.updateMatrixWorld(true);
      const visible = new Set<string>();
      for (const screenY of [.98, .75, .5, .25]) for (let i = 0; i < 21; i++) {
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(-.95 + i * .095, screenY), camera);
        ray.far = camera.far;
        const hits: THREE.Intersection[] = [];
        // Exercise the actual triangles; normal gameplay deliberately skips
        // these meshes because their raycast methods ignore interaction rays.
        for (const mesh of scenery) THREE.Mesh.prototype.raycast.call(mesh, ray, hits);
        hits.sort((a, b) => a.distance - b.distance);
        assert.ok(hits[0], "a backdrop must always replace the old empty map edge");
        let skyContribution = 1;
        for (const hit of hits.filter(hit => hit.object !== sky)) {
          const colors = (hit.object as THREE.Mesh).geometry.getAttribute("color");
          const alpha = colors.itemSize === 4 && hit.face && hit.barycoord
            ? colors.getW(hit.face.a) * hit.barycoord.x + colors.getW(hit.face.b) * hit.barycoord.y + colors.getW(hit.face.c) * hit.barycoord.z : 1;
          skyContribution *= 1 - alpha;
          if (alpha > .03) visible.add(hit.object.name);
        }
        if (skyContribution > .1 && hits.some(hit => hit.object === sky)) visible.add("horizon-sky");
      }
      assert.ok(visible.has("horizon-sky"), `${zone} ${aspect} yaw ${yaw} closes off the sky`);
      assert.ok([...visible].some(name => name.startsWith("horizon-mountains")), `${zone} ${aspect} yaw ${yaw} must retain the mountain silhouette`);
    }
    environment.dispose();
  }
});

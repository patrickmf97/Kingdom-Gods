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
  assert.equal(scenery.length, 5);
  let triangles = 0, drawCalls = 0;
  for (const mesh of scenery) {
    const material = mesh.material as THREE.MeshBasicMaterial;
    assert.equal(material.fog, mesh.name === "horizon-ground", "the lit terrain apron follows scene fog while distant silhouettes survive it");
    assert.equal(mesh.castShadow, false);
    drawCalls += material.transparent && material.side === THREE.DoubleSide && !material.forceSinglePass ? 2 : 1;
    triangles += (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3;
    const bounds = new THREE.Box3().setFromObject(mesh);
    const ray = new THREE.Raycaster(bounds.getCenter(new THREE.Vector3()).add(new THREE.Vector3(0, 300, 0)), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObject(mesh).length, 0, "decorative land must not become a click destination");
  }
  assert.equal(drawCalls, 5, "transparent two-sided scenery must avoid Three's automatic second draw pass");
  assert.ok(triangles < 2000, `bounded mobile geometry budget, got ${triangles} triangles`);
  const skirt = horizon.getObjectByName("horizon-ground") as THREE.Mesh;
  const skirtBounds = new THREE.Box3().setFromObject(skirt);
  assert.ok(Math.abs(skirtBounds.max.y - (-.015 + .002)) < 1e-6, "the level underlap must cover the floor’s exposed side edge without a visible height step");
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

test("living sky renders sun, moon, stars and drifting clouds in its existing dome draw", () => {
  const environment = createRegionEnvironment("wilderness", initialState());
  const sky = environment.group.getObjectByName("horizon-sky") as THREE.Mesh;
  const material = sky.material as THREE.MeshBasicMaterial;
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  for (const name of ["uSkyTime", "uSkyDaylight", "uSkyCloudiness", "uSkySunDirection", "uSkyMoonDirection"]) assert.ok(shader.uniforms[name], `${name} feeds the sky presentation`);
  assert.ok(shader.fragmentShader.includes("starLight") && shader.fragmentShader.includes("sunDisc") && shader.fragmentShader.includes("moonDisc") && shader.fragmentShader.includes("cloudField"));
  const state = initialState(), before = JSON.stringify(state);
  environment.update(state, 24); assert.equal(shader.uniforms.uSkyTime.value, 24);
  environment.update(state, 24); assert.equal(shader.uniforms.uSkyTime.value, 24);
  environment.update(state, Number.NaN); assert.equal(shader.uniforms.uSkyTime.value, 24);
  assert.equal(JSON.stringify(state), before);
  const noon = shader.uniforms.uSkyDaylight.value;
  state.minutes = 0; environment.update(state, 24); assert.ok(shader.uniforms.uSkyDaylight.value < noon);
  environment.dispose();
});

test("edge haze leaves playable ground visible and continues softly beyond every border", () => {
  const environment = createRegionEnvironment("wilderness", initialState());
  const haze = environment.group.getObjectByName("horizon-edge-haze") as THREE.Mesh;
  assert.ok(haze, "nearby floor edges need local haze independent of camera fog distance");
  const positions = haze.geometry.getAttribute("position"), colors = haze.geometry.getAttribute("color");
  const region = regionForZone("wilderness"), width = region.width / 24, depth = region.height / 24;
  let transparent = 0, exteriorMist = 0;
  for (let i = 0; i < colors.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), alpha = colors.getW(i);
    if (alpha === 0) transparent++;
    if (x >= 0 && x <= width && z >= 0 && z <= depth)
      assert.ok(alpha <= .181, "a walker at the map edge must still stand on visible textured ground");
    else if (alpha > .5) exteriorMist++;
  }
  assert.ok(transparent > 0 && exteriorMist > 0);
  const bounds = new THREE.Box3().setFromObject(haze);
  assert.ok(bounds.min.x < -12 && bounds.min.z < -12 && bounds.max.x > width + 12 && bounds.max.z > depth + 12);
  assert.ok(positions.count <= 2000);
  const apron = environment.group.getObjectByName("horizon-ground") as THREE.Mesh;
  const apronColors = apron.geometry.getAttribute("color");
  assert.ok(apronColors.getX(0) !== apronColors.getX(apronColors.count - 1), "the apron retains a terrain-to-atmosphere color gradient");
  assert.equal(haze.castShadow, false); assert.equal(haze.receiveShadow, false);
  environment.dispose();
});


test("the apron matches real terrain lighting and stays level across the map edge", () => {
  for (const zone of ["village", "wilderness"] as const) {
    const environment = createRegionEnvironment(zone, initialState());
    const apron = environment.group.getObjectByName("horizon-ground") as THREE.Mesh;
    assert.ok(apron.material instanceof THREE.MeshStandardMaterial, "weather lighting must affect both sides of the boundary equally");
    assert.equal(apron.material.toneMapped, true);
    assert.equal(apron.material.polygonOffset, true);
    assert.ok(apron.material.polygonOffsetFactor < 0 && apron.material.polygonOffsetUnits < 0, "the subpixel level underlap must not z-fight against the floor");
    const positions = apron.geometry.getAttribute("position"), normals = apron.geometry.getAttribute("normal"), colors = apron.geometry.getAttribute("color");
    const region = regionForZone(zone), width = region.width / 24, depth = region.height / 24;
    let levelBorder = 0;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i), outside = Math.max(-x, x - width, -z, z - depth);
      if (outside <= 3.001) {
        assert.ok(Math.abs(positions.getY(i) + .013) < 1e-6, "the apron must cover the floor sidewall at its actual top height");
        assert.ok(Math.abs(colors.getX(i) - new THREE.Color(0x789568).r) < 1e-6);
        levelBorder++;
      }
      assert.equal(normals.getX(i), 0); assert.equal(normals.getY(i), 1); assert.equal(normals.getZ(i), 0);
    }
    assert.ok(levelBorder > 0);
    environment.dispose();
  }
});


test("the highlands apron seals its own distinct terrain top without exposing a box wall", () => {
  const environment = createRegionEnvironment("highlands", initialState());
  const floor = environment.group.getObjectByName("highlands-floor") as THREE.Mesh;
  const apron = environment.group.getObjectByName("horizon-ground") as THREE.Mesh;
  const floorTop = new THREE.Box3().setFromObject(floor).max.y;
  const apronTop = new THREE.Box3().setFromObject(apron).max.y;
  assert.ok(Math.abs(apronTop - floorTop - .002) < 1e-6);
  assert.ok(apron.material instanceof THREE.MeshStandardMaterial && apron.material.map);
  environment.dispose();
});

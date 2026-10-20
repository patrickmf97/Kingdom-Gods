import * as THREE from "three";
import { weatherFor, type WeatherSnapshot } from "../weather";
import { atmosphereFor } from "./weather";
import { RegionSurfaceTextures } from "./materials";
import { regionForZone } from "../regions";
import type { Zone } from "../types";

export interface RegionHorizon {
  group: THREE.Group;
  update(minutes: number, weather?: WeatherSnapshot, presentationTime?: number): void;
  dispose(): void;
}

/** Five draw calls; procedural celestial sky shares the existing dome draw. */
export function createHorizon(zone: Zone): RegionHorizon | undefined {
  if (zone !== "village" && zone !== "wilderness" && zone !== "highlands") return undefined;
  const group = new THREE.Group(); group.name = `horizon-${zone}`;
  const region = regionForZone(zone), width = region.width / 24, depth = region.height / 24;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: (THREE.MeshBasicMaterial | THREE.MeshStandardMaterial)[] = [];
  const terrainSurfaces = zone === "highlands" ? new RegionSurfaceTextures() : undefined;
  let disposed = false;
  const skyUniforms = {
    uSkyTime: { value: 0 }, uSkyDaylight: { value: 1 }, uSkyCloudiness: { value: .1 },
    uSkySunDirection: { value: new THREE.Vector3() }, uSkyMoonDirection: { value: new THREE.Vector3() },
    uSkyCloudTint: { value: new THREE.Color() },
  };

  function mesh(name: string, geometry: THREE.BufferGeometry, options: THREE.MeshBasicMaterialParameters = {}): THREE.Mesh {
    geometries.push(geometry);
    const material = name === "horizon-ground"
      ? new THREE.MeshStandardMaterial({ vertexColors: true, fog: true, roughness: .93, metalness: 0,
        ...options, toneMapped: true, map: terrainSurfaces?.get("soil") ?? null,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      : new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false, ...options });
    materials.push(material);
    const result = new THREE.Mesh(geometry, material); result.name = name;
    // Raycaster traverses the environment recursively. Decorative land must
    // never turn a mountain or the sky into a movement destination.
    result.raycast = () => {};
    group.add(result);
    return result;
  }

  function perimeter(angle: number, outset: number, height: number): THREE.Vector3 {
    const x = Math.cos(angle), z = Math.sin(angle), divisor = Math.max(Math.abs(x), Math.abs(z));
    return new THREE.Vector3(width / 2 + (width / 2 + outset) * x / divisor,
      height, depth / 2 + (depth / 2 + outset) * z / divisor);
  }

  const steps = 72;
  function ring(name: string, rings: { outset: number; height: (i: number) => number; color: number; alpha: number }[], order: number): void {
    const positions: number[] = [], colors: number[] = [];
    const points = rings.map(ring => Array.from({ length: steps }, (_, i) => perimeter(i / steps * Math.PI * 2, ring.outset, ring.height(i))));
    const shades = rings.map(ring => new THREE.Color(ring.color));
    function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3,
      ca: THREE.Color, cb: THREE.Color, cc: THREE.Color, shade: number, aa: number, ab: number, ac: number): void {
      for (const [point, color, alpha] of [[a, ca, aa], [b, cb, ab], [c, cc, ac]] as const) {
        positions.push(point.x, point.y, point.z);
        colors.push(color.r * shade, color.g * shade, color.b * shade, alpha);
      }
    }
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < steps; i++) {
      const next = (i + 1) % steps;
      // Small per-face variations give the distant slopes the same faceted
      // language as the village without expensive standard-material lighting.
      const faceted = name.startsWith("horizon-mountains");
      const shade = faceted ? .97 + (Math.sin(i * 2.43 + j) + 1) * .015 : 1;
      triangle(points[j][i], points[j][next], points[j + 1][next], shades[j], shades[j], shades[j + 1], shade,
        rings[j].alpha, rings[j].alpha, rings[j + 1].alpha);
      triangle(points[j][i], points[j + 1][next], points[j + 1][i], shades[j], shades[j + 1], shades[j + 1], faceted ? shade * .99 : 1,
        rings[j].alpha, rings[j + 1].alpha, rings[j + 1].alpha);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    if (name === "horizon-ground") {
      const normals: number[] = [], uv: number[] = [];
      for (let i = 0; i < positions.length; i += 3) { normals.push(0, 1, 0); uv.push(positions[i] * .6, positions[i + 2] * .6); }
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    }
    mesh(name, geometry, { side: THREE.DoubleSide, transparent: true, depthWrite: false, forceSinglePass: true }).renderOrder = order;
  }

  // Continue the terrain under the edge before lowering it into the distance.
  // Matching the real floor’s lighting and normal removes a weather-dependent
  // rectangular seam. The level underlap prevents a cliff at the floor cut.
  const terrainColor = zone === "highlands" ? 0x81956d : 0x789568;
  // The source floors have different tops: highlands0, village/wilderness−.015.
  // A 2mm raised overlap seals the box sidewall; depth bias stabilizes that join.
  const terrainJoinHeight = (zone === "highlands" ? 0 : -.015) + .002;
  ring("horizon-ground", [
    { outset: -3, height: () => terrainJoinHeight, color: terrainColor, alpha: 1 },
    { outset: 3, height: () => terrainJoinHeight, color: terrainColor, alpha: 1 },
    { outset: 18, height: () => -8, color: 0xa5bcb0, alpha: .9 },
    { outset: 70, height: () => -50, color: 0xb0cbd0, alpha: 0 },
  ], -300);
  // A light veil desaturates the final strip of grass without replacing it.
  // Most opacity belongs beyond the playable border, where the apron recedes.
  ring("horizon-edge-haze", [
    { outset: -6, height: () => .05, color: 0xffffff, alpha: 0 },
    { outset: 0, height: () => .05, color: 0xffffff, alpha: .18 },
    { outset: 18, height: () => -4, color: 0xffffff, alpha: .65 },
    { outset: 55, height: () => -29, color: 0xffffff, alpha: 0 },
  ], 2);
  const edgeHaze = group.getObjectByName("horizon-edge-haze") as THREE.Mesh;
  const phase = zone === "village" ? .7 : zone === "highlands" ? 3.8 : 2.1;
  // Broad, irregular peaks and saddles avoid a repeated perimeter fence.
  const ridge = (i: number, base: number, phaseOffset: number) => {
    const angle = i / steps * Math.PI * 2;
    return base + (zone === "highlands" ? 13 : 0) + Math.sin(angle * 5 + phase + phaseOffset) * 8 +
      Math.sin(angle * 3 - phase) * 6 + Math.sin(angle * 11 + phaseOffset) * 4;
  };
  ring("horizon-mountains-far", [
    { outset: 75, height: () => -78, color: 0xb7cdd0, alpha: 0 },
    { outset: 112, height: i => ridge(i, -50, 1.6), color: 0xb0c6ce, alpha: .65 },
    { outset: 140, height: () => -110, color: 0xb7cdd0, alpha: 0 },
  ], -500);
  ring("horizon-mountains-near", [
    { outset: 40, height: () => -48, color: 0xb0c6c7, alpha: 0 },
    { outset: 76, height: i => ridge(i, -22, 0), color: 0x9bb8c0, alpha: .85 },
    { outset: 104, height: () => -74, color: 0xb0c6c7, alpha: 0 },
  ], -400);

  const skyGeometry = new THREE.SphereGeometry(185, 24, 12);
  const skyPositions = skyGeometry.getAttribute("position"), skyColors: number[] = [];
  const zenith = new THREE.Color(0x8dbbd0), haze = new THREE.Color(0xcbdcdd), low = new THREE.Color(0xb0cbd0);
  const color = new THREE.Color();
  for (let i = 0; i < skyPositions.count; i++) {
    const altitude = skyPositions.getY(i) / 185;
    // The game camera looks down into the valley. Carry blue into the upper
    // visible dome rather than placing it only above the camera's horizon.
    if (altitude < -.75) color.copy(low).lerp(haze, (altitude + 1) / .25);
    else color.copy(haze).lerp(zenith, Math.min(1, (altitude + .75) / .8));
    skyColors.push(color.r, color.g, color.b);
  }
  skyGeometry.setAttribute("color", new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = mesh("horizon-sky", skyGeometry, { side: THREE.BackSide, depthWrite: false });
  const skyMaterial = sky.material as THREE.MeshBasicMaterial;
  skyMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, skyUniforms);
    shader.vertexShader = `varying vec3 vSkyDirection;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "vSkyDirection = position;\n#include <begin_vertex>");
    shader.fragmentShader = `
      varying vec3 vSkyDirection;
      uniform float uSkyTime; uniform float uSkyDaylight; uniform float uSkyCloudiness;
      uniform vec3 uSkySunDirection; uniform vec3 uSkyMoonDirection; uniform vec3 uSkyCloudTint;
      float skyHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float skyNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(skyHash(cell), skyHash(cell + vec2(1.0, 0.0)), f.x),
          mix(skyHash(cell + vec2(0.0, 1.0)), skyHash(cell + vec2(1.0)), f.x), f.y);
      }
      ${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
        vec3 direction = normalize(vSkyDirection);
        vec2 skyPlane = direction.xz * 5.0 + direction.y * vec2(1.3, 0.7);
        vec2 drift = vec2(uSkyTime * 0.006, uSkyTime * 0.002);
        float cloudField = skyNoise(skyPlane + drift) * 0.60 + skyNoise(skyPlane * 2.1 + drift * 1.4) * 0.28 + skyNoise(skyPlane * 4.3 - drift * 0.6) * 0.12;
        float cloud = smoothstep(mix(0.79, 0.28, uSkyCloudiness), 0.86, cloudField) * (0.28 + uSkyCloudiness * 0.58);
        diffuseColor.rgb = mix(diffuseColor.rgb, uSkyCloudTint, cloud);
        float night = 1.0 - smoothstep(0.0, 0.18, uSkyDaylight);
        float sunDot = max(0.0, dot(direction, uSkySunDirection));
        float sunDisc = smoothstep(0.9990, 0.99965, sunDot);
        float sunGlow = pow(sunDot, 170.0) * 0.19;
        float moonDot = max(0.0, dot(direction, uSkyMoonDirection));
        float moonDisc = smoothstep(0.9992, 0.9997, moonDot);
        vec2 starPlane = vec2(atan(direction.z, direction.x), asin(clamp(direction.y, -1.0, 1.0))) * vec2(90.0, 72.0);
        vec2 starCell = floor(starPlane), starOffset = fract(starPlane) - 0.5;
        float starLight = step(0.982, skyHash(starCell)) * (1.0 - smoothstep(0.02, 0.10, length(starOffset))) * night;
        float skyOpening = (1.0 - cloud) * (1.0 - uSkyCloudiness * 0.76);
        diffuseColor.rgb += (vec3(1.0, 0.77, 0.44) * (sunDisc + sunGlow) * smoothstep(-0.08, 0.10, uSkySunDirection.y)
          + vec3(0.69, 0.79, 0.89) * moonDisc * night * 0.75 + vec3(0.68, 0.78, 0.91) * starLight * 0.85) * skyOpening;
      `);
  };
  skyMaterial.customProgramCacheKey = () => "living-celestial-sky-v1";
  sky.renderOrder = -1000; sky.frustumCulled = false;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld();
  };

  return { group,
    update(minutes, weather, presentationTime = 0) {
      if (disposed) return;
      const profile = atmosphereFor(minutes, weather ?? weatherFor(1, minutes, zone));
      const tint = new THREE.Color(0x536c94).lerp(new THREE.Color(0xffffff), Math.min(1, profile.daylight * 2.4));
      tint.lerp(new THREE.Color(0xffc397), profile.twilight * .5);
      tint.lerp(new THREE.Color(0xa9b8c0), (weather?.cloudiness ?? .1) * .18);
      for (const material of materials) if (!(material instanceof THREE.MeshStandardMaterial)) material.color.copy(tint);
      // Mist stays neutral near grass; the apron retains its earthy vertex
      // gradient and receives the same hourly tint as the distant slopes.
      (edgeHaze.material as THREE.MeshBasicMaterial).color.copy(profile.sky)
        .lerp(new THREE.Color(0xd2dacb).multiply(tint), .5);
      if (Number.isFinite(presentationTime)) skyUniforms.uSkyTime.value = Math.max(0, presentationTime);
      skyUniforms.uSkyDaylight.value = profile.daylight;
      skyUniforms.uSkyCloudiness.value = weather?.cloudiness ?? .1;
      skyUniforms.uSkyCloudTint.value.copy(profile.sky).lerp(new THREE.Color(0xf4ecda), profile.daylight * .60);
      const angle = (((minutes % 1440) + 1440) % 1440 - 360) / 1440 * Math.PI * 2;
      skyUniforms.uSkySunDirection.value.set(Math.cos(angle) * .88, Math.sin(angle), -.48).normalize();
      skyUniforms.uSkyMoonDirection.value.set(-Math.cos(angle) * .88, -Math.sin(angle), .48).normalize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      terrainSurfaces?.dispose();
      group.clear();
    },
  };
}

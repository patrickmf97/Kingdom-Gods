import * as THREE from "three";
import { regionForZone } from "../regions";
import type { Zone } from "../types";

export interface RegionHorizon {
  group: THREE.Group;
  update(minutes: number): void;
  dispose(): void;
}

/** Four draw calls, no textures, lights, shadows, interaction or navigation. */
export function createHorizon(zone: Zone): RegionHorizon | undefined {
  if (zone !== "village" && zone !== "wilderness" && zone !== "highlands") return undefined;
  const group = new THREE.Group(); group.name = `horizon-${zone}`;
  const region = regionForZone(zone), width = region.width / 24, depth = region.height / 24;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.MeshBasicMaterial[] = [];
  let disposed = false;

  function mesh(name: string, geometry: THREE.BufferGeometry, options: THREE.MeshBasicMaterialParameters = {}): THREE.Mesh {
    geometries.push(geometry);
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false, ...options });
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

  const steps = 80;
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
      const shade = .97 + (Math.sin(i * 2.43 + j) + 1) * .015;
      triangle(points[j][i], points[j][next], points[j + 1][next], shades[j], shades[j], shades[j + 1], shade,
        rings[j].alpha, rings[j].alpha, rings[j + 1].alpha);
      triangle(points[j][i], points[j + 1][next], points[j + 1][i], shades[j], shades[j + 1], shades[j + 1], shade * .99,
        rings[j].alpha, rings[j + 1].alpha, rings[j + 1].alpha);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
    mesh(name, geometry, { side: THREE.DoubleSide, transparent: true, depthWrite: false, forceSinglePass: true }).renderOrder = order;
  }

  // The apron begins underneath the real floor and falls away into the
  // atmosphere. Vertex alpha removes its outer edge instead of making a moat.
  ring("horizon-ground", [
    { outset: -.08, height: () => -.06, color: 0x789568, alpha: 1 },
    { outset: 18, height: () => -8, color: 0x91ab97, alpha: .9 },
    { outset: 70, height: () => -50, color: 0xb0cbd0, alpha: 0 },
  ], -300);
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
  sky.renderOrder = -1000; sky.frustumCulled = false;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld();
  };

  return { group,
    update(minutes) {
      if (disposed) return;
      const sunlight = Math.max(.12, Math.sin((minutes - 360) / 1440 * Math.PI * 2));
      for (const material of materials) material.color.setScalar(.55 + sunlight * .45);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
}

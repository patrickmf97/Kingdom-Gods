import * as THREE from "three";
import { regionForZone, RESOURCE_NODES, type Rectangle } from "../regions";
import { ESTATE_DEFS, estateSolid } from "../territory-data";
import { HIGHLAND_BUILDINGS } from "../highlands";
import type { GameState, Zone } from "../types";
import { WORLD_SCALE } from "./coordinates";

/** Two draw calls; at most 1024 instances, one 64² map; contact feathering is analytic. */
export const LANDSCAPE_INSTANCE_BUDGET = 1024;
type Contact = { x: number; y: number; width: number; depth: number; resource?: string; remnant?: number; active?: (state: GameState) => boolean };
export interface LandscapeFinish {
  group: THREE.Group;
  update(state: GameState, timeSeconds: number): void;
  dispose(): void;
}

function texture(size: number, pixel: (x: number, y: number) => number[]): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data.set(pixel(x / (size - 1), y / (size - 1)), (y * size + x) * 4);
  const map = new THREE.DataTexture(data, size, size);
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true;
  map.needsUpdate = true; return map;
}

export function createLandscapeFinish(zone: Zone, state: GameState): LandscapeFinish | undefined {
  if (zone !== "village" && zone !== "wilderness" && zone !== "highlands") return undefined;
  const group = new THREE.Group(); group.name = `landscape-finish-${zone}`;
  const region = regionForZone(zone), contacts: Contact[] = [];
  const rect = (area: Rectangle, active?: Contact["active"]) => contacts.push({ x: (area.left + area.right) / 2,
    y: (area.top + area.bottom) / 2, width: (area.right - area.left) / 24 * 1.45 + .6,
    depth: (area.bottom - area.top) / 24 * 1.45 + .6, active });
  for (const item of region.decor) {
    const scale = item.scale ?? 1;
    contacts.push({ x: item.x + scale, y: item.y - 12 * scale, width: (item.key === "pine" ? 3.9 : 5.4) * scale, depth: 3.2 * scale });
  }
  for (const node of RESOURCE_NODES.filter(node => node.zone === zone)) contacts.push({ x: node.x, y: node.y - 12,
    width: node.resource === "wood" ? 4.9 : node.resource === "herb" ? 1.5 : 2.3,
    depth: node.resource === "wood" ? 3.3 : node.resource === "herb" ? 1 : 1.6,
    resource: node.id, remnant: node.resource === "wood" ? .18 : node.resource === "herb" ? 0 : .45 });
  // Only authored building bases; lakes, ridges and reserve collision rectangles do not cast building shadows.
  if (zone === "village") {
    for (const area of region.solids.slice(0, 24)) if (area.right - area.left >= 65 && area.bottom - area.top >= 50) rect(area);
    rect({ left: 2026, right: 2160, top: 718, bottom: 778 }, current => current.property.building);
  } else if (zone === "highlands") HIGHLAND_BUILDINGS.forEach(building => rect(building.footprint));
  else {
    rect(region.solids[0]); rect(region.solids[1]);
    for (const estate of ESTATE_DEFS) rect(estateSolid(estate.id), current => {
      const holding = current.territory.parcels[estate.id]; return holding.owned && holding.building !== "none";
    });
  }
  if (contacts.length > LANDSCAPE_INSTANCE_BUDGET) throw new Error("Landscape contact instance budget exceeded");
  const groundMap = texture(64, (u, v) => {
    const broad = Math.sin(u * 18 + Math.sin(v * 9) * 1.6) * .5 + Math.cos(v * 21 - u * 7) * .32;
    const fold = Math.sin(u * 39 + v * 29) * Math.cos(v * 37 - u * 13) * .16;
    const mix = Math.max(0, Math.min(1, (broad + fold + 1) / 2));
    return [Math.round(72 + mix * 75), Math.round(94 + mix * 52), Math.round(49 + mix * 44), Math.round(62 + Math.abs(broad) * 64)];
  }); groundMap.name = "landscape-broad-ground-64"; groundMap.colorSpace = THREE.SRGBColorSpace;
  const contactGeometry = new THREE.PlaneGeometry(1, 1); contactGeometry.rotateX(-Math.PI / 2);
  const contactMaterial = new THREE.MeshBasicMaterial({ color: 0x24362d, transparent: true, opacity: .62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  contactMaterial.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec2 contactUv;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "contactUv = uv;\n#include <begin_vertex>");
    shader.fragmentShader = `varying vec2 contactUv;\n${shader.fragmentShader}`.replace("#include <color_fragment>", `#include <color_fragment>
      float contactRadius = length((contactUv - 0.5) * 2.0);
      diffuseColor.a *= pow(max(0.0, 1.0 - contactRadius), 1.8) * 0.82;
      if (diffuseColor.a < 0.005) discard;`);
  };
  contactMaterial.customProgramCacheKey = () => "landscape-contact-soft-v1";
  const shadows = new THREE.InstancedMesh(contactGeometry, contactMaterial, contacts.length);
  shadows.name = "landscape-contact-shadows"; shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shadows.userData.resourceSlots = Object.fromEntries(contacts.flatMap((contact, index) => contact.resource ? [[contact.resource, index]] : []));
  const groundGeometry = new THREE.PlaneGeometry(region.width * WORLD_SCALE, region.height * WORLD_SCALE); groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: groundMap, roughness: 1, metalness: 0, transparent: true, opacity: .85, depthWrite: false });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial); ground.name = "landscape-ground-variation";
  ground.position.set(region.width * WORLD_SCALE / 2, .001, region.height * WORLD_SCALE / 2);
  for (const mesh of [ground, shadows]) { mesh.userData.presentationOnly = true; mesh.raycast = () => {}; mesh.renderOrder = mesh === ground ? 0 : 1; group.add(mesh); }
  const matrix = new THREE.Matrix4(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion(), position = new THREE.Vector3();
  const previous = new Float32Array(contacts.length).fill(-1);
  let disposed = false, season = -1;
  function update(next: GameState): void {
    if (disposed) return;
    let changed = false;
    contacts.forEach((contact, index) => {
      const factor = contact.active && !contact.active(next) ? 0 : contact.resource && (next.frontier.resources[contact.resource]?.remaining ?? 1) <= 0 ? contact.remnant! : 1;
      if (previous[index] === factor) return;
      previous[index] = factor; changed = true;
      position.set(contact.x * WORLD_SCALE + .16, .004, contact.y * WORLD_SCALE + .1);
      scale.set(contact.width * factor, 1, contact.depth * factor);
      matrix.compose(position, rotation, scale); shadows.setMatrixAt(index, matrix);
    });
    if (changed) { shadows.instanceMatrix.needsUpdate = true; shadows.computeBoundingSphere(); }
    const nextSeason = Math.floor((Math.max(1, next.day) - 1) / 90) % 4;
    if (season !== nextSeason) { season = nextSeason; groundMaterial.color.setHex([0xffffff, 0xf0e8bc, 0xd5b17d, 0xc6d2d4][season]); }
  }
  update(state);
  return { group, update,
    dispose() {
      if (disposed) return; disposed = true;
      shadows.dispose(); contactGeometry.dispose(); groundGeometry.dispose(); contactMaterial.dispose(); groundMaterial.dispose(); groundMap.dispose(); group.clear();
    },
  };
}

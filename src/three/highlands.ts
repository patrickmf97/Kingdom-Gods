import * as THREE from "three";
import { weatherFor } from "../weather";
import { HIGHLAND_BUILDINGS, HIGHLAND_EXIT, HIGHLAND_RESOURCE_NODES, HIGHLAND_RIDGES, HIGHLAND_ROADS, HIGHLANDS_REGION } from "../highlands";
import type { Rectangle } from "../regions";
import type { GameState, Point, ResourceNodeDefinition } from "../types";
import { createHorizon } from "./horizon";
import { RegionSurfaceTextures, type SurfaceTexture } from "./materials";
import { RegionVegetation } from "./vegetation";

const SCALE = 1 / 24;
type ReserveVisual = { id: string; available: THREE.Group; depleted: THREE.Group };

export interface HighlandsLayer {
  group: THREE.Group;
  update(state: GameState, timeSeconds: number): void;
  dispose(): void;
}

/** Region-local assets, shared primitive meshes and a bounded instanced landscape. */
export function createHighlandsLayer(state: GameState): HighlandsLayer {
  const group = new THREE.Group(); group.name = "environment-highlands";
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  const surfaces = new RegionSurfaceTextures();
  const nodes: ReserveVisual[] = [];
  let disposed = false;
  function geometry<T extends THREE.BufferGeometry>(value: T): T { geometries.add(value); return value; }
  const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  const rock = geometry(new THREE.IcosahedronGeometry(1, 0));
  function material(color: number, texture?: SurfaceTexture, emissive = 0): THREE.MeshStandardMaterial {
    const key = `${color}:${texture ?? "flat"}:${emissive}`;
    let value = materialCache.get(key);
    if (!value) {
      value = new THREE.MeshStandardMaterial({ color, roughness: .94, metalness: 0, flatShading: true,
        map: texture ? surfaces.get(texture) : null, emissive, emissiveIntensity: emissive ? .45 : 0 });
      materials.add(value); materialCache.set(key, value);
    }
    return value;
  }
  function mesh(shape: THREE.BufferGeometry, surface: THREE.Material, parent: THREE.Object3D = group): THREE.Mesh {
    const result = new THREE.Mesh(shape, surface); result.receiveShadow = true; parent.add(result); return result;
  }
  function box(x: number, y: number, width: number, depth: number, height: number, color: number,
    base = 0, parent: THREE.Object3D = group, texture?: SurfaceTexture): THREE.Mesh {
    const result = mesh(cube, material(color, texture), parent);
    result.position.set(x * SCALE, base + height / 2, y * SCALE); result.scale.set(width * SCALE, height, depth * SCALE);
    return result;
  }
  function round(x: number, y: number, radius: number, height: number, color: number,
    base = 0, parent: THREE.Object3D = group): THREE.Mesh {
    const result = mesh(cylinder, material(color), parent);
    result.position.set(x * SCALE, base + height / 2, y * SCALE); result.scale.set(radius * SCALE, height, radius * SCALE); return result;
  }
  function ribbon(paths: Point[][], width: number, color: number, height: number): void {
    const positions: number[] = [];
    const tri = (a: Point, b: Point, c: Point) => {
      for (const point of [a, b, c]) positions.push(point.x * SCALE, height, point.y * SCALE);
    };
    for (const path of paths) {
      for (let index = 1; index < path.length; index++) {
        const a = path[index - 1], b = path[index], length = Math.hypot(b.x - a.x, b.y - a.y);
        const nx = -(b.y - a.y) / length * width / 2, ny = (b.x - a.x) / length * width / 2;
        const corners = [{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
          { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }];
        tri(corners[0], corners[1], corners[2]); tri(corners[0], corners[2], corners[3]);
      }
      for (const point of path) for (let index = 0; index < 10; index++) {
        const a = index * Math.PI / 5, b = (index + 1) * Math.PI / 5;
        tri(point, { x: point.x + Math.cos(a) * width / 2, y: point.y + Math.sin(a) * width / 2 },
          { x: point.x + Math.cos(b) * width / 2, y: point.y + Math.sin(b) * width / 2 });
      }
    }
    const shape = geometry(new THREE.BufferGeometry());
    shape.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    shape.setAttribute("uv", new THREE.Float32BufferAttribute(positions.flatMap((coordinate, index) => index % 3 === 1 ? [] : [coordinate * .6]), 2));
    shape.computeVertexNormals();
    const surface = material(color, "path"); surface.side = THREE.DoubleSide;
    mesh(shape, surface).name = "highland-trail";
  }

  const floor = box(1280, 960, HIGHLANDS_REGION.width, HIGHLANDS_REGION.height, .03, 0x81956d, -.03, group, "soil");
  floor.name = "highlands-floor";
  const floorGeometry = geometry(cube.clone());
  const floorPositions = floorGeometry.getAttribute("position");
  const uvs: number[] = [];
  for (let index = 0; index < floorPositions.count; index++) uvs.push(floorPositions.getX(index) * 64, floorPositions.getZ(index) * 48);
  floorGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); floor.geometry = floorGeometry;
  ribbon(HIGHLAND_ROADS, 82, 0x999878, .006);
  ribbon(HIGHLAND_ROADS, 62, 0xb9b08b, .016);

  const vegetation = new RegionVegetation("highlands");
  group.add(vegetation.group);
  const horizon = createHorizon("highlands");
  if (horizon) group.add(horizon.group);

  function ridge(area: Rectangle, index: number): void {
    const x = (area.left + area.right) / 2, y = (area.top + area.bottom) / 2;
    const width = area.right - area.left, depth = area.bottom - area.top;
    const body = box(x, y, width, depth, 1.15, 0x777e72, 0, group, "stone");
    body.name = `highland-ridge-${index}`;
    // All facets remain inside the shared solid; the full base reads as a cliff.
    const peak = new THREE.Vector3(x * SCALE, 4.2 + index % 3 * 1.3, y * SCALE);
    const shoulder = [new THREE.Vector3(area.left * SCALE, 1.15, area.top * SCALE),
      new THREE.Vector3(area.right * SCALE, 1.15, area.top * SCALE),
      new THREE.Vector3(area.right * SCALE, 1.15, area.bottom * SCALE),
      new THREE.Vector3(area.left * SCALE, 1.15, area.bottom * SCALE)];
    const positions: number[] = [], colors: number[] = [];
    const tint = new THREE.Color();
    for (let side = 0; side < 4; side++) {
      tint.setHex([0x8f9588, 0xa1a697, 0x737e74, 0x899182][(side + index) % 4]);
      for (const point of [shoulder[side], peak, shoulder[(side + 1) % 4]]) {
        positions.push(...point.toArray()); colors.push(tint.r, tint.g, tint.b);
      }
    }
    const shape = geometry(new THREE.BufferGeometry());
    shape.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    shape.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3)); shape.computeVertexNormals();
    const faceMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide });
    materials.add(faceMaterial); mesh(shape, faceMaterial);
    for (let course = 0; course < 3; course++) box(x, area.bottom - .8, width - 4, 1, .045,
      course % 2 ? 0xa1a18d : 0x626e65, .23 + course * .29);
  }
  HIGHLAND_RIDGES.forEach(ridge);

  const roofShape = geometry(new THREE.BufferGeometry());
  roofShape.setAttribute("position", new THREE.Float32BufferAttribute([
    -.5, 0, -.5, -.5, 0, .5, -.5, 1, 0, .5, 0, .5, .5, 0, -.5, .5, 1, 0,
    -.5, 0, .5, .5, 0, .5, .5, 1, 0, -.5, 0, .5, .5, 1, 0, -.5, 1, 0,
    .5, 0, -.5, -.5, 0, -.5, -.5, 1, 0, .5, 0, -.5, -.5, 1, 0, .5, 1, 0,
  ], 3));
  const roofPositions = roofShape.getAttribute("position");
  const roofUvs: number[] = [];
  for (let index = 0; index < roofPositions.count; index++) roofUvs.push((roofPositions.getX(index) + .5) * 4, roofPositions.getY(index) * 3);
  roofShape.setAttribute("uv", new THREE.Float32BufferAttribute(roofUvs, 2)); roofShape.computeVertexNormals();
  const buildingRoofs: { x: number; y: number; material: THREE.MeshStandardMaterial }[] = [];
  for (const building of HIGHLAND_BUILDINGS) {
    const chapel = building.kind === "chapel", area = building.footprint;
    const x = (area.left + area.right) / 2, y = (area.top + area.bottom) / 2;
    const width = area.right - area.left, depth = area.bottom - area.top, height = chapel ? 3.6 : 2.8;
    const house = new THREE.Group(); house.name = building.id; group.add(house);
    box(x, y, width, depth, .35, 0x7c8478, 0, house, "stone");
    box(x, y, width, depth, height - .35, chapel ? 0xc9c6ab : 0xc2bb96, .35, house, chapel ? "stone" : "plaster");
    const roofMaterial = material(chapel ? 0x65777a : 0x657361, "shingles").clone();
    materials.add(roofMaterial);
    const roof = mesh(roofShape, roofMaterial, house);
    roof.position.set(x * SCALE, height, y * SCALE); roof.scale.set((width + 18) * SCALE, chapel ? 1.9 : 1.55, (depth + 20) * SCALE);
    roof.castShadow = true; roof.name = "highland-building-roof";
    buildingRoofs.push({ x, y, material: roofMaterial });
    const front = area.bottom + .4, doorX = chapel ? 1774 : 926;
    for (const postX of [area.left + 4, x - 38, area.right - 4]) box(postX, front, 6, 3, height, 0x53604e, 0, house, "wood");
    for (const base of [.4, height - .15]) box(x, front, width - 6, 3, .1, 0x53604e, base, house, "wood");
    box(doorX, front + .8, 35, 2, 1.82, 0x544937, .05, house, "wood");
    for (const dx of [-19, 19]) box(doorX + dx, front + 1, 4, 4, 1.95, 0xa6a185, 0, house, "stone");
    box(doorX, front + 1, 42, 5, .14, 0xa6a185, 1.9, house, "stone");
    round(doorX + 10, front + 2, 1.5, .055, 0xc5a56a, .9, house).rotation.x = Math.PI / 2;
    for (const windowX of chapel ? [1690, 1820] : [836, 980]) {
      box(windowX, front + .6, 24, 2, chapel ? 1.45 : 1.05, 0x586d69, 1.1, house);
      for (const offset of [-14, 14]) box(windowX + offset, front + 1, 3, 4, chapel ? 1.58 : 1.17, 0x53604e, 1.04, house, "wood");
      box(windowX, front + 1, 3, 4, chapel ? 1.45 : 1.05, 0xb6b292, 1.1, house);
      box(windowX, front + 1.5, 26, 4, .08, 0xb6b292, 1.66, house);
    }
    box(doorX - 27, front + 2, 7, 4, .34, 0x4b5146, 1.75, house);
    const lantern = mesh(cube, material(0xe0bd77, undefined, 0xc39043), house);
    lantern.position.set((doorX - 27) * SCALE, 1.91, (front + 4) * SCALE); lantern.scale.set(.17, .23, .12);
    if (chapel) {
      // Belfry and cross stand entirely over the existing northern building base.
      box(1710, 830, 54, 54, 1.9, 0xa9ad98, height + .55, house, "stone");
      box(1710, 858, 29, 1, .76, 0x3c4b44, height + 1.25, house);
      const bell = round(1710, 858.5, 7, .4, 0xb59a5d, height + 1.4, house); bell.scale.x *= .65;
      const spire = mesh(roofShape, material(0x65777a, "shingles"), house);
      spire.position.set(1710 * SCALE, height + 2.45, 830 * SCALE); spire.scale.set(68 * SCALE, 1.1, 68 * SCALE);
      box(1710, 830, 4, 4, .85, 0xb8ac80, height + 3.35, house);
      box(1710, 830, 22, 4, .09, 0xb8ac80, height + 3.91, house);
      box(1818, 816, 30, 30, 4.35, 0x9b9e89, 0, house, "stone");
    } else {
      // Log end braces, a chimney, stacked supplies and the watch's green banner.
      for (let course = 0; course < 7; course++) box(area.left + 1, y, 2, depth - 5, .055, 0x829074, .5 + course * .29, house);
      box(820, 550, 25, 25, 4.2, 0x7c8478, 0, house, "stone");
      for (const crateX of [803, 842]) {
        box(crateX, 611, 24, 23, .7, 0x907c50, 0, house, "wood");
        box(crateX, 611, 26, 25, .06, 0xafa078, .69, house, "wood");
      }
      box(1000, 605, 3, 3, 4.45, 0x6d5e41, 0, house, "wood");
      box(984, 605, 28, 1, .9, 0x506e60, 3.25, house);
      box(984, 606, 3, 1, .62, 0xd4c18e, 3.4, house);
    }
    // A flush paving apron marks the door without becoming an extra obstacle.
    box(doorX, building.y - 4, 64, 78, .025, 0xabb093, .025);
  }

  function resource(node: ResourceNodeDefinition): void {
    const available = new THREE.Group(), depleted = new THREE.Group();
    available.name = `${node.id}-available`; depleted.name = `${node.id}-depleted`; group.add(available, depleted);
    nodes.push({ id: node.id, available, depleted });
    const x = node.x, y = node.y - 12;
    if (node.resource === "wood") {
      vegetation.addResourceTree(x, y, "pine", available);
      round(x, y, 7, .35, 0x756044, 0, depleted);
      round(x, y, 6.6, .025, 0xbea477, .35, depleted);
    } else if (node.resource === "herb") {
      const stemShape = geometry(new THREE.CylinderGeometry(.015, .02, .38, 4));
      const stems = new THREE.InstancedMesh(stemShape, material(0x73915a), 8);
      const flowers = new THREE.InstancedMesh(rock, material(0xc1c5d5), 8);
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < 8; index++) {
        const angle = index * 2.399, reach = index % 2 ? 11 : 6;
        const px = (x + Math.cos(angle) * reach) * SCALE, pz = (node.y + Math.sin(angle) * reach) * SCALE;
        matrix.makeTranslation(px, .22, pz); stems.setMatrixAt(index, matrix);
        matrix.makeScale(.12, .07, .12); matrix.setPosition(px, .44, pz); flowers.setMatrixAt(index, matrix);
      }
      stems.computeBoundingSphere(); flowers.computeBoundingSphere(); available.add(stems, flowers);
      const remnant = round(x, node.y, 9, .025, 0x929b73, .015, depleted); remnant.scale.z *= .65;
    } else {
      const ore = node.resource === "ore";
      box(x, y - 2, 32, 16, .72, ore ? 0x727c7b : 0x969e8d, 0, available, "stone");
      const cap = mesh(rock, material(ore ? 0x727c7b : 0xa7ad9b), available);
      cap.position.set(x * SCALE, .73, (y - 2) * SCALE); cap.scale.set(16 * SCALE, .47, 8 * SCALE);
      if (ore) for (let index = 0; index < 3; index++) {
        const vein = box(x - 8 + index * 8, y + 6.3, 3, 1, .42, 0xc0a478, .25, available);
        vein.rotation.z = -.18 + index * .13;
      }
      box(x, y - 2, 28, 14, .13, 0x7d8475, 0, depleted, "stone");
      for (let index = 0; index < 3; index++) round(x - 8 + index * 8, y - 2 + index % 2 * 3, 3, .18, 0x9ca18c, .1, depleted);
    }
  }
  HIGHLAND_RESOURCE_NODES.forEach(resource);

  // Inlaid waystones identify the descent while preserving its entire approach.
  for (let index = 0; index < 4; index++) box(HIGHLAND_EXIT.x - 24 + index * 16, HIGHLAND_EXIT.y,
    12, 40 - Math.abs(index - 1.5) * 10, .04, 0xd0c4a2, .025);

  function update(next: GameState, timeSeconds: number): void {
    if (disposed) return;
    vegetation.update(timeSeconds); horizon?.update(next.minutes, weatherFor(next.day, next.minutes, "highlands"));
    for (const node of nodes) {
      const live = (next.frontier.resources[node.id]?.remaining ?? 1) > 0;
      node.available.visible = live; node.depleted.visible = !live;
    }
    for (const roof of buildingRoofs) {
      const near = Math.hypot(next.apostle.x - roof.x, next.apostle.y - roof.y) < 190;
      const opacity = near ? .45 : 1;
      if (roof.material.opacity !== opacity) {
        roof.material.opacity = opacity; roof.material.transparent = near; roof.material.depthWrite = !near; roof.material.needsUpdate = true;
      }
    }
  }
  update(state, 0);
  return { group, update,
    dispose() {
      if (disposed) return; disposed = true;
      vegetation.dispose(); horizon?.dispose();
      group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
      geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); surfaces.dispose();
      geometries.clear(); materials.clear(); materialCache.clear(); nodes.length = 0; buildingRoofs.length = 0; group.clear();
    },
  };
}

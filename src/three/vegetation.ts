import * as THREE from "three";
import { regionForZone, RESOURCE_NODES, WILDERNESS_ROADS } from "../regions";
import { ESTATE_DEFS } from "../territory-data";
import type { Point, Zone } from "../types";

const SCALE = 1 / 24;
const TAU = Math.PI * 2;

/** These are also the actual painted paths: vegetation and roads share one source. */
export const VILLAGE_LANDSCAPE_PATHS: Point[][] = [
  [[1260, 476], [1258, 630], [1256, 842]],
  [[1230, 1456], [1306, 1396], [1456, 1290]],
  [[408, 912], [580, 876], [776, 834], [1020, 828], [1256, 842], [1478, 872], [1882, 896]],
  [[710, 620], [730, 696], [776, 834]],
  [[1000, 1080], [1016, 952], [1020, 828]],
  [[1564, 660], [1510, 764], [1478, 872]],
  [[1640, 1100], [1606, 984], [1478, 872]],
  [[1282, 826], [1284, 940], [1392, 1090], [1456, 1290], [1698, 1446], [1950, 1570], [2170, 1660]],
  [[1882, 896], [1990, 752], [2116, 548], [2110, 340]],
  [[776, 834], [692, 1004], [616, 1236], [630, 1518], [816, 1906]],
  [[1900, 900], [1980, 840], [2090, 815]],
].map(path => path.map(([x, y]) => ({ x, y })));

const RIVER: Point[] = [[-120, 436], [102, 524], [244, 702], [388, 908], [320, 1130],
  [274, 1304], [406, 1554], [300, 1774], [136, 1980]].map(([x, y]) => ({ x, y }));

export type GroundCoverKind = "grass" | "flowers" | "ferns" | "shrubs" | "reeds";
type TreeKind = "oak" | "broadleaf" | "pine" | "willow";

function randomFrom(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function segmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function distanceToPath(point: Point, paths: Point[][]): number {
  let distance = Infinity;
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    distance = Math.min(distance, segmentDistance(point, path[i - 1], path[i]));
  }
  return distance;
}

function inRect(point: Point, left: number, top: number, right: number, bottom: number, margin: number): boolean {
  return point.x > left - margin && point.x < right + margin && point.y > top - margin && point.y < bottom + margin;
}

/** Logical-space reservation includes the complete footprint, plus a wind allowance. */
export function groundCoverAllowed(zone: "village" | "wilderness", point: Point, radius: number, kind: GroundCoverKind): boolean {
  const region = regionForZone(zone), margin = radius + 5;
  if (point.x < 38 + margin || point.y < 85 + margin || point.x > region.width - 38 - margin || point.y > region.height - 30 - margin) return false;
  const roads = zone === "village" ? VILLAGE_LANDSCAPE_PATHS : WILDERNESS_ROADS;
  if (distanceToPath(point, roads) < (zone === "village" ? 32 : 44) + margin) return false;
  if (region.solids.some(rect => inRect(point, rect.left, rect.top, rect.right, rect.bottom, margin + 8))) return false;
  // Work points and conversation fronts have a broad, clear apron even when a
  // building is not owned yet. These plants are never navigation obstacles.
  if (region.objects.some(object => Math.hypot(point.x - object.x, point.y - object.y - 23) <
    (object.kind === "portal" || object.kind === "cave" ? 90 : 57) + margin)) return false;
  if (RESOURCE_NODES.some(node => node.zone === zone && Math.hypot(point.x - node.x, point.y - node.y - 25) < 53 + margin)) return false;
  if (zone === "village") {
    if (inRect(point, 1780, 700, 2178, 920, margin)) return false; // crops, home and gate
    if (((point.x - 1156) / (221 + margin)) ** 2 + ((point.y - 812) / (99 + margin)) ** 2 < 1) return false;
    if (inRect(point, 280, 846, 490, 940, margin)) return false; // bridge and both landings
    const riverDistance = distanceToPath(point, [RIVER]);
    if (kind === "reeds") return riverDistance > 54 + margin && riverDistance < 110;
    if (riverDistance < 76 + margin) return false;
  } else {
    if (ESTATE_DEFS.some(estate => inRect(point, estate.x - estate.width / 2, estate.y - estate.height,
      estate.x + estate.width / 2, estate.y + 115, margin + 15))) return false;
    // Reserve the shoreline, leaving its south interaction point and the path open.
    if (kind === "reeds") return inRect(point, 2248, 1398, 2672, 1662, 0) &&
      !inRect(point, 2268, 1418, 2652, 1642, margin);
    if (inRect(point, 2248, 1398, 2672, 1662, margin)) return false;
  }
  return true;
}

/** Small unindexed geometry assembler; all intermediate primitives are released. */
class FoliageGeometry {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly flexibility: number[] = [];

  triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, root = 0): void {
    for (const point of [a, b, c]) {
      this.positions.push(point.x, point.y, point.z);
      this.colors.push(color.r, color.g, color.b);
      this.flexibility.push(Math.max(0, Math.min(1, (point.y - root) / .6)));
    }
  }

  primitive(geometry: THREE.BufferGeometry, position: THREE.Vector3, scale: THREE.Vector3,
    color: THREE.Color, rotation = new THREE.Quaternion(), foliage = true): void {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const attribute = flat.getAttribute("position"), matrix = new THREE.Matrix4().compose(position, rotation, scale);
    const point = new THREE.Vector3();
    for (let i = 0; i < attribute.count; i++) {
      point.fromBufferAttribute(attribute, i).applyMatrix4(matrix);
      this.positions.push(point.x, point.y, point.z);
      this.colors.push(color.r, color.g, color.b);
      this.flexibility.push(foliage ? Math.min(1, Math.max(0, point.y / 5)) : 0);
    }
    if (flat !== geometry) flat.dispose();
    geometry.dispose();
  }

  finish(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("aVegetationFlex", new THREE.Float32BufferAttribute(this.flexibility, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const green = (value: number): THREE.Color => new THREE.Color(value);

function branch(builder: FoliageGeometry, from: THREE.Vector3, to: THREE.Vector3, radius: number): void {
  const direction = to.clone().sub(from);
  const rotation = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), direction.clone().normalize());
  builder.primitive(new THREE.CylinderGeometry(.6, 1, 1, 6), from.clone().add(to).multiplyScalar(.5),
    v3(radius, direction.length(), radius), green(0x725537), rotation, false);
}

function branchesGeometry(): THREE.BufferGeometry {
  const geometry = new FoliageGeometry();
  // The forks begin above body height; their bases never add a second trunk.
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.399, reach = i % 2 ? 1.1 : .85;
    const from = v3(0, 1.45 + i * .13, 0);
    const fork = v3(Math.cos(angle) * reach, 2.7 + i * .15, Math.sin(angle) * reach);
    branch(geometry, from, fork, .11 - i * .008);
    branch(geometry, fork.clone().lerp(from, .2), fork.clone().add(v3(Math.sin(angle) * .45, .45, Math.cos(angle) * .45)), .045);
  }
  return geometry.finish();
}

function crownGeometry(kind: "oak" | "broadleaf" | "willow"): THREE.BufferGeometry {
  const geometry = new FoliageGeometry();
  const random = randomFrom(kind === "oak" ? 731 : kind === "willow" ? 311 : 997);
  const palette = kind === "willow" ? [0x7c965b, 0x8fa36a, 0x687e4e, 0x82995b]
    : kind === "oak" ? [0x5e7c49, 0x729153, 0x829b5b, 0x66864d]
    : [0x5b7d51, 0x72935d, 0x8ca26a, 0x688e57];
  const count = kind === "oak" ? 9 : 7;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.399 + .3, ring = i < count - 2;
    const reach = ring ? (kind === "oak" ? 1.05 : .77) + random() * .28 : .25;
    const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
    const y = kind === "willow" ? 3.0 + (ring ? -.2 + random() * .5 : .9)
      : kind === "oak" ? 3.05 + (ring ? random() * .65 : 1) : 3.2 + (ring ? random() * .8 : 1.25);
    const radius = .72 + random() * .28;
    const scale = kind === "willow" ? v3(radius, radius * 1.45, radius * .94)
      : v3(radius * (kind === "oak" ? 1.12 : .92), radius * .83, radius);
    geometry.primitive(new THREE.IcosahedronGeometry(1, 1), v3(x, y, z), scale, green(palette[i % palette.length]),
      new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), angle));
  }
  return geometry.finish();
}

const PINE_TIERS = [
  { y: 2.65, radius: 1.5, height: 2.8, color: 0x486e52 },
  { y: 3.65, radius: 1.12, height: 2.55, color: 0x567e59 },
  { y: 4.65, radius: .7, height: 2.2, color: 0x6b8d64 },
];

function pineGeometry(): THREE.BufferGeometry {
  const geometry = new FoliageGeometry();
  for (const [i, tier] of PINE_TIERS.entries()) {
    geometry.primitive(new THREE.ConeGeometry(1, 1, 9, 2), v3(0, tier.y, 0), v3(tier.radius, tier.height, tier.radius),
      green(tier.color), new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), i * .37));
  }
  return geometry.finish();
}

function blade(builder: FoliageGeometry, angle: number, length: number, width: number, lean: number, color: THREE.Color,
  root = v3(0, 0, 0)): void {
  const forward = v3(Math.cos(angle), 0, Math.sin(angle)), side = v3(-forward.z, 0, forward.x);
  const left = root.clone().addScaledVector(side, -width), right = root.clone().addScaledVector(side, width);
  const mid = root.clone().addScaledVector(forward, lean * .3).add(v3(0, length * .55, 0));
  const midLeft = mid.clone().addScaledVector(side, -width * .58), midRight = mid.clone().addScaledVector(side, width * .58);
  const tip = root.clone().addScaledVector(forward, lean).add(v3(0, length, 0));
  builder.triangle(left, right, midRight, color);
  builder.triangle(left, midRight, midLeft, color);
  builder.triangle(midLeft, midRight, tip, color.clone().multiplyScalar(1.1));
}

function grassGeometry(): THREE.BufferGeometry {
  const geometry = new FoliageGeometry();
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.399;
    blade(geometry, angle, .18 + (i % 4) * .045, .027 + (i % 2) * .01, .11 + (i % 3) * .055,
      green([0x779456, 0x88a261, 0x9aac70, 0x6b8953][i % 4]), v3(Math.cos(angle) * .075, 0, Math.sin(angle) * .075));
  }
  return geometry.finish();
}

function flowersGeometry(): THREE.BufferGeometry {
  const geometry = new FoliageGeometry();
  for (let stem = 0; stem < 3; stem++) {
    const angle = stem * 2.399, height = .29 + stem * .075;
    const root = v3(Math.cos(angle) * .13, 0, Math.sin(angle) * .13);
    blade(geometry, angle, height, .012, .055, green(0x769451), root);
    blade(geometry, angle + 1.3, height * .5, .045, .16, green(0x819d58), root);
    const center = root.clone().add(v3(Math.cos(angle) * .055, height, Math.sin(angle) * .055));
    const color = green(stem === 1 ? 0xd4b9c0 : 0xe5dfb4);
    for (let petal = 0; petal < 5; petal++) {
      const a = petal * TAU / 5, b = a + .8;
      geometry.triangle(center, center.clone().add(v3(Math.cos(a) * .085, .018, Math.sin(a) * .085)),
        center.clone().add(v3(Math.cos(b) * .085, .018, Math.sin(b) * .085)), color);
    }
    geometry.primitive(new THREE.IcosahedronGeometry(1, 0), center.clone().add(v3(0, .018, 0)), v3(.026, .025, .026), green(0xd5b960));
  }
  return geometry.finish();
}

function fernGeometry(): THREE.BufferGeometry {
  const geometry = new FoliageGeometry();
  for (let frond = 0; frond < 6; frond++) {
    const angle = frond * TAU / 6, forward = v3(Math.cos(angle), 0, Math.sin(angle)), side = v3(-forward.z, 0, forward.x);
    blade(geometry, angle, .3, .012, .35, green(0x739157));
    for (let leaf = 1; leaf <= 5; leaf++) {
      const t = leaf / 6, along = forward.clone().multiplyScalar(t * .43);
      along.y = Math.sin(t * 2) * .3;
      for (const sign of [-1, 1]) {
        const width = (1 - t) * .15;
        geometry.triangle(along.clone().addScaledVector(forward, -.05),
          along.clone().addScaledVector(side, width * sign).addScaledVector(forward, .08).add(v3(0, .025, 0)),
          along.clone().addScaledVector(forward, .09), green(frond % 2 ? 0x6e8c57 : 0x87a264));
      }
    }
  }
  return geometry.finish();
}

function shrubGeometry(): THREE.BufferGeometry {
  const geometry = new FoliageGeometry();
  for (let i = 0; i < 4; i++) {
    geometry.primitive(new THREE.IcosahedronGeometry(1, 0), v3(Math.cos(i * 2.399) * .23, .19 + (i % 2) * .09, Math.sin(i * 2.399) * .23),
      v3(.27, .2, .26), green([0x708754, 0x7f9660, 0x8da269, 0x697f50][i]));
  }
  return geometry.finish();
}

function reedsGeometry(): THREE.BufferGeometry {
  const geometry = new FoliageGeometry();
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.399, root = v3(Math.cos(angle) * .12, 0, Math.sin(angle) * .12);
    const height = .65 + (i % 3) * .09;
    blade(geometry, angle, height, .016, .08, green(0x81945c), root);
    blade(geometry, angle + .5, height * .7, .027, .26, green(0x9aa771), root);
    if (i % 2 === 0) geometry.primitive(new THREE.CylinderGeometry(1, 1, 1, 5),
      root.clone().add(v3(Math.cos(angle) * .08, height, Math.sin(angle) * .08)), v3(.028, .15, .028), green(0x806744));
  }
  return geometry.finish();
}

/** Region-local cache. Wind changes one uniform; no instance transforms change per frame. */
export class RegionVegetation {
  readonly group = new THREE.Group();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly batches: THREE.InstancedMesh[] = [];
  private readonly windTime = { value: 0 };
  private readonly crowns: Record<"oak" | "broadleaf" | "willow" | "pine", THREE.BufferGeometry>;
  private readonly branches: THREE.BufferGeometry;
  private readonly trunk: THREE.CylinderGeometry;
  private readonly resourceCone: THREE.ConeGeometry;
  private readonly bark: THREE.MeshStandardMaterial;
  private readonly leaves: THREE.MeshStandardMaterial;
  private readonly pineLeaves: THREE.MeshStandardMaterial;
  private disposed = false;

  constructor(readonly zone: "village" | "wilderness") {
    this.group.name = "living-vegetation";
    this.group.userData.presentationOnly = true;
    this.crowns = { oak: this.geometry(crownGeometry("oak")), broadleaf: this.geometry(crownGeometry("broadleaf")),
      willow: this.geometry(crownGeometry("willow")), pine: this.geometry(pineGeometry()) };
    this.branches = this.geometry(branchesGeometry());
    this.trunk = this.geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
    this.resourceCone = this.geometry(new THREE.ConeGeometry(1, 1, 9, 2));
    const flex = Array.from(this.resourceCone.getAttribute("position").array).filter((_, index) => index % 3 === 1).map(y => Math.max(0, y + .5));
    this.resourceCone.setAttribute("aVegetationFlex", new THREE.Float32BufferAttribute(flex, 1));
    this.bark = this.material({ color: 0x644a32, vertexColors: false });
    // Bark forks carry their own authored vertex colors; trunks keep one palette.
    this.leaves = this.material({ vertexColors: true }, .045);
    this.pineLeaves = this.material({ vertexColors: false, color: 0x567e59 }, .025);
    this.forest();
    this.meadows();
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }

  private material(parameters: THREE.MeshStandardMaterialParameters = {}, amplitude = 0): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .96, metalness: 0,
      flatShading: true, ...parameters });
    this.materials.add(material);
    if (amplitude > 0) {
      material.userData.landscapeWind = { time: this.windTime, amplitude };
      material.onBeforeCompile = shader => {
        shader.uniforms.uLandscapeTime = this.windTime;
        shader.vertexShader = `uniform float uLandscapeTime;\nattribute float aVegetationFlex;\n${shader.vertexShader}`;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
          vec3 landscapeOrigin = vec3(0.0);
          #ifdef USE_INSTANCING
            landscapeOrigin = instanceMatrix[3].xyz;
          #endif
          float landscapePhase = uLandscapeTime * 1.15 + landscapeOrigin.x * 0.31 + landscapeOrigin.z * 0.27;
          float landscapeBend = sin(landscapePhase) * 0.72 + sin(landscapePhase * 1.73 + 0.8) * 0.28;
          transformed.x += landscapeBend * ${amplitude.toFixed(4)} * aVegetationFlex;
          transformed.z += cos(landscapePhase * 0.83) * ${(amplitude * .45).toFixed(4)} * aVegetationFlex;
        `);
      };
      material.customProgramCacheKey = () => `landscape-wind-v1-${amplitude}`;
    }
    return material;
  }

  private batch(name: string, geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.userData.vegetationOwned = true;
    mesh.userData.presentationOnly = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.batches.push(mesh);
    return mesh;
  }

  private forest(): void {
    const decor = regionForZone(this.zone).decor;
    const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = v3(1, 1, 1), position = v3(0, 0, 0);
    const trunks = this.batch("forest-trunks", this.trunk, this.bark, decor.length);
    trunks.castShadow = true;
    decor.forEach((item, i) => {
      const s = item.scale ?? 1;
      // These centres, radii and bases are identical to the original forest and navigation.
      position.set((item.x + s) * SCALE, 1.15 * s, (item.y - 12 * s) * SCALE);
      scale.set(7 * s * SCALE, 2.3 * s, 7 * s * SCALE);
      matrix.compose(position, rotation, scale); trunks.setMatrixAt(i, matrix);
      trunks.setColorAt(i, green(i % 3 ? 0xf0e5d5 : 0xd8c4a8));
    });
    const broadleafItems = decor.filter(item => item.key !== "pine");
    const forks = this.batch("forest-branches", this.branches, this.material({ vertexColors: true }), broadleafItems.length);
    const forestKinds = ["oak", "broadleaf", "pine"] as const;
    for (const kind of forestKinds) {
      const items = decor.filter(item => kind === "pine" ? item.key === "pine" : kind === "broadleaf" ? item.key === "tree2" : item.key !== "pine" && item.key !== "tree2");
      const crowns = this.batch(`forest-${kind}-crowns`, this.crowns[kind], this.leaves, items.length);
      crowns.castShadow = false; // no extra animated global shadow pass
      items.forEach((item, i) => {
        const s = item.scale ?? 1;
        const angle = ((item.x * 13 + item.y * 7) % 628) / 100;
        rotation.setFromAxisAngle(v3(0, 1, 0), angle);
        position.set((item.x + s) * SCALE, 0, (item.y - 12 * s) * SCALE);
        scale.set(s * (.93 + (i % 3) * .045), s, s * (.94 + (i % 4) * .035));
        matrix.compose(position, rotation, scale); crowns.setMatrixAt(i, matrix);
        crowns.setColorAt(i, green([0xffffff, 0xf2ebd2, 0xdce9d5, 0xe8edca][i % 4]));
      });
    }
    broadleafItems.forEach((item, i) => {
      const s = item.scale ?? 1;
      rotation.setFromAxisAngle(v3(0, 1, 0), ((item.x * 13 + item.y * 7) % 628) / 100);
      position.set((item.x + s) * SCALE, 0, (item.y - 12 * s) * SCALE);
      scale.setScalar(s); matrix.compose(position, rotation, scale); forks.setMatrixAt(i, matrix);
    });
    for (const batch of this.batches) { batch.computeBoundingSphere(); batch.computeBoundingBox(); }
  }

  private meadows(): void {
    const region = regionForZone(this.zone), random = randomFrom(this.zone === "village" ? 87321 : 100153);
    const definitions: { kind: GroundCoverKind; geometry: () => THREE.BufferGeometry; budget: number; radius: number; amplitude: number }[] = [
      { kind: "grass", geometry: grassGeometry, budget: this.zone === "village" ? 2300 : 3400, radius: 10, amplitude: .075 },
      { kind: "flowers", geometry: flowersGeometry, budget: this.zone === "village" ? 340 : 440, radius: 9, amplitude: .045 },
      { kind: "ferns", geometry: fernGeometry, budget: this.zone === "village" ? 220 : 380, radius: 14, amplitude: .04 },
      { kind: "shrubs", geometry: shrubGeometry, budget: this.zone === "village" ? 150 : 220, radius: 16, amplitude: .025 },
      { kind: "reeds", geometry: reedsGeometry, budget: this.zone === "village" ? 170 : 120, radius: 10, amplitude: .09 },
    ];
    const matrix = new THREE.Matrix4(), position = v3(0, 0, 0), rotation = new THREE.Quaternion(), scale = v3(1, 1, 1);
    for (const { kind, geometry, budget, radius, amplitude } of definitions) {
      const material = this.material({ vertexColors: true, side: THREE.DoubleSide }, amplitude);
      const batch = this.batch(`meadow-${kind}`, this.geometry(geometry()), material, budget);
      batch.userData.groundCoverKind = kind;
      batch.userData.footprintRadius = radius;
      batch.userData.instanceBudget = budget;
      // Loose clusters leave uncut quiet spaces instead of a uniform confetti field.
      let count = 0;
      const centers = Array.from({ length: kind === "reeds" ? 0 : this.zone === "village" ? 170 : 260 }, () =>
        ({ x: 45 + random() * (region.width - 90), y: 95 + random() * (region.height - 140), radius: 30 + random() * 75 }));
      for (let attempt = 0; count < budget && attempt < budget * 60; attempt++) {
        const center = centers.length ? centers[Math.floor(random() * centers.length)] : null;
        let point: Point;
        if (kind === "reeds" && this.zone === "village") {
          const segment = Math.floor(random() * (RIVER.length - 1)), a = RIVER[segment], b = RIVER[segment + 1];
          const fraction = random(), length = Math.hypot(b.x - a.x, b.y - a.y), side = random() < .5 ? -1 : 1;
          const distance = 80 + random() * 22;
          point = { x: a.x + (b.x - a.x) * fraction - (b.y - a.y) / length * distance * side,
            y: a.y + (b.y - a.y) * fraction + (b.x - a.x) / length * distance * side };
        } else if (kind === "reeds") {
          const side = Math.floor(random() * 4);
          point = side < 2 ? { x: 2248 + random() * 424, y: side ? 1660 : 1400 }
            : { x: side === 2 ? 2250 : 2670, y: 1398 + random() * 264 };
        } else {
          const angle = random() * TAU, distance = Math.sqrt(random()) * center!.radius;
          point = { x: center!.x + Math.cos(angle) * distance, y: center!.y + Math.sin(angle) * distance };
        }
        if (!groundCoverAllowed(this.zone, point, radius, kind)) continue;
        // Flower drifts favour open sunny ground; ferns and shrubs collect by old trunks.
        if (kind === "ferns" || kind === "shrubs") {
          const nearTree = region.decor.some(item => Math.hypot(item.x - point.x, item.y - point.y) < (kind === "ferns" ? 110 : 145));
          if (!nearTree) continue;
        }
        const size = .7 + random() * .38;
        scale.set(size, kind === "shrubs" ? Math.min(size, 1) : size, size);
        rotation.setFromAxisAngle(v3(0, 1, 0), random() * TAU);
        position.set(point.x * SCALE, .012, point.y * SCALE);
        matrix.compose(position, rotation, scale); batch.setMatrixAt(count, matrix);
        batch.setColorAt(count, green([0xffffff, 0xedeccf, 0xe0ead8, 0xf4efd9][Math.floor(random() * 4)]));
        count++;
      }
      batch.count = count;
      batch.computeBoundingSphere(); batch.computeBoundingBox();
    }
  }

  /** Harvestable trees share crown/branch assets with the forest, retaining their own live group. */
  addResourceTree(x: number, y: number, kind: TreeKind, parent: THREE.Group): void {
    if (this.disposed) return;
    const tree = new THREE.Group(); tree.name = `resource-${kind}-tree`;
    tree.position.set(x * SCALE, 0, y * SCALE);
    tree.userData.presentationOnly = true;
    parent.add(tree);
    const trunk = new THREE.Mesh(this.trunk, this.bark);
    trunk.name = "resource-trunk";
    trunk.position.y = 1.125; trunk.scale.set(7 * SCALE, 2.25, 7 * SCALE); trunk.castShadow = true; tree.add(trunk);
    if (kind === "pine") {
      for (const [i, tier] of PINE_TIERS.entries()) {
        // Separate original ConeGeometry tiers also keep conifers recognizable in depletion QA.
        const material = i === 1 ? this.pineLeaves : this.material({ color: tier.color }, .025);
        const crown = new THREE.Mesh(this.resourceCone, material);
        crown.name = `resource-pine-tier-${i}`;
        crown.position.y = tier.y; crown.scale.set(tier.radius, tier.height, tier.radius); crown.rotation.y = i * .37;
        tree.add(crown);
      }
    } else {
      const forks = new THREE.Mesh(this.branches, this.material({ vertexColors: true }));
      forks.name = "resource-branches"; tree.add(forks);
      const crown = new THREE.Mesh(this.crowns[kind], this.leaves);
      crown.name = `resource-${kind}-crown`; tree.add(crown);
    }
  }

  update(timeSeconds: number): void {
    if (!this.disposed && Number.isFinite(timeSeconds)) this.windTime.value = Math.max(0, timeSeconds) % (TAU * 1000);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.batches.forEach(batch => batch.dispose());
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.batches.length = 0; this.geometries.clear(); this.materials.clear(); this.group.clear();
  }
}

export function createRegionVegetation(zone: Zone): RegionVegetation | undefined {
  return zone === "village" || zone === "wilderness" ? new RegionVegetation(zone) : undefined;
}

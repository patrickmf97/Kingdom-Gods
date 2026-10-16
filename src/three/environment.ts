import * as THREE from "three";
import { regionForZone, RESOURCE_NODES, WILDERNESS_ROADS, type Rectangle } from "../regions";
import { ESTATE_DEFS, estateSolid } from "../territory-data";
import type { GameState, Point, Zone } from "../types";

/** Presentation only. Navigation and interactions keep their existing logical coordinates. */
export interface RegionEnvironment {
  group: THREE.Group;
  update(state: GameState, timeSeconds: number): void;
  dispose(): void;
}

const SCALE = 1 / 24;
const PALETTE = {
  grass: 0x789568, grassLight: 0x8ba574, grassDark: 0x6e895e,
  timber: 0x57402e, wood: 0x967244, woodLight: 0xbe9960,
  cream: 0xdfcfaa, creamShade: 0xcbb891, stone: 0x929385,
  stoneLight: 0xb8b7a0, stoneDark: 0x626f65, roof: 0x985d46,
  slate: 0x4f716e, road: 0xd1be96, roadEdge: 0xad9e7b,
  water: 0x548f91, leaf: 0x52784c, leafLight: 0x6e9258,
};

type FadeEntry = { x: number; y: number; radius: number; materials: THREE.MeshStandardMaterial[] };
type Flame = { mesh: THREE.Mesh; seed: number };
type NodeVisual = { id: string; live: THREE.Group; depleted: THREE.Group };

function seeded(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

/** All caches belong to one active region and are released together. */
class EnvironmentBuilder {
  readonly group = new THREE.Group();
  readonly geometries = new Set<THREE.BufferGeometry>();
  readonly materials = new Set<THREE.Material>();
  readonly cache = new Map<string, THREE.MeshStandardMaterial>();
  readonly fades: FadeEntry[] = [];
  readonly flames: Flame[] = [];
  readonly waters: THREE.MeshStandardMaterial[] = [];
  readonly nodes: NodeVisual[] = [];
  readonly mills: THREE.Group[] = [];
  readonly boxGeometry: THREE.BoxGeometry;
  readonly sphereGeometry: THREE.IcosahedronGeometry;
  readonly cylinderGeometry: THREE.CylinderGeometry;
  readonly coneGeometry: THREE.ConeGeometry;
  readonly roofGeometry: THREE.BufferGeometry;
  readonly dynamic = new THREE.Group();
  private dynamicSignature = "";
  private disposed = false;

  constructor(readonly zone: Zone) {
    this.group.name = `environment-${zone}`;
    this.boxGeometry = this.geometry(new THREE.BoxGeometry(1, 1, 1));
    this.sphereGeometry = this.geometry(new THREE.IcosahedronGeometry(1, 0));
    this.cylinderGeometry = this.geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
    this.coneGeometry = this.geometry(new THREE.ConeGeometry(1, 1, 7));
    // A gabled roof, ridge along X, with flat-shaded triangular end faces.
    const roof = new THREE.BufferGeometry();
    const positions = [
      -.5, 0, -.5, -.5, 0, .5, -.5, 1, 0,
      .5, 0, .5, .5, 0, -.5, .5, 1, 0,
      -.5, 0, .5, .5, 0, .5, .5, 1, 0, -.5, 0, .5, .5, 1, 0, -.5, 1, 0,
      .5, 0, -.5, -.5, 0, -.5, -.5, 1, 0, .5, 0, -.5, -.5, 1, 0, .5, 1, 0,
      -.5, 0, -.5, .5, 0, -.5, .5, 0, .5, -.5, 0, -.5, .5, 0, .5, -.5, 0, .5,
    ];
    roof.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    roof.computeVertexNormals();
    this.roofGeometry = this.geometry(roof);
    this.group.add(this.dynamic);
  }

  geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  material(color: THREE.ColorRepresentation, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const key = `${color}:${JSON.stringify(options)}`;
    let material = this.cache.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: .93, metalness: 0, flatShading: true, ...options });
      this.cache.set(key, material);
      this.materials.add(material);
    }
    return material;
  }

  private fadingMaterial(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .9, flatShading: true, transparent: true, opacity: 1 });
    this.materials.add(material);
    return material;
  }

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = this.group): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  box(x: number, y: number, width: number, depth: number, height: number,
    color: THREE.ColorRepresentation | THREE.Material, base = 0, parent: THREE.Object3D = this.group): THREE.Mesh {
    const material = color instanceof THREE.Material ? color : this.material(color);
    const mesh = this.mesh(this.boxGeometry, material, parent);
    mesh.position.set(x * SCALE, base + height / 2, y * SCALE);
    mesh.scale.set(width * SCALE, height, depth * SCALE);
    return mesh;
  }

  cylinder(x: number, y: number, radius: number, height: number,
    color: THREE.ColorRepresentation | THREE.Material, base = 0, parent: THREE.Object3D = this.group): THREE.Mesh {
    const material = color instanceof THREE.Material ? color : this.material(color);
    const mesh = this.mesh(this.cylinderGeometry, material, parent);
    mesh.position.set(x * SCALE, base + height / 2, y * SCALE);
    mesh.scale.set(radius * SCALE, height, radius * SCALE);
    return mesh;
  }

  floorRect(area: Rectangle, color: THREE.ColorRepresentation, y = -.015): void {
    this.box((area.left + area.right) / 2, (area.top + area.bottom) / 2,
      area.right - area.left, area.bottom - area.top, .03, color, y - .03);
  }

  /** One merged mesh for an entire path network, with rounded joins. */
  ribbon(paths: Point[][], width: number, color: THREE.ColorRepresentation, height = .005): THREE.Mesh {
    const vertices: number[] = [];
    const tri = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number) => {
      vertices.push(ax * SCALE, height, az * SCALE, bx * SCALE, height, bz * SCALE, cx * SCALE, height, cz * SCALE);
    };
    for (const path of paths) {
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.y - a.y);
        if (!length) continue;
        const nx = -(b.y - a.y) / length * width / 2, nz = (b.x - a.x) / length * width / 2;
        tri(a.x + nx, a.y + nz, b.x + nx, b.y + nz, b.x - nx, b.y - nz);
        tri(a.x + nx, a.y + nz, b.x - nx, b.y - nz, a.x - nx, a.y - nz);
      }
      for (const p of path) {
        for (let i = 0; i < 12; i++) {
          const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6;
          tri(p.x, p.y, p.x + Math.cos(a) * width / 2, p.y + Math.sin(a) * width / 2,
            p.x + Math.cos(b) * width / 2, p.y + Math.sin(b) * width / 2);
        }
      }
    }
    const geometry = this.geometry(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = this.mesh(geometry, this.material(color, { side: THREE.DoubleSide }));
    mesh.castShadow = false;
    return mesh;
  }

  terrain(): void {
    const region = regionForZone(this.zone);
    const outside = this.zone === "village" || this.zone === "wilderness";
    this.floorRect({ left: 0, right: region.width, top: 0, bottom: region.height },
      outside ? PALETTE.grass : this.zone === "mine" ? 0x303c37 : 0x4d594c);
    if (!outside) return;
    // Instanced low flat patches break up the ground without texture downloads.
    const random = seeded(this.zone === "village" ? 87321 : 100153);
    const count = this.zone === "village" ? 165 : 250;
    const patches = new THREE.InstancedMesh(this.cylinderGeometry, this.material(PALETTE.grassLight), count);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      position.set(random() * region.width * SCALE, -.005, random() * region.height * SCALE);
      scale.set(1 + random() * 2.4, .008, .6 + random() * 1.5);
      matrix.compose(position, rotation, scale);
      patches.setMatrixAt(i, matrix);
      patches.setColorAt(i, new THREE.Color(i % 3 ? PALETTE.grassLight : PALETTE.grassDark));
    }
    patches.receiveShadow = true;
    patches.computeBoundingSphere();
    this.group.add(patches);
  }

  house(area: Rectangle, roofColor: number, options: { height?: number; kind?: string; parent?: THREE.Group } = {}): THREE.Group {
    const { height = 3.1, kind = "house", parent = this.group } = options;
    const group = new THREE.Group();
    group.name = kind;
    parent.add(group);
    const x = (area.left + area.right) / 2, y = (area.top + area.bottom) / 2;
    const width = area.right - area.left, depth = area.bottom - area.top;
    const walls = this.fadingMaterial(kind === "forge" ? PALETTE.stone : PALETTE.cream);
    const roof = this.fadingMaterial(roofColor);
    const timber = this.fadingMaterial(PALETTE.timber);
    this.box(x, y, width, depth, .3, PALETTE.stoneDark, 0, group);
    this.box(x, y, width, depth, height - .3, walls, .3, group);
    for (const sideX of [area.left + 2, area.right - 2]) {
      this.box(sideX, y, 4, depth + 1, height, timber, 0, group);
    }
    this.box(x, area.bottom + .2, width, 2.5, .16, timber, height * .56, group);
    this.box(x, area.bottom + .3, 4, 3, height, timber, 0, group);
    const roofMesh = this.mesh(this.roofGeometry, roof, group);
    roofMesh.position.set(x * SCALE, height - .03, y * SCALE);
    roofMesh.scale.set((width + 18) * SCALE, 1.55, (depth + 20) * SCALE);
    // Door and windows are attached to the actual solid face; the approach stays dry and clear.
    this.box(x + width * .12, area.bottom + .8, Math.min(23, width * .22), 1.5, 1.85,
      0x6e5034, .03, group);
    this.box(x + width * .12 + 7, area.bottom + 2, 2, 2, .08, 0xd9bc73, .95, group);
    for (const offset of [-.29, .32]) {
      const windowX = x + width * offset;
      if (Math.abs(windowX - (x + width * .12)) < 18) continue;
      this.box(windowX, area.bottom + 1, Math.min(18, width * .18), 2, 1.0, timber, 1.2, group);
      const pane = this.material(0xf3d593, { emissive: 0xbd8c43, emissiveIntensity: .32 });
      this.box(windowX, area.bottom + 2.1, Math.min(14, width * .14), 1, .76, pane, 1.3, group);
      this.box(windowX, area.bottom + 2.8, 1.5, 1, .8, timber, 1.28, group);
      this.box(windowX, area.bottom + 3, Math.min(16, width * .15), 1, .07, timber, 1.65, group);
    }
    this.box(area.right - width * .18, y - depth * .15, 13, 15, 1.75, PALETTE.stone, height + .65, group);
    this.box(area.right - width * .18, y - depth * .15, 17, 19, .2, PALETTE.stoneLight, height + 2.3, group);
    this.fades.push({ x, y, radius: Math.max(width, depth) / 2 + 38, materials: [walls, roof, timber] });
    return group;
  }

  forest(): void {
    const decor = regionForZone(this.zone).decor;
    if (!decor.length) return;
    const trunk = new THREE.InstancedMesh(this.cylinderGeometry, this.material(PALETTE.timber), decor.length);
    const roundItems = decor.filter(item => item.key !== "pine");
    const pineItems = decor.filter(item => item.key === "pine");
    const crowns = new THREE.InstancedMesh(this.sphereGeometry, this.material(PALETTE.leaf), roundItems.length);
    const upper = new THREE.InstancedMesh(this.sphereGeometry, this.material(PALETTE.leafLight), roundItems.length);
    const pines = new THREE.InstancedMesh(this.coneGeometry, this.material(0x466c51), pineItems.length);
    const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion();
    decor.forEach((item, i) => {
      const scale = item.scale ?? 1;
      // Trunk bases are the same centres and radii used by navigation.
      p.set((item.x + scale) * SCALE, 1.15 * scale, (item.y - 12 * scale) * SCALE);
      s.set(7 * scale * SCALE, 2.3 * scale, 7 * scale * SCALE);
      matrix.compose(p, q, s); trunk.setMatrixAt(i, matrix);
    });
    roundItems.forEach((item, i) => {
      const scale = item.scale ?? 1;
      p.set(item.x * SCALE, 3.0 * scale, (item.y - 12 * scale) * SCALE);
      s.set(1.8 * scale, 1.65 * scale, 1.55 * scale);
      matrix.compose(p, q, s); crowns.setMatrixAt(i, matrix);
      crowns.setColorAt(i, new THREE.Color(i % 3 ? 0x65854e : 0x52774e));
      p.x -= .22 * scale; p.y += .92 * scale; p.z -= .15 * scale;
      s.set(1.43 * scale, 1.08 * scale, 1.2 * scale);
      matrix.compose(p, q, s); upper.setMatrixAt(i, matrix);
    });
    pineItems.forEach((item, i) => {
      const scale = item.scale ?? 1;
      p.set(item.x * SCALE, 3.3 * scale, (item.y - 12 * scale) * SCALE);
      s.set(1.5 * scale, 4.5 * scale, 1.5 * scale);
      matrix.compose(p, q, s); pines.setMatrixAt(i, matrix);
    });
    for (const mesh of [trunk, crowns, upper, pines]) {
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere();
      this.group.add(mesh);
    }
  }

  flame(x: number, y: number, base: number, parent: THREE.Object3D = this.group): void {
    const fire = this.mesh(this.coneGeometry, this.material(0xffc56c,
      { emissive: 0xe88832, emissiveIntensity: 1.3 }), parent);
    fire.position.set(x * SCALE, base + .3, y * SCALE);
    fire.scale.set(.18, .65, .18);
    this.flames.push({ mesh: fire, seed: x * .1 + y * .7 });
  }

  torch(x: number, y: number, base = 1.2): void {
    this.box(x, y, 4, 4, .55, PALETTE.timber, base - .4);
    this.box(x, y, 9, 9, .15, 0x5c5143, base + .05);
    this.flame(x, y, base + .15);
  }

  portal(x: number, y: number, interior = false): void {
    this.box(x, y + 2, interior ? 86 : 66, 28, .045, interior ? 0xb19c73 : PALETTE.road, .018);
    if (interior) {
      this.box(x - 45, y + 6, 10, 12, 2.5, PALETTE.timber);
      this.box(x + 45, y + 6, 10, 12, 2.5, PALETTE.timber);
      this.box(x, y + 6, 100, 12, .2, PALETTE.timber, 2.4);
    } else {
      // Wayfinding posts sit to the side of the traversable threshold.
      this.box(x + 43, y - 12, 4, 4, 1.5, PALETTE.wood);
      this.box(x + 43, y - 12, 35, 4, .35, PALETTE.woodLight, 1.12);
    }
  }

  resources(): void {
    for (const node of RESOURCE_NODES.filter(node => node.zone === this.zone)) {
      const live = new THREE.Group(), depleted = new THREE.Group();
      live.name = `${node.id}-available`; depleted.name = `${node.id}-depleted`;
      this.group.add(live, depleted);
      const x = node.x, y = node.y - 12;
      if (node.kind === "resource") {
        this.cylinder(x, y, 7, .35, PALETTE.wood, 0, depleted);
        this.cylinder(x, y, 7.6, .06, PALETTE.woodLight, .35, depleted);
        this.cylinder(x, y, 7, 2.25, PALETTE.timber, 0, live);
        for (let i = 0; i < 3; i++) {
          const crown = this.mesh(this.sphereGeometry, this.material(i === 1 ? PALETTE.leafLight : PALETTE.leaf), live);
          crown.position.set(x * SCALE + (i - 1) * .6, 3 + (i % 2) * .8, y * SCALE);
          crown.scale.set(1.7, 1.5, 1.6);
        }
        // Fallen branches at the base make the starter resource readable too.
        for (let i = 0; i < 2; i++) {
          const log = this.box(x + 8 + i * 7, y + 17, 24, 6, .17, PALETTE.wood, .03, live);
          log.rotation.y = .4 + i * .5;
        }
      } else if (node.kind === "herb") {
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3;
          const plant = this.mesh(this.coneGeometry, this.material(i % 2 ? 0x719b5d : 0x486f48), live);
          plant.position.set((x + Math.cos(angle) * 10) * SCALE, .3, (y + Math.sin(angle) * 8) * SCALE);
          plant.scale.set(.14, .6, .18);
          const flower = this.mesh(this.sphereGeometry, this.material(0xd7c0bd), live);
          flower.position.copy(plant.position); flower.position.y += .25; flower.scale.setScalar(.095);
        }
        this.cylinder(x, y, 12, .035, 0x5c784d, .01, depleted);
      } else {
        for (let i = 0; i < 3; i++) {
          const rock = this.mesh(this.sphereGeometry, this.material(i % 2 ? 0x8d9287 : 0x737f75), live);
          rock.position.set((x + (i - 1) * 8) * SCALE, .32 + (i % 2) * .14, (y + (i % 2) * 4) * SCALE);
          rock.scale.set(.48, .48 + (i % 2) * .2, .4);
          rock.rotation.set(i * .3, i * 2, i * .2);
        }
        this.box(x, y, 29, 15, .2, 0x56635c, 0, depleted);
        if (node.kind === "ore") {
          const metal = this.material(0xc2b59b, { metalness: .52, roughness: .45 });
          for (let i = 0; i < 4; i++) {
            const crystal = this.mesh(this.sphereGeometry, metal, live);
            crystal.position.set((x - 10 + i * 6) * SCALE, .65 + (i % 2) * .2, (y + 5) * SCALE);
            crystal.scale.set(.14, .25, .13);
          }
        }
      }
      this.nodes.push({ id: node.id, live, depleted });
    }
  }

  village(): void {
    const paths = [
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
    this.ribbon(paths, 54, PALETTE.roadEdge, .003);
    this.ribbon(paths, 44, PALETTE.road, .012);
    // The village plaza is traversable paving, not a raised obstacle.
    const plaza = this.cylinder(1156, 812, 215, .025, 0xbdb498, .005);
    plaza.scale.z *= .4;
    this.paving({ left: 950, right: 1360, top: 740, bottom: 880 }, 36, 24, 0xc9c1a8, true);
    const river = [[-120, 436], [102, 524], [244, 702], [388, 908], [320, 1130],
      [274, 1304], [406, 1554], [300, 1774], [136, 1980]].map(([x, y]) => ({ x, y }));
    this.ribbon([river], 126, 0xb6b08d, .021);
    const water = this.ribbon([river], 94, PALETTE.water, .029);
    const waterMat = water.material as THREE.MeshStandardMaterial;
    waterMat.roughness = .35; waterMat.metalness = .15; this.waters.push(waterMat);
    this.bridge();
    const solids = regionForZone("village").solids;
    this.house(solids[0], PALETTE.roof, { height: 3.8, kind: "orphanage" });
    this.house(solids[1], 0x9e5941, { height: 3.45, kind: "inn" });
    this.house(solids[2], 0xa7664c, { height: 2.8 });
    this.house(solids[3], PALETTE.slate, { height: 3.05, kind: "forge" });
    this.house(solids[6], PALETTE.roof, { height: 2.65, kind: "bakery" });
    this.box(1293.5, 1368, 38, 60, 1.8, PALETTE.stone, 0);
    this.box(1293.5, 1398.6, 22, 1.5, 1.1, 0x3e3c32, .05);
    this.flame(1293.5, 1400, .2);
    this.flame(1526, 650, .9);
    this.mill(solids[4]);
    this.market();
    this.well();
    // Crypt front is painted onto its exact solid north of the interaction point.
    const crypt = solids[13];
    this.box((crypt.left + crypt.right) / 2, (crypt.top + crypt.bottom) / 2,
      crypt.right - crypt.left, crypt.bottom - crypt.top, 3.0, PALETTE.stoneDark);
    this.box(2110, crypt.bottom + 1, 45, 2, 2.3, 0x263b35, 0);
    this.box(2110, 278, 16, 14, .22, PALETTE.stoneLight, 3.0);
    this.box(2110, 278, 6, 7, .9, PALETTE.stoneLight, 3.0);
    this.torch(2071, 320, 1.45); this.torch(2149, 320, 1.45);
    this.noticeboard();
    // Fences use their actual thin wall rectangles. Farm gate stays open.
    for (const index of [16, 17, 19, 20, 21, 22, 23]) this.fenceRect(solids[index]);
    this.house(solids[18], PALETTE.slate, { height: 1.7, kind: "farm-shed" });
    this.floorRect({ left: 1802, right: 2002, top: 748, bottom: 856 }, 0x866847, .016);
    for (let row = 0; row < 6; row++) this.box(1900, 756 + row * 17, 184, 5, .028, 0x6d573d, .026);
    this.portal(2170, 1660);
  }

  paving(area: Rectangle, stepX: number, stepY: number, color: number, oval = false): void {
    const positions: { x: number; y: number }[] = [];
    const centerX = (area.left + area.right) / 2, centerY = (area.top + area.bottom) / 2;
    for (let y = area.top; y < area.bottom; y += stepY) for (let x = area.left; x < area.right; x += stepX) {
      if (oval && ((x - centerX) / ((area.right - area.left) / 2)) ** 2 + ((y - centerY) / ((area.bottom - area.top) / 2)) ** 2 > .9) continue;
      positions.push({ x: x + ((y / stepY) % 2 ? stepX * .3 : 0), y });
    }
    const tiles = new THREE.InstancedMesh(this.boxGeometry, this.material(color), positions.length);
    const matrix = new THREE.Matrix4();
    positions.forEach((p, i) => {
      matrix.makeScale((stepX - 3) * SCALE, .018, (stepY - 3) * SCALE);
      matrix.setPosition(p.x * SCALE, .04, p.y * SCALE); tiles.setMatrixAt(i, matrix);
      tiles.setColorAt(i, new THREE.Color(color).multiplyScalar(.93 + (i % 4) * .035));
    });
    tiles.receiveShadow = true; tiles.computeBoundingSphere(); this.group.add(tiles);
  }

  bridge(): void {
    this.box(385, 893, 200, 74, .18, PALETTE.wood, .04);
    for (let x = 290; x < 484; x += 12) this.box(x, 893, 1.5, 72, .012, PALETTE.timber, .223);
    for (const y of [856, 930]) {
      this.box(385, y, 200, 3.5, .12, PALETTE.woodLight, .78);
      this.box(385, y, 200, 3, .1, PALETTE.wood, .42);
      for (let x = 287; x <= 485; x += 33) this.box(x, y, 5, 5, 1.0, PALETTE.woodLight, .04);
    }
  }

  mill(area: Rectangle): void {
    const x = (area.left + area.right) / 2, y = (area.top + area.bottom) / 2;
    this.box(x, y, area.right - area.left, area.bottom - area.top, 4.3, PALETTE.stone);
    const roof = this.mesh(this.coneGeometry, this.material(PALETTE.roof));
    roof.position.set(x * SCALE, 5.0, y * SCALE); roof.scale.set(2.4, 1.65, 2.8);
    this.box(x, area.bottom + 1, 22, 2, 1.9, PALETTE.timber, 0);
    const rotor = new THREE.Group();
    rotor.position.set(x * SCALE, 3.75, (area.bottom + 6) * SCALE);
    this.group.add(rotor);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; rotor.add(arm);
      const strut = this.mesh(this.boxGeometry, this.material(PALETTE.timber), arm);
      strut.position.set(0, 1.4, 0); strut.scale.set(.1, 2.9, .1);
      const sail = this.mesh(this.boxGeometry, this.material(0xe8d9b0), arm);
      sail.position.set(.32, 1.83, .02); sail.scale.set(.63, 1.65, .05);
      for (let j = 0; j < 4; j++) {
        const brace = this.mesh(this.boxGeometry, this.material(PALETTE.wood), arm);
        brace.position.set(.3, 1.12 + j * .46, .06); brace.scale.set(.65, .035, .035);
      }
    }
    const hub = this.mesh(this.sphereGeometry, this.material(PALETTE.woodLight), rotor); hub.scale.setScalar(.25);
    this.mills.push(rotor);
    this.cylinder(1315, 402, 18, .65, PALETTE.stoneLight);
    this.box(1198, 404, 30, 24, .7, 0xc1af82);
  }

  market(): void {
    const solids = regionForZone("village").solids;
    const stall = solids[8];
    this.box((stall.left + stall.right) / 2, (stall.top + stall.bottom) / 2, stall.right - stall.left,
      stall.bottom - stall.top, 1.1, PALETTE.wood);
    for (const area of [solids[9], solids[10]]) this.box((area.left + area.right) / 2,
      (area.top + area.bottom) / 2, area.right - area.left, area.bottom - area.top, 2.9, PALETTE.timber);
    // Alternating canvas strips form a real shallow gable over the stall.
    for (let i = 0; i < 10; i++) {
      const mesh = this.mesh(this.roofGeometry, this.material(i % 2 ? 0xe6d5ac : 0xa35943));
      mesh.position.set((1206 + i * 14) * SCALE, 2.7, 777 * SCALE);
      mesh.scale.set(14.1 * SCALE, .65, 82 * SCALE);
    }
    for (let i = 0; i < 5; i++) {
      const produce = this.mesh(this.sphereGeometry, this.material(i % 2 ? 0xc8a466 : 0x94a45a));
      produce.position.set((1231 + i * 21) * SCALE, 1.28, 797 * SCALE); produce.scale.set(.3, .18, .23);
    }
    // The two small crates have corresponding authored solids.
    for (const index of [11, 12]) {
      const area = solids[index]; this.box((area.left + area.right) / 2, (area.top + area.bottom) / 2,
        area.right - area.left, area.bottom - area.top, .7, PALETTE.woodLight);
    }
  }

  well(): void {
    const x = 1130, y = 778;
    this.cylinder(x, y, 31, .65, PALETTE.stone);
    this.cylinder(x, y, 24, .06, 0x355650, .66);
    for (const side of [-1, 1]) this.box(x + side * 26, y, 5, 8, 2.6, PALETTE.timber);
    const roof = this.mesh(this.roofGeometry, this.material(PALETTE.roof));
    roof.position.set(x * SCALE, 2.45, y * SCALE); roof.scale.set(76 * SCALE, .8, 64 * SCALE);
    this.box(x, y, 1, 1, 1.4, 0xcdb98b, .7);
    this.cylinder(x, y, 7, .3, PALETTE.wood, .67);
  }

  noticeboard(): void {
    for (const x of [1373, 1407]) this.box(x, 1072, 6, 20, 1.8, PALETTE.timber);
    this.box(1390, 1071, 55, 5, 1.05, PALETTE.wood, .8);
    this.box(1381, 1074, 18, 1, .7, 0xe9d7ad, .96);
    this.box(1400, 1074, 13, 1, .6, 0xd8c39c, 1.04);
    this.box(1390, 1070, 63, 12, .15, PALETTE.roof, 1.85);
  }

  fenceRect(area: Rectangle): void {
    const width = area.right - area.left, depth = area.bottom - area.top;
    const horizontal = width > depth;
    const length = horizontal ? width : depth;
    const x = (area.left + area.right) / 2, y = (area.top + area.bottom) / 2;
    this.box(x, y, width, depth, .1, PALETTE.wood, .57);
    this.box(x, y, width, depth, .08, PALETTE.wood, .27);
    for (let i = 0; i <= Math.max(1, Math.ceil(length / 28)); i++) {
      const factor = i / Math.max(1, Math.ceil(length / 28));
      this.box(horizontal ? area.left + factor * width : x,
        horizontal ? y : area.top + factor * depth, Math.min(5, width), Math.min(5, depth), .87, PALETTE.woodLight);
    }
  }

  wilderness(): void {
    this.ribbon(WILDERNESS_ROADS, 78, 0xa79c77, .005);
    this.ribbon(WILDERNESS_ROADS, 62, 0xc2b28b, .015);
    this.floorRect({ left: 2268, right: 2652, top: 1418, bottom: 1642 }, 0xbeb38b, .019);
    const lake = this.box(2460, 1530, 360, 200, .025,
      this.material(PALETTE.water, { roughness: .3, metalness: .15 }), .025);
    this.waters.push(lake.material as THREE.MeshStandardMaterial);
    // The mine mouth occupies the existing northern rock rectangle.
    const cave = regionForZone("wilderness").solids[0];
    this.box(2250, 377, cave.right - cave.left, cave.bottom - cave.top, 3.4, PALETTE.stoneDark);
    const cap = this.mesh(this.sphereGeometry, this.material(0x92917b));
    cap.position.set(2250 * SCALE, 3.0, 370 * SCALE); cap.scale.set(3.8, 1.8, 2.3);
    this.box(2250, cave.bottom + 1, 89, 2, 2.55, 0x23362e, 0);
    this.box(2200, cave.bottom + 3, 8, 7, 2.7, PALETTE.timber);
    this.box(2300, cave.bottom + 3, 8, 7, 2.7, PALETTE.timber);
    this.box(2250, cave.bottom + 3, 112, 8, .18, PALETTE.woodLight, 2.6);
    this.torch(2186, 437, 1.4); this.torch(2314, 437, 1.4);
    // A-frame canvas tent fits entirely inside its existing impassable base.
    const tent = this.mesh(this.roofGeometry, this.material(0xcebc8e));
    tent.position.set(1075 * SCALE, 0, 1395 * SCALE); tent.scale.set(80 * SCALE, 2.05, 46 * SCALE);
    this.box(1075, 1418, 27, 1, 1.2, 0x4a5542);
    this.cylinder(1147, 1454, 16, .08, PALETTE.stoneDark);
    this.box(1147, 1454, 20, 7, .15, PALETTE.wood, .1);
    this.flame(1147, 1454, .15);
    // Ruined walls are the same three rectangles used by navigation.
    const solids = regionForZone("wilderness").solids;
    for (let i = 2; i <= 4; i++) {
      const area = solids[i]; this.box((area.left + area.right) / 2, (area.top + area.bottom) / 2,
        area.right - area.left, area.bottom - area.top, i === 4 ? 2.6 : 3.7, PALETTE.stone);
    }
    this.paving({ left: 1638, right: 1760, top: 896, bottom: 952 }, 26, 21, 0xa6a68e);
    this.portal(400, 1820);
  }

  mine(): void {
    const areas = regionForZone("mine").walkableAreas!;
    // Partition the rectangle union once: no overlapping floors or internal walls.
    const xs = [...new Set(areas.flatMap(area => [area.left, area.right]))].sort((a, b) => a - b);
    const ys = [...new Set(areas.flatMap(area => [area.top, area.bottom]))].sort((a, b) => a - b);
    const positions: number[] = [];
    for (let xi = 0; xi < xs.length - 1; xi++) for (let yi = 0; yi < ys.length - 1; yi++) {
      const left = xs[xi], right = xs[xi + 1], top = ys[yi], bottom = ys[yi + 1];
      const x = (left + right) / 2, y = (top + bottom) / 2;
      if (!areas.some(area => x >= area.left && x <= area.right && y >= area.top && y <= area.bottom)) continue;
      positions.push(left * SCALE, 0, top * SCALE, left * SCALE, 0, bottom * SCALE, right * SCALE, 0, bottom * SCALE,
        left * SCALE, 0, top * SCALE, right * SCALE, 0, bottom * SCALE, right * SCALE, 0, top * SCALE);
    }
    const floor = this.geometry(new THREE.BufferGeometry());
    floor.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); floor.computeVertexNormals();
    this.mesh(floor, this.material(0x8b8469));
    for (const area of areas) for (const side of ["top", "bottom", "left", "right"] as const) {
      const horizontal = side === "top" || side === "bottom", coordinate = area[side];
      let intervals = [[horizontal ? area.left : area.top, horizontal ? area.right : area.bottom]];
      for (const other of areas) {
        if (other === area) continue;
        const outside = side === "top" ? other.top < coordinate && other.bottom >= coordinate
          : side === "bottom" ? other.top <= coordinate && other.bottom > coordinate
          : side === "left" ? other.left < coordinate && other.right >= coordinate
          : other.left <= coordinate && other.right > coordinate;
        if (!outside) continue;
        const low = horizontal ? other.left : other.top, high = horizontal ? other.right : other.bottom;
        intervals = intervals.flatMap(([start, end]) => low >= end || high <= start ? [[start, end]] :
          [...(low > start ? [[start, low]] : []), ...(high < end ? [[high, end]] : [])]);
      }
      for (const [start, end] of intervals) {
        const outward = side === "top" || side === "left" ? -6 : 6;
        const center = (start + end) / 2;
        const height = side === "bottom" ? 1.0 : 2.6;
        // All wall volume is outside the union; chamber joins remain open.
        this.box(horizontal ? center : coordinate + outward, horizontal ? coordinate + outward : center,
          horizontal ? end - start : 12, horizontal ? 12 : end - start, height, 0x627064);
        this.box(horizontal ? center : coordinate + outward, horizontal ? coordinate + outward : center,
          horizontal ? end - start : 13, horizontal ? 13 : end - start, .16, 0x84907a, height);
      }
    }
    // Embedded, traversable mine rails follow the entrance corridor.
    for (const x of [390, 410]) this.box(x, 820, 2.5, 290, .04, 0x777e70, .015);
    for (let y = 680; y <= 960; y += 24) this.box(400, y, 44, 5, .035, PALETTE.timber, .006);
    for (const p of [[180, 158], [460, 198], [810, 408], [1082, 280], [800, 790], [350, 850]]) this.torch(p[0], p[1], 1.1);
    this.portal(400, 1010);
  }

  interior(): void {
    const orphanage = this.zone === "orphanage";
    const floorColor = orphanage ? 0xae8d5e : 0x74816d;
    this.floorRect({ left: 40, right: 860, top: 80, bottom: 840 }, floorColor, .01);
    if (orphanage) {
      // Floorboards are merged instanced strips rather than separate geometry.
      for (let y = 140; y < 800; y += 26) this.box(450, y, 756, 1, .012, 0x886c47, .03);
      this.box(450, 430, 290, 360, .035, 0x9d6b52, .032);
      this.box(450, 430, 262, 331, .012, 0xc2a06f, .07);
      this.box(450, 430, 248, 317, .012, 0x97664f, .085);
      const medallion = this.cylinder(450, 430, 63, .012, 0xd1b37d, .1);
      medallion.scale.z *= 1.6;
    } else {
      this.paving({ left: 90, right: 810, top: 150, bottom: 790 }, 57, 39, 0x828977);
      this.box(450, 425, 250, 225, .025, 0x6a7c64, .035);
      const ringGeometry = this.geometry(new THREE.RingGeometry(3.4, 3.55, 24));
      const ring = this.mesh(ringGeometry, this.material(0xb7aa7e, { side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(450 * SCALE, .08, 425 * SCALE);
    }
    // Navigation allows the entire rectangle (72..828,135..800). Wall and
    // furniture volumes remain outside it instead of creating visual obstacles.
    this.box(450, 113, 800, 30, 3.8, orphanage ? PALETTE.cream : PALETTE.stoneDark);
    this.box(52, 470, 20, 700, orphanage ? 1.3 : 1.8, orphanage ? PALETTE.timber : PALETTE.stoneDark);
    this.box(848, 470, 20, 700, orphanage ? 1.3 : 1.8, orphanage ? PALETTE.timber : PALETTE.stoneDark);
    this.box(250, 820, 350, 15, .55, orphanage ? PALETTE.timber : PALETTE.stoneDark);
    this.box(650, 820, 350, 15, .55, orphanage ? PALETTE.timber : PALETTE.stoneDark);
    if (orphanage) {
      for (const x of [190, 708]) {
        this.box(x, 130, 78, 2, 1.7, PALETTE.timber, 1.25);
        this.box(x, 132, 64, 1, 1.4, this.material(0xbfd2bd, { emissive: 0x9cae9b, emissiveIntensity: .35 }), 1.4);
        this.box(x, 133, 3, 2, 1.4, PALETTE.timber, 1.4);
        this.box(x, 133, 64, 2, .08, PALETTE.timber, 2.1);
      }
      this.box(450, 102, 120, 45, 1.85, PALETTE.stoneDark);
      this.box(450, 126, 79, 2, 1.2, 0x3d4034, .1);
      this.flame(450, 130, .25);
      // Beds are tucked in visible sleeping alcoves outside the playable wall.
      for (const y of [300, 550]) for (const x of [28, 872]) {
        this.box(x, y, 40, 105, .35, PALETTE.wood);
        this.box(x, y, 38, 92, .22, x < 100 ? 0x6d8977 : 0xa27b58, .35);
        this.box(x, y - 34, 33, 21, .12, 0xe4d8b7, .58);
      }
      this.box(120, 96, 78, 24, 2.1, PALETTE.timber);
      for (let i = 0; i < 9; i++) this.box(88 + i * 7, 110, 5, 5, .5,
        [0x975f4d, 0x657b69, 0xb19c6e][i % 3], .65);
    } else {
      this.box(450, 101, 180, 44, 1.55, PALETTE.stone);
      this.box(450, 101, 204, 50, .18, PALETTE.stoneLight, 1.55);
      for (const x of [90, 810]) this.torch(x, 150, 1.2);
      for (const x of [58, 842]) for (const y of [275, 650]) {
        this.box(x, y, 18, 34, 2.65, PALETTE.stone);
        this.box(x, y, 20, 38, .16, PALETTE.stoneLight, 2.65);
      }
      this.torch(70, 590, 1.25); this.torch(830, 590, 1.25);
    }
    this.portal(450, 790, true);
  }

  updateDynamic(state: GameState): void {
    // Rebuild only the few owned buildings/crop meshes when their presentation
    // changes. Shared geometries/materials survive until this region is disposed.
    const crop = state.economy.crop;
    const readyDay = crop?.readyDay ?? (state.property.plantedAt === null ? Infinity : state.property.plantedAt + 2);
    const signature = this.zone === "village"
      ? `${state.property.building}:${state.property.plantedAt}:${crop?.readyDay ?? 0}:${state.day >= readyDay}:${state.economy.condition < 25}`
      : this.zone === "wilderness" ? ESTATE_DEFS.map(estate => {
        const parcel = state.territory.parcels[estate.id];
        return `${parcel.owned}:${parcel.building}:${parcel.condition < 25}`;
      }).join("|") : "static";
    if (signature === this.dynamicSignature) return;
    this.dynamicSignature = signature;
    // Remove per-building fade entries before replacing that group. Their
    // materials are disposed now, not accumulated with repeated state changes.
    const oldMaterials = new Set<THREE.Material>();
    const sharedMaterials = new Set(this.cache.values());
    this.dynamic.traverse(object => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!sharedMaterials.has(material as THREE.MeshStandardMaterial)) oldMaterials.add(material);
      }
    });
    for (let i = this.fades.length - 1; i >= 0; i--) if (this.fades[i].materials.some(material => oldMaterials.has(material))) this.fades.splice(i, 1);
    oldMaterials.forEach(material => { material.dispose(); this.materials.delete(material); });
    this.dynamic.clear();
    if (this.zone === "village") {
      if (state.property.building) this.house({ left: 2026, right: 2160, top: 718, bottom: 778 },
        state.economy.condition < 25 ? 0x746951 : PALETTE.roof, { height: 2.7, parent: this.dynamic, kind: "owned-home" });
      if (state.property.plantedAt !== null) {
        const ripe = state.day >= readyDay;
        const stalks = new THREE.InstancedMesh(this.cylinderGeometry,
          this.material(ripe ? 0xcbb465 : 0x81a45c), 96);
        const heads = new THREE.InstancedMesh(this.sphereGeometry,
          this.material(ripe ? 0xe2c779 : 0x9cba6c), 96);
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < 96; i++) {
          const x = (1816 + (i % 16) * 11) * SCALE, z = (755 + Math.floor(i / 16) * 17) * SCALE;
          const h = ripe ? .66 : .34;
          matrix.makeScale(.023, h, .023); matrix.setPosition(x, h / 2 + .05, z); stalks.setMatrixAt(i, matrix);
          matrix.makeScale(.08, .16, .06); matrix.setPosition(x, h + .04, z); heads.setMatrixAt(i, matrix);
        }
        stalks.computeBoundingSphere(); heads.computeBoundingSphere(); this.dynamic.add(stalks, heads);
      }
    } else if (this.zone === "wilderness") for (const estate of ESTATE_DEFS) {
      const parcel = state.territory.parcels[estate.id];
      const outline = this.material(parcel.owned ? 0xc6ad73 : 0x8f9875);
      const left = estate.x - estate.width / 2, right = estate.x + estate.width / 2;
      const top = estate.y - estate.height, bottom = estate.y;
      for (const [x, y, width, depth] of [[estate.x, top, estate.width, 3], [estate.x, bottom, estate.width, 3],
        [left, (top + bottom) / 2, 3, estate.height], [right, (top + bottom) / 2, 3, estate.height]]) {
        this.box(x, y, width, depth, .012, outline, .03, this.dynamic);
      }
      this.box(estate.x, estate.y - 12, 30, 4, .7, PALETTE.woodLight, .04, this.dynamic);
      if (!parcel.owned || parcel.building === "none") continue;
      const area = estateSolid(estate.id);
      const warehouse = parcel.building === "warehouse";
      this.house(area, parcel.condition < 25 ? 0x7e735a : warehouse ? PALETTE.slate : 0xa47a50,
        { height: warehouse ? 2.7 : 2.2, kind: `estate-${parcel.building}`, parent: this.dynamic });
      if (warehouse) {
        this.box(estate.x - 34, area.bottom + 2, 21, 2, .65, PALETTE.wood, .14, this.dynamic);
        this.box(estate.x - 34, area.bottom + 3.5, 1.8, 2, .65, PALETTE.timber, .14, this.dynamic);
      }
    }
  }

  update(state: GameState, timeSeconds: number): void {
    if (this.disposed) return;
    this.updateDynamic(state);
    for (const node of this.nodes) {
      const available = (state.frontier.resources[node.id]?.remaining ?? 1) > 0;
      node.live.visible = available; node.depleted.visible = !available;
    }
    for (const rotor of this.mills) rotor.rotation.z = timeSeconds * .14;
    for (const { mesh, seed } of this.flames) {
      mesh.scale.y = .62 + Math.sin(timeSeconds * 8 + seed) * .075;
      mesh.rotation.y = timeSeconds * .5 + seed;
    }
    for (const material of this.waters) material.emissive.setRGB(.014, .025 + Math.sin(timeSeconds * .7) * .006, .022);
    const apostle = state.apostle;
    for (const entry of this.fades) {
      const dx = apostle.x - entry.x, dy = apostle.y - entry.y;
      // Nearby roofs become translucent on either side. This remains useful
      // when the camera rotates and never changes navigation or ownership.
      const near = Math.abs(dx) < entry.radius + 25 && Math.abs(dy) < entry.radius + 55;
      for (const material of entry.materials) {
        const target = near ? .36 : 1;
        material.opacity += (target - material.opacity) * .15;
        material.depthWrite = material.opacity > .9;
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.traverse(object => {
      // InstancedMesh owns a GPU instance buffer in addition to the geometry.
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.group.clear(); this.dynamic.clear();
    this.mills.length = 0;
    this.cache.clear(); this.geometries.clear(); this.materials.clear();
    this.fades.length = 0; this.flames.length = 0; this.nodes.length = 0; this.waters.length = 0;
  }
}

export function createRegionEnvironment(zone: Zone, state: GameState): RegionEnvironment {
  const builder = new EnvironmentBuilder(zone);
  builder.terrain();
  if (zone === "village") builder.village();
  else if (zone === "wilderness") builder.wilderness();
  else if (zone === "mine") builder.mine();
  else builder.interior();
  builder.forest();
  builder.resources();
  builder.update(state, 0);
  return { group: builder.group,
    update: (nextState, timeSeconds) => builder.update(nextState, timeSeconds),
    dispose: () => builder.dispose() };
}

import * as THREE from "three";
import type { InteriorDefinition, InteriorFurniture } from "../interiors";
import type { GameState } from "../types";
import { RegionSurfaceTextures, type SurfaceTexture } from "./materials";

/** Presentation uses the very same centered furniture footprints as navigation. */
export interface InteriorLayer {
  group: THREE.Group;
  update(state: GameState, timeSeconds: number): void;
  dispose(): void;
}

const S = 1 / 24;
const C = {
  wood: 0x947044, darkWood: 0x4e3829, lightWood: 0xc09a62,
  stone: 0x8e8d7c, darkStone: 0x575e54, cream: 0xddd0ad,
  linen: 0xe7dbbb, iron: 0x46504c, brass: 0xbda26a,
  clay: 0xad7150, green: 0x628168, red: 0x9b5d4d,
};
type Flame = { mesh: THREE.Mesh; width: number; height: number; seed: number };
type RoomPalette = { floor: number; wall: number; accent: number; stone: boolean };

function palette(zone: string): RoomPalette {
  switch (zone) {
    case "forge-room": return { floor: 0x77776a, wall: 0x969184, accent: 0xb27146, stone: true };
    case "mill-room": return { floor: 0xab8d5a, wall: 0xd0c19a, accent: 0x879167, stone: false };
    case "bakery-room": return { floor: 0xb49a75, wall: 0xe3d2ad, accent: 0xb9744d, stone: true };
    case "inn-room": return { floor: 0xa18157, wall: 0xd7c29b, accent: 0x8e5145, stone: false };
    case "mira-room": return { floor: 0xac8d64, wall: 0xdfcbb0, accent: 0x9c7d9c, stone: false };
    case "farm-store-room": return { floor: 0x968566, wall: 0xc7bea0, accent: 0xa59a63, stone: true };
    case "farmhouse-room": return { floor: 0xaf8b5e, wall: 0xe0cfa7, accent: 0x73916d, stone: false };
    case "oak-room": return { floor: 0x96734d, wall: 0xd2c19e, accent: 0x6a8162, stone: false };
    case "stone-room": return { floor: 0x96978a, wall: 0xaaa996, accent: 0x6c8290, stone: true };
    case "camp-room": return { floor: 0x9b875f, wall: 0xc1b38c, accent: 0x99744f, stone: false };
    case "ranger-room": return { floor: 0x8d8066, wall: 0xc4c1a6, accent: 0x667d6d, stone: false };
    case "chapel-room": return { floor: 0xa8a394, wall: 0xc9c7b4, accent: 0x7c7295, stone: true };
    default: return { floor: 0xb18d5e, wall: 0xdfcfaa, accent: 0x8d6652, stone: false };
  }
}

/** A room owns its small primitive/material cache; no global GPU resources survive a visit. */
class InteriorBuilder {
  readonly group = new THREE.Group();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly surfaces = new RegionSurfaceTextures();
  private readonly instances: THREE.InstancedMesh[] = [];
  private readonly flames: Flame[] = [];
  private readonly rotors: THREE.Group[] = [];
  private readonly boxGeometry = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  private readonly cylinderGeometry = this.geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  private readonly sphereGeometry = this.geometry(new THREE.IcosahedronGeometry(1, 1));
  private readonly coneGeometry = this.geometry(new THREE.ConeGeometry(1, 1, 8));
  private readonly torusGeometry = this.geometry(new THREE.TorusGeometry(1, .12, 4, 12));
  private readonly roomPalette: RoomPalette;
  private disposed = false;

  constructor(readonly definition: InteriorDefinition) {
    this.roomPalette = palette(definition.zone);
    this.group.name = `interior-${definition.zone}`;
    this.shell();
    definition.furniture.forEach((furniture, index) => this.furniture(furniture, index));
    this.batch(this.group);
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private material(color: number, surface?: SurfaceTexture, glow = 0): THREE.MeshStandardMaterial {
    const key = `${color}:${surface ?? "flat"}:${glow}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color, flatShading: true, roughness: surface === "canvas" ? 1 : .88,
        metalness: color === C.iron || color === C.brass ? .38 : 0,
        map: surface ? this.surfaces.get(surface) : null,
        emissive: glow ? color : 0x000000, emissiveIntensity: glow,
      });
      this.materials.set(key, material);
    }
    return material;
  }

  private mesh(geometry: THREE.BufferGeometry, parent: THREE.Object3D, color: number,
    x: number, z: number, width: number, depth: number, height: number, base = 0,
    surface?: SurfaceTexture, name?: string, glow = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material(color, surface, glow));
    mesh.position.set(x * S, base + height / 2, z * S);
    mesh.scale.set(width * S, height, depth * S);
    mesh.castShadow = mesh.receiveShadow = true;
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  }

  private box(parent: THREE.Object3D, x: number, z: number, w: number, d: number, h: number,
    color = C.wood, base = 0, surface?: SurfaceTexture, name?: string, glow = 0): THREE.Mesh {
    return this.mesh(this.boxGeometry, parent, color, x, z, w, d, h, base, surface, name, glow);
  }

  private cylinder(parent: THREE.Object3D, x: number, z: number, diameter: number, height: number,
    color = C.clay, base = 0, depth = diameter, name?: string): THREE.Mesh {
    return this.mesh(this.cylinderGeometry, parent, color, x, z, diameter / 2, depth / 2, height, base, undefined, name);
  }

  private round(parent: THREE.Object3D, x: number, z: number, w: number, d: number, h: number,
    color: number, base = 0, name?: string): THREE.Mesh {
    // Primitive sphere radius is one; the box primitive uses a unit-wide side.
    return this.mesh(this.sphereGeometry, parent, color, x, z, w / 2, d / 2, h / 2, base + h / 4, undefined, name);
  }

  private ring(parent: THREE.Object3D, x: number, z: number, diameter: number, base: number,
    color = C.iron): THREE.Mesh {
    const ring = new THREE.Mesh(this.torusGeometry, this.material(color));
    ring.position.set(x * S, base, z * S);
    const size = diameter * S / 2.24;
    ring.scale.setScalar(size);
    ring.rotation.x = Math.PI / 2;
    parent.add(ring);
    return ring;
  }

  private flame(parent: THREE.Object3D, x: number, z: number, base: number, size = 1): void {
    const mesh = this.mesh(this.coneGeometry, parent, 0xffc26a, x, z, 8 * size, 8 * size,
      .58 * size, base, undefined, `animated-flame-${this.flames.length}`, 1.45);
    this.flames.push({ mesh, width: mesh.scale.x, height: mesh.scale.y, seed: this.flames.length * 2.37 + x });
    this.mesh(this.sphereGeometry, parent, 0xee8d42, x, z, 5 * size, 5 * size, .16 * size,
      base - .01, undefined, "fire-embers", .8);
  }

  private shell(): void {
    const { wall, floor, accent, stone } = this.roomPalette;
    const shell = new THREE.Group(); shell.name = "interior-shell"; this.group.add(shell);
    const floorGroup = new THREE.Group(); floorGroup.name = "interior-floor"; shell.add(floorGroup);
    this.box(floorGroup, 450, 460, 820, 780, .14, C.darkWood, -.15, "wood");
    // Relief joints and staggered boards provide real depth with reusable geometry.
    if (stone) {
      for (let row = 0; row < 14; row++) for (let col = 0; col < 12; col++) {
        const x = 79 + col * 67, z = 101 + row * 54;
        this.box(floorGroup, x, z, 65.5, 52.5, .045,
          row % 3 === col % 3 ? floor : floor + 0x050403, -.014, "stone");
      }
    } else {
      for (let row = 0; row < 24; row++) {
        const z = 88 + row * 32;
        const breaks = row % 2 ? [40, 260, 555, 860] : [40, 365, 640, 860];
        for (let col = 1; col < breaks.length; col++) {
          this.box(floorGroup, (breaks[col - 1] + breaks[col]) / 2, z,
            breaks[col] - breaks[col - 1] - 1, 31, .035,
            row % 3 === 0 ? floor + 0x080604 : floor, -.005, "wood");
        }
      }
    }
    const wallSurface = this.definition.zone === "camp-room" ? "canvas" : stone ? "stone" : "plaster";
    this.box(shell, 450, 117, 820, 26, 3.7, wall, 0, wallSurface);
    this.box(shell, 53, 465, 24, 690, 1.05, wall, 0, wallSurface);
    this.box(shell, 847, 465, 24, 690, 1.05, wall, 0, wallSurface);
    this.box(shell, 53, 465, 26, 690, .12, C.darkWood, 1.05, "wood");
    this.box(shell, 847, 465, 26, 690, .12, C.darkWood, 1.05, "wood");
    for (const x of [245, 655]) {
      this.box(shell, x, 824, 350, 22, .45, wall, 0, stone ? "stone" : "plaster");
      this.box(shell, x, 824, 353, 23, .12, C.darkWood, .45, "wood");
    }
    for (const x of [53, 263, 637, 847]) {
      this.box(shell, x, 116, 10, 32, 3.8, C.darkWood, 0, "wood");
      this.box(shell, x, 130.5, 14, 7, .15, C.lightWood, 2.7, "wood");
    }
    this.box(shell, 450, 130.8, 820, 5, .17, C.darkWood, 3.43, "wood");
    this.box(shell, 450, 131, 820, 5, .15, C.darkWood, .12, "wood");
    for (const x of [170, 730]) this.window(shell, x, stone && this.definition.zone === "chapel-room");
    const doorway = new THREE.Group(); doorway.name = "interior-doorframe"; shell.add(doorway);
    this.box(doorway, 403, 813, 10, 20, 2.7, C.darkWood, 0, "wood");
    this.box(doorway, 497, 813, 10, 20, 2.7, C.darkWood, 0, "wood");
    this.box(doorway, 450, 813, 104, 20, .22, C.lightWood, 2.55, "wood");
    this.box(doorway, 450, 809, 82, 33, .025, C.stone, .035, "stone");
    // The decorative upper wall panel never occupies a walkable rectangle.
    const emblem = new THREE.Group(); emblem.name = `room-signature-${this.definition.zone}`; shell.add(emblem);
    this.box(emblem, 450, 133, 110, 3, .7, accent, 2.45, "canvas");
    this.box(emblem, 450, 133.5, 117, 2, .055, C.brass, 2.44);
    this.box(emblem, 450, 133.5, 117, 2, .055, C.brass, 3.14);
    if (this.definition.zone === "chapel-room") {
      this.box(emblem, 450, 133, 5, 3, .5, C.brass, 2.55);
      this.box(emblem, 450, 133, 28, 3, .07, C.brass, 2.82);
    } else if (this.definition.zone === "forge-room") {
      this.box(emblem, 440, 132, 8, 3, .47, C.iron, 2.53);
      this.box(emblem, 440, 132, 35, 5, .16, C.iron, 2.92);
      this.box(emblem, 469, 132, 6, 3, .48, C.lightWood, 2.53);
    } else {
      for (const x of [431, 450, 469]) this.round(emblem, x, 133.5, 11, 2, .18, C.brass, 2.72);
    }
  }

  private window(parent: THREE.Group, x: number, arched: boolean): void {
    const height = arched ? 1.9 : 1.55;
    this.box(parent, x, 131, 78, 3, height + .2, C.darkWood, 1.1, "wood");
    this.box(parent, x, 133.3, 63, 2, height, arched ? 0xcac0a4 : 0xf1d69a, 1.2,
      undefined, "warm-window", .35);
    this.box(parent, x, 133, 3, 3, height, C.darkWood, 1.2, "wood");
    this.box(parent, x, 133, 64, 3, .065, C.darkWood, 1.2 + height * .54, "wood");
    this.box(parent, x, 127, 86, 15, .12, C.lightWood, 1.08, "wood");
    if (arched) {
      for (const offset of [-20, 20]) this.box(parent, x + offset, 133.8, 8, 2, height,
        offset < 0 ? 0x9b8baf : 0x8ba8a1, 1.2, undefined, "stained-glass", .23);
    } else {
      for (const offset of [-45, 45]) this.box(parent, x + offset, 133, 10, 3, height + .16,
        this.roomPalette.accent, 1.12, "canvas");
    }
  }

  private furniture(furniture: InteriorFurniture, index: number): void {
    const group = new THREE.Group();
    group.name = `furniture-${index}-${furniture.kind}`;
    group.position.set(furniture.x * S, .035 + this.supportHeight(furniture), furniture.y * S);
    group.rotation.y = furniture.rotation ?? 0;
    group.userData.furniture = { ...furniture };
    this.group.add(group);
    const { w, d, kind } = furniture;
    const accent = furniture.color ?? this.roomPalette.accent;
    switch (kind) {
      case "bed": this.bed(group, w, d, accent); break;
      case "table": case "desk": this.table(group, w, d, kind === "desk", accent); break;
      case "chair": case "bench": this.seating(group, w, d, kind === "bench", accent); break;
      case "shelf": case "wardrobe": this.shelf(group, w, d, kind === "wardrobe", accent); break;
      case "counter": this.counter(group, w, d, accent); break;
      case "oven": case "stove": this.hearth(group, w, d, kind === "oven"); break;
      case "anvil": this.anvil(group, w, d); break;
      case "barrel": this.barrel(group, w, d); break;
      case "crate": this.crate(group, w, d); break;
      case "sack": case "grain": this.sack(group, w, d, kind === "grain", furniture.color); break;
      case "rug": this.rug(group, w, d, accent); break;
      case "altar": this.altar(group, w, d, accent); break;
      case "plant": this.plant(group, w, d); break;
      case "basin": this.basin(group, w, d); break;
      case "lantern": this.lantern(group, w, d); break;
      case "books": this.books(group, 0, 0, w, d, 0); break;
      case "wheel": this.wheel(group, w, d); break;
    }
  }

  /** Books, lamps and bowls sit on their authored table rather than beneath it. */
  private supportHeight(furniture: InteriorFurniture): number {
    if (furniture.blocking !== false || furniture.kind === "rug") return 0;
    const tops: Partial<Record<InteriorFurniture["kind"], number>> = {
      table: 1.33, desk: 1.33, counter: 1.26, shelf: 2.25,
      altar: 1.48, bench: .77, crate: .97, barrel: 1.235, sack: 1.04,
    };
    let height = 0;
    for (const support of this.definition.furniture) {
      if (support === furniture || support.blocking === false || !tops[support.kind]) continue;
      const angle = support.rotation ?? 0;
      const dx = furniture.x - support.x, dz = furniture.y - support.y;
      const localX = Math.cos(angle) * dx - Math.sin(angle) * dz;
      const localZ = Math.sin(angle) * dx + Math.cos(angle) * dz;
      if (Math.abs(localX) <= support.w / 2 && Math.abs(localZ) <= support.d / 2) {
        height = Math.max(height, tops[support.kind]!);
      }
    }
    return height;
  }

  private legs(parent: THREE.Group, w: number, d: number, height: number, base = 0): void {
    for (const x of [-.4, .4]) for (const z of [-.38, .38]) {
      this.box(parent, x * w, z * d, w * .12, d * .13, height, C.darkWood, base, "wood");
    }
  }

  private bed(parent: THREE.Group, w: number, d: number, accent: number): void {
    this.box(parent, 0, 0, w, d, .2, C.wood, .24, "wood", "bed-frame");
    this.legs(parent, w, d, .3);
    this.box(parent, 0, -d * .45, w, d * .1, 1.15, C.darkWood, 0, "wood", "bed-headboard");
    this.box(parent, 0, d * .45, w, d * .1, .65, C.wood, 0, "wood");
    this.box(parent, 0, 0, w * .88, d * .84, .28, C.linen, .44, "canvas", "bed-mattress");
    this.box(parent, 0, d * .12, w * .9, d * .61, .07, accent, .73, "canvas", "bed-blanket");
    this.box(parent, 0, d * .32, w * .9, d * .14, .045, C.linen, .806, "canvas");
    this.round(parent, 0, -d * .28, w * .66, d * .21, .2, C.linen, .72, "bed-pillow");
    for (const x of [-w * .32, w * .32]) this.box(parent, x, d * .1, w * .028, d * .58,
      .012, C.linen, .811);
  }

  private table(parent: THREE.Group, w: number, d: number, desk: boolean, accent: number): void {
    this.legs(parent, w, d, 1.16);
    this.box(parent, 0, 0, w, d, .17, C.lightWood, 1.16, "wood", desk ? "writing-desk" : "dining-table");
    this.box(parent, 0, 0, w * .78, d * .45, .012, accent, 1.338, "canvas", "table-runner");
    if (desk) {
      this.box(parent, -w * .2, 0, w * .24, d * .35, .025, C.linen, 1.354, "canvas", "desk-parchment");
      this.box(parent, w * .29, -d * .13, w * .16, d * .24, .13, C.darkWood, 1.34, "wood");
      this.books(parent, w * .22, d * .15, w * .23, d * .27, 1.35);
      this.cylinder(parent, -w * .32, -d * .24, Math.min(w, d) * .085, .12, C.iron, 1.35);
    } else {
      this.jug(parent, 0, -d * .12, Math.min(w, d) * .24, 1.35);
      for (const x of [-w * .3, w * .3]) {
        this.cylinder(parent, x, d * .1, Math.min(w, d) * .26, .035, C.cream, 1.35);
        this.cylinder(parent, x + w * .13, -d * .15, Math.min(w, d) * .08, .14, C.clay, 1.35);
        this.box(parent, x - w * .12, d * .1, w * .018, d * .25, .018, C.iron, 1.39);
      }
    }
  }

  private seating(parent: THREE.Group, w: number, d: number, bench: boolean, accent: number): void {
    this.legs(parent, w, d, .62);
    this.box(parent, 0, 0, w, d * .9, .15, C.wood, .62, "wood", bench ? "bench-seat" : "chair-seat");
    if (!bench) this.box(parent, 0, d * .01, w * .79, d * .68, .07, accent, .78, "canvas");
    for (const x of [-.42, .42]) this.box(parent, w * x, -d * .43, w * .1, d * .12, 1.5, C.darkWood, 0, "wood");
    for (const height of [1.02, 1.28]) this.box(parent, 0, -d * .43, w, d * .12, .13, C.wood, height, "wood");
  }

  private shelf(parent: THREE.Group, w: number, d: number, wardrobe: boolean, accent: number): void {
    const height = wardrobe ? 2.5 : 2.25;
    this.box(parent, 0, -d * .43, w, d * .14, height, C.darkWood, 0, "wood", "shelf-back");
    for (const x of [-.45, .45]) this.box(parent, w * x, 0, w * .1, d, height, C.wood, 0, "wood");
    for (const base of [0, .74, 1.48, height - .12]) this.box(parent, 0, 0, w, d, .12, C.lightWood, base, "wood");
    if (wardrobe) {
      for (const side of [-1, 1]) {
        this.box(parent, side * w * .225, d * .43, w * .44, d * .12, height - .22, accent, .12, "wood", "wardrobe-door");
        this.box(parent, side * w * .06, d * .493, w * .025, d * .012, .12, C.brass, 1.15);
      }
    } else {
      for (const base of [.12, .86, 1.6]) {
        this.books(parent, -w * .19, d * .08, w * .37, d * .65, base);
        this.jug(parent, w * .25, d * .06, Math.min(w * .22, d * .6), base);
      }
    }
  }

  private books(parent: THREE.Group, x: number, z: number, w: number, d: number, base: number): void {
    const colors = [C.red, C.green, 0x6d7d92, C.lightWood, 0x9b8296];
    for (let i = 0; i < 5; i++) {
      const height = .28 + (i % 3) * .07;
      this.box(parent, x - w * .4 + i * w * .2, z, w * .16, d * .87, height, colors[i], base,
        "canvas", "book-spine");
      this.box(parent, x - w * .4 + i * w * .2, z + d * .445, w * .11, d * .015,
        .025, C.brass, base + height * .7);
    }
  }

  private counter(parent: THREE.Group, w: number, d: number, accent: number): void {
    this.box(parent, 0, 0, w * .94, d * .9, 1.1, C.wood, 0, "wood", "counter-base");
    this.box(parent, 0, 0, w, d, .16, C.lightWood, 1.1, "wood", "counter-top");
    for (const x of [-.32, 0, .32]) {
      this.box(parent, x * w, d * .455, w * .27, d * .018, .75, accent, .17, "wood");
    }
    const bakery = this.definition.zone === "bakery-room";
    if (bakery) {
      this.box(parent, 0, 0, w * .76, d * .66, .045, C.darkWood, 1.26, "wood", "bread-tray");
      for (let i = 0; i < 5; i++) this.bread(parent, -w * .3 + i * w * .15, 0, w * .12, d * .48, 1.31);
    } else {
      this.jug(parent, -w * .27, 0, Math.min(w * .17, d * .55), 1.26);
      this.cylinder(parent, 0, 0, Math.min(w * .19, d * .55), .08, C.cream, 1.26);
      this.box(parent, w * .27, 0, w * .19, d * .6, .12, C.darkWood, 1.26, "wood", "merchant-ledger");
      this.box(parent, w * .27, 0, w * .15, d * .5, .018, C.linen, 1.39);
    }
  }

  private hearth(parent: THREE.Group, w: number, d: number, oven: boolean): void {
    this.box(parent, 0, 0, w, d, .2, C.darkStone, 0, "stone", "hearth-foundation");
    this.box(parent, 0, -d * .3, w, d * .4, 2.1, C.stone, .2, "stone", "hearth-back");
    for (const x of [-.36, .36]) this.box(parent, w * x, 0, w * .28, d, 1.35, C.stone, .2, "stone");
    this.box(parent, 0, 0, w, d, .21, C.darkStone, 1.55, "stone", "hearth-mantel");
    this.box(parent, 0, -d * .2, w * .6, d * .6, .85, C.stone, 1.76, "stone");
    this.box(parent, 0, d * .295, w * .43, d * .08, 1.05, 0x343a32, .2, undefined, "hearth-opening");
    for (const z of [d * .1, d * .3]) this.box(parent, 0, z, w * .42, d * .12, .14, C.darkWood, .21, "wood");
    this.flame(parent, 0, d * .32, .36, Math.min(1.15, w / 72, d / 72));
    if (oven) {
      this.box(parent, 0, d * .32, w * .5, d * .24, .08, C.iron, .94, undefined, "oven-shelf");
      this.bread(parent, -w * .12, d * .32, w * .16, d * .16, 1.025);
      this.bread(parent, w * .12, d * .32, w * .16, d * .16, 1.025);
    } else {
      this.cylinder(parent, 0, d * .05, Math.min(w, d) * .3, .35, C.iron, 1.77, undefined, "cooking-pot");
      this.ring(parent, 0, d * .05, Math.min(w, d) * .28, 2.1);
    }
  }

  private anvil(parent: THREE.Group, w: number, d: number): void {
    this.cylinder(parent, 0, 0, w * .72, .68, C.darkWood, 0, d * .86, "anvil-stump");
    this.box(parent, 0, 0, w * .54, d * .64, .12, C.iron, .68);
    this.box(parent, -w * .07, 0, w * .27, d * .39, .44, C.iron, .8);
    this.box(parent, -w * .08, 0, w * .66, d * .66, .17, C.iron, 1.24, undefined, "anvil-face");
    const horn = this.mesh(this.coneGeometry, parent, C.iron, w * .33, 0, d * .25, d * .25, w * S * .31, 1.1);
    horn.rotation.z = -Math.PI / 2;
    horn.position.y = 1.3;
    this.box(parent, -w * .18, d * .1, w * .35, d * .055, .05, C.lightWood, 1.415);
    this.box(parent, -w * .31, d * .1, w * .14, d * .25, .12, C.iron, 1.435, undefined, "forge-hammer");
  }

  private barrel(parent: THREE.Group, w: number, d: number): void {
    const size = Math.min(w, d);
    this.cylinder(parent, 0, 0, size * .88, 1.13, C.wood, .05, size * .88, "barrel-staves");
    this.cylinder(parent, 0, 0, size * .76, .05, C.lightWood, 1.18);
    for (const base of [.17, .57, 1.05]) this.ring(parent, 0, 0, size * .96, base);
    this.box(parent, 0, 0, size * .07, size * .73, .018, C.darkWood, 1.235, "wood");
    this.cylinder(parent, size * .19, 0, size * .1, .035, C.darkWood, 1.24);
  }

  private crate(parent: THREE.Group, w: number, d: number): void {
    this.box(parent, 0, 0, w, d, .92, C.wood, 0, "wood", "crate-body");
    for (const x of [-.42, .42]) this.box(parent, x * w, 0, w * .12, d, .96, C.lightWood, 0, "wood");
    for (const z of [-.42, .42]) this.box(parent, 0, z * d, w * .76, d * .12, .96, C.lightWood, 0, "wood");
    for (const x of [-.23, 0, .23]) this.box(parent, x * w, 0, w * .19, d * .75, .04, C.lightWood, .93, "wood");
  }

  private sack(parent: THREE.Group, w: number, d: number, grain: boolean, fillColor = 0xd6ba72): void {
    this.round(parent, 0, 0, w * .96, d * .96, grain ? .68 : .9, 0xb8a275, .015, "grain-sack");
    this.cylinder(parent, 0, 0, Math.min(w, d) * .52, .12, C.darkWood, grain ? .61 : .83);
    if (grain) {
      for (let i = 0; i < 12; i++) {
        const angle = i * 2.4, radius = Math.sqrt(i / 12) * .21;
        this.round(parent, Math.cos(angle) * w * radius, Math.sin(angle) * d * radius,
          w * .09, d * .06, .045, fillColor, .72, "grain-kernel");
      }
    } else {
      this.cylinder(parent, 0, 0, Math.min(w, d) * .3, .09, C.lightWood, .95);
      this.box(parent, 0, 0, w * .35, d * .08, .045, C.darkWood, 1.04);
    }
  }

  private rug(parent: THREE.Group, w: number, d: number, accent: number): void {
    this.box(parent, 0, 0, w, d, .015, C.linen, 0, "canvas", "rug-fringe");
    this.box(parent, 0, 0, w * .96, d * .97, .015, accent, .016, "canvas", "woven-rug");
    this.box(parent, 0, 0, w * .82, d * .86, .009, C.lightWood, .032, "canvas");
    this.box(parent, 0, 0, w * .78, d * .82, .008, accent, .042, "canvas");
    this.round(parent, 0, 0, w * .32, d * .37, .012, C.linen, .051, "rug-medallion");
  }

  private altar(parent: THREE.Group, w: number, d: number, accent: number): void {
    this.box(parent, 0, 0, w, d, .16, C.stone, 0, "stone");
    this.box(parent, 0, 0, w * .79, d * .77, 1.15, C.stone, .16, "stone", "altar-body");
    this.box(parent, 0, 0, w, d, .17, C.cream, 1.31, "stone");
    this.box(parent, 0, 0, w * .38, d * .96, .025, accent, 1.49, "canvas", "altar-cloth");
    this.box(parent, 0, -d * .12, w * .2, d * .28, .06, C.linen, 1.53, "canvas", "altar-book");
    for (const x of [-.35, .35]) this.candle(parent, x * w, 0, Math.min(w, d) * .085, 1.49);
  }

  private plant(parent: THREE.Group, w: number, d: number): void {
    const size = Math.min(w, d);
    this.cylinder(parent, 0, 0, size * .65, .4, C.clay);
    this.cylinder(parent, 0, 0, size * .73, .08, C.clay, .35);
    this.cylinder(parent, 0, 0, size * .57, .035, C.darkWood, .44);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const x = Math.sin(angle) * w * .23, z = Math.cos(angle) * d * .23;
      this.round(parent, x, z, w * .42, d * .42, .32, i % 2 ? C.green : 0x7a965f, .5 + i % 2 * .2, "plant-leaf");
    }
  }

  private basin(parent: THREE.Group, w: number, d: number): void {
    this.legs(parent, w * .9, d * .9, .6);
    this.box(parent, 0, 0, w, d, .12, C.wood, .6, "wood");
    const size = Math.min(w, d) * .8;
    this.cylinder(parent, 0, 0, size, .27, C.stone, .72);
    this.cylinder(parent, 0, 0, size * .76, .02, 0x78a5a2, 1.0, undefined, "basin-water");
    this.ring(parent, 0, 0, size, 1.0, C.cream);
  }

  private lantern(parent: THREE.Group, w: number, d: number): void {
    const size = Math.min(w, d);
    this.cylinder(parent, 0, 0, size * .8, .08, C.iron);
    this.box(parent, 0, 0, w * .55, d * .55, .45, 0xf2c98a, .08, undefined, "lantern-glass", .5);
    for (const x of [-.3, .3]) for (const z of [-.3, .3]) this.box(parent, w * x, d * z,
      w * .06, d * .06, .6, C.iron, 0);
    this.cylinder(parent, 0, 0, size * .8, .08, C.iron, .6);
    this.flame(parent, 0, 0, .15, Math.min(.4, size / 20));
  }

  private candle(parent: THREE.Group, x: number, z: number, size: number, base: number): void {
    this.cylinder(parent, x, z, size * 1.5, .06, C.brass, base);
    this.cylinder(parent, x, z, size, .3, C.linen, base + .06);
    this.flame(parent, x, z, base + .36, Math.min(.35, size / 15));
  }

  private jug(parent: THREE.Group, x: number, z: number, size: number, base: number): void {
    this.round(parent, x, z, size, size, .3, C.clay, base, "clay-jug");
    this.cylinder(parent, x, z, size * .43, .16, C.clay, base + .23);
    this.cylinder(parent, x, z, size * .54, .035, C.darkWood, base + .39);
    // A real handle sits within the jug's authored size envelope.
    const handle = this.ring(parent, x + size * .29, z, size * .37, base + .2, C.clay);
    handle.rotation.x = 0;
  }

  private bread(parent: THREE.Group, x: number, z: number, w: number, d: number, base: number): void {
    this.round(parent, x, z, w, d, .17, 0xc58a49, base, "bread-loaf");
    for (const offset of [-.2, .2]) this.box(parent, x + w * offset, z, w * .055, d * .55, .012, 0xe5bb76, base + .163);
  }

  private wheel(parent: THREE.Group, w: number, d: number): void {
    const size = Math.min(w, 105), height = size * S * .78;
    for (const x of [-.42, .42]) this.box(parent, w * x, 0, w * .13, d * .7, height, C.darkWood, 0, "wood");
    const rotor = new THREE.Group(); rotor.name = "animated-mill-wheel";
    rotor.position.set(0, height * .75, 0); parent.add(rotor); this.rotors.push(rotor);
    const radius = Math.min(w * .45 * S, height * .6);
    const rim = new THREE.Mesh(this.torusGeometry, this.material(C.wood, "wood"));
    rim.scale.set(radius / 1.12, radius / 1.12, Math.min(radius / 1.12, d * S / .28));
    rotor.add(rim);
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(this.boxGeometry, this.material(C.lightWood, "wood"));
      spoke.scale.set(radius * 1.7, .1, Math.min(d * S * .6, .3));
      spoke.rotation.z = i * Math.PI / 8; rotor.add(spoke);
    }
    this.cylinder(parent, 0, 0, w * .22, .4, C.stone, 0, d * .7, "millstone-base");
  }

  /** Repeated static parts share one instance buffer per parent/material/primitive. */
  private batch(parent: THREE.Object3D): void {
    for (const child of [...parent.children]) if (child instanceof THREE.Group && !this.rotors.includes(child)) this.batch(child);
    const batches = new Map<string, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh ||
        this.flames.some(flame => flame.mesh === child)) continue;
      const material = child.material;
      if (Array.isArray(material)) continue;
      const key = `${child.geometry.uuid}:${material.uuid}`;
      const list = batches.get(key) ?? []; list.push(child); batches.set(key, list);
    }
    for (const objects of batches.values()) {
      if (objects.length < 3) continue;
      const first = objects[0];
      const mesh = new THREE.InstancedMesh(first.geometry, first.material, objects.length);
      mesh.name = `interior-batch-${first.name || "joinery"}`;
      mesh.castShadow = mesh.receiveShadow = true;
      objects.forEach((object, i) => { object.updateMatrix(); mesh.setMatrixAt(i, object.matrix); parent.remove(object); });
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      parent.add(mesh); this.instances.push(mesh);
    }
  }

  update(_state: GameState, timeSeconds: number): void {
    if (this.disposed) return;
    for (const flame of this.flames) {
      flame.mesh.scale.y = flame.height * (1 + Math.sin(timeSeconds * 7.7 + flame.seed) * .12);
      flame.mesh.scale.x = flame.width * (1 + Math.cos(timeSeconds * 5.3 + flame.seed) * .06);
      flame.mesh.rotation.y = timeSeconds * .45 + flame.seed;
    }
    for (const rotor of this.rotors) rotor.rotation.z = timeSeconds * .16;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.instances.forEach(mesh => mesh.dispose());
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.surfaces.dispose(); this.group.clear();
    this.instances.length = this.flames.length = this.rotors.length = 0;
    this.geometries.clear(); this.materials.clear();
  }
}

export function createInteriorLayer(definition: InteriorDefinition, state: GameState): InteriorLayer {
  const builder = new InteriorBuilder(definition);
  builder.update(state, 0);
  return { group: builder.group,
    update: (nextState, timeSeconds) => builder.update(nextState, timeSeconds),
    dispose: () => builder.dispose() };
}

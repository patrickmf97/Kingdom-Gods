import * as THREE from "three";
import { groundCoverAllowed } from "./vegetation";
import { regionForZone } from "../regions";
import { WORLD_SCALE } from "./coordinates";
import type { Zone } from "../types";

/**
 * Dense grass around the first-person eye. The blades are anchored to a world grid,
 * so they never slide as the player walks; only the ring of visible cells is refilled.
 * Presentation only: one instanced draw, no raycast, no collision, never saved.
 */
export const GRASS_CAPACITY = 14000;
const SPACING = 7;          // map pixels between candidate blades (≈ .29 world units)
const RADIUS = 16;          // world units around the eye
const MASK_CELL = 12;       // map pixels per walkability cell

type OutdoorZone = "village" | "wilderness" | "highlands";
const outdoor = (zone: Zone): zone is OutdoorZone => zone === "village" || zone === "wilderness" || zone === "highlands";

const hash = (x: number, y: number) => {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
};

function bladeGeometry(): THREE.BufferGeometry {
  // Tapered three-segment blade, bent forward; normals point up so the lawn shades evenly.
  const w = .06, h = 1;
  const positions = [
    -w, 0, 0, w, 0, 0, -w * .7, h * .45, .03, w * .7, h * .45, .03, 0, h, .12,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, .2, 0, 1, .2, 0, 1, .2, 0, 1, .2, 0, 1, .2], 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  geometry.computeBoundingSphere();
  return geometry;
}

export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  private geometry = bladeGeometry();
  private material: THREE.MeshStandardMaterial;
  private uniforms = { uGrassTime: { value: 0 }, uGrassCenter: { value: new THREE.Vector2() } };
  private mask: Uint8Array | null = null;
  private maskWidth = 0;
  private maskZone: Zone | null = null;
  private center = new THREE.Vector2(Infinity, Infinity);
  private matrix = new THREE.Matrix4();
  private color = new THREE.Color();
  private season = -1;

  constructor() {
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .92, metalness: 0, side: THREE.DoubleSide });
    this.material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `uniform float uGrassTime; uniform vec2 uGrassCenter; varying float vGrassTip;\n${shader.vertexShader}`
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          vGrassTip = position.y;
          vec4 grassRoot = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float grassWind = sin(uGrassTime * 1.7 + grassRoot.x * 0.35 + grassRoot.z * 0.21) * 0.6
            + sin(uGrassTime * 3.1 + grassRoot.x * 1.3) * 0.25;
          transformed.x += grassWind * position.y * position.y * 0.16;
          transformed.z += grassWind * position.y * position.y * 0.08;
          // Blades thin out toward the edge of the field instead of ending in a hard ring.
          float grassFade = 1.0 - smoothstep(${(RADIUS * .7).toFixed(1)}, ${RADIUS.toFixed(1)}, distance(grassRoot.xz, uGrassCenter));
          transformed *= grassFade;`);
      shader.fragmentShader = `varying float vGrassTip;\n${shader.fragmentShader}`
        .replace("#include <color_fragment>", `#include <color_fragment>
          diffuseColor.rgb *= mix(0.42, 1.12, vGrassTip);`);
    };
    this.material.customProgramCacheKey = () => "kingdom-grass-field-v1";
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, GRASS_CAPACITY);
    this.mesh.name = "first-person-grass";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.raycast = () => {};
    this.mesh.userData.presentationOnly = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  private buildMask(zone: OutdoorZone): void {
    const region = regionForZone(zone);
    this.maskWidth = Math.ceil(region.width / MASK_CELL);
    const height = Math.ceil(region.height / MASK_CELL);
    this.mask = new Uint8Array(this.maskWidth * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < this.maskWidth; x++)
      this.mask[y * this.maskWidth + x] = groundCoverAllowed(zone, { x: (x + .5) * MASK_CELL, y: (y + .5) * MASK_CELL }, 2, "grass") ? 1 : 0;
    this.maskZone = zone;
  }

  private allowed(x: number, y: number): boolean {
    if (!this.mask) return false;
    const cx = Math.floor(x / MASK_CELL), cy = Math.floor(y / MASK_CELL);
    if (cx < 0 || cy < 0 || cx >= this.maskWidth) return false;
    return this.mask[cy * this.maskWidth + cx] === 1;
  }

  /** Call every frame; refills only after the eye moves more than a couple of steps. */
  update(zone: Zone, eye: THREE.Vector3, visible: boolean, timeSeconds: number, day: number): void {
    this.uniforms.uGrassTime.value = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    this.uniforms.uGrassCenter.value.set(eye.x, eye.z);
    this.mesh.visible = visible && outdoor(zone);
    if (!this.mesh.visible || !outdoor(zone)) return;
    if (this.maskZone !== zone) { this.buildMask(zone); this.center.set(Infinity, Infinity); }
    const season = Math.floor(((Math.max(1, day) - 1) % 360) / 90);
    if (season !== this.season) { this.season = season; this.center.set(Infinity, Infinity); }
    if (this.center.distanceTo(new THREE.Vector2(eye.x, eye.z)) < 1.6) return;
    this.center.set(eye.x, eye.z);
    const px = eye.x / WORLD_SCALE, py = eye.z / WORLD_SCALE, reach = (RADIUS + 1.5) / WORLD_SCALE;
    const tint = [0x6f9a4a, 0x7f9b45, 0x9c8f4b, 0x8f9a86][season];
    const base = new THREE.Color(tint);
    let count = 0;
    const quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3(), axis = new THREE.Vector3(0, 1, 0);
    for (let gy = Math.floor((py - reach) / SPACING); gy <= Math.ceil((py + reach) / SPACING) && count < GRASS_CAPACITY; gy++) {
      for (let gx = Math.floor((px - reach) / SPACING); gx <= Math.ceil((px + reach) / SPACING) && count < GRASS_CAPACITY; gx++) {
        const r1 = hash(gx, gy), r2 = hash(gy * 7 + 3, gx * 13 + 1);
        const x = (gx + r1) * SPACING, y = (gy + r2) * SPACING;
        if ((x - px) ** 2 + (y - py) ** 2 > reach * reach || !this.allowed(x, y)) continue;
        quaternion.setFromAxisAngle(axis, r1 * Math.PI * 2);
        const tall = .34 + r2 * .38 + (hash(gx * 3, gy * 5) > .93 ? .25 : 0);
        position.set(x * WORLD_SCALE, 0, y * WORLD_SCALE);
        scale.set(.9 + r1 * .5, tall, 1);
        this.matrix.compose(position, quaternion, scale);
        this.mesh.setMatrixAt(count, this.matrix);
        this.color.copy(base).offsetHSL((r2 - .5) * .05, (r1 - .5) * .12, (r1 - .5) * .09);
        this.mesh.setColorAt(count, this.color);
        count++;
      }
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.dispose(); this.geometry.dispose(); this.material.dispose();
    this.mask = null;
  }
}

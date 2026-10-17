import * as THREE from "three";
import { resourceNode, regionForZone } from "../regions";
import type { GameState, WorkProgress, Zone } from "../types";
import { WORLD_SCALE } from "./coordinates";

export const PARTICLE_CAPACITY = 192;
export const MAX_PARTICLE_CAPACITY = 256;
export const PARTICLE_KINDS = { dust: 0, wood: 1, spark: 2, leaf: 3, arc: 4, hit: 5, pollen: 6, firefly: 7 } as const;
export type ParticleKind = keyof typeof PARTICLE_KINDS;
const COLORS = [0xc9b28a, 0xd2a05c, 0xffce76, 0x9ebd79, 0xf6e6af, 0xe5b48a, 0xe1d6a5, 0xd4ed96]
  .map(hex => new THREE.Color(hex));
const outside = (zone: Zone) => zone === "village" || zone === "wilderness";

/** Dense, fixed arrays are shared with the GPU. Expired particles swap with the last live slot. */
export class ParticlePool {
  readonly capacity: number;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly colors: Float32Array;
  readonly sizes: Float32Array;
  readonly opacities: Float32Array;
  readonly kinds: Float32Array;
  readonly rotations: Float32Array;
  readonly life: Float32Array;
  private readonly duration: Float32Array;
  private readonly gravity: Float32Array;
  private readonly vectorArrays: readonly Float32Array[];
  private readonly slotArrays: readonly Float32Array[];
  private live = 0;
  version = 0;

  constructor(capacity = PARTICLE_CAPACITY) {
    this.capacity = Math.max(1, Math.min(MAX_PARTICLE_CAPACITY, Number.isFinite(capacity) ? Math.floor(capacity) : PARTICLE_CAPACITY));
    this.positions = new Float32Array(this.capacity * 3);
    this.velocities = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.sizes = new Float32Array(this.capacity);
    this.opacities = new Float32Array(this.capacity);
    this.kinds = new Float32Array(this.capacity);
    this.rotations = new Float32Array(this.capacity);
    this.life = new Float32Array(this.capacity);
    this.duration = new Float32Array(this.capacity);
    this.gravity = new Float32Array(this.capacity);
    this.vectorArrays = [this.positions, this.velocities, this.colors];
    this.slotArrays = [this.sizes, this.life, this.duration, this.gravity, this.kinds, this.rotations, this.opacities];
  }

  get count(): number { return this.live; }

  emit(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number,
    size: number, lifetime: number, gravity: number, rotation = 0): boolean {
    if (this.live === this.capacity || !Number.isFinite(x + y + z + vx + vy + vz + size + lifetime + gravity + rotation) || lifetime <= 0 || size <= 0) return false;
    const slot = this.live++, offset = slot * 3, color = COLORS[PARTICLE_KINDS[kind]];
    this.positions[offset] = x; this.positions[offset + 1] = y; this.positions[offset + 2] = z;
    this.velocities[offset] = vx; this.velocities[offset + 1] = vy; this.velocities[offset + 2] = vz;
    this.colors[offset] = color.r; this.colors[offset + 1] = color.g; this.colors[offset + 2] = color.b;
    this.sizes[slot] = size; this.life[slot] = this.duration[slot] = lifetime;
    this.gravity[slot] = gravity; this.kinds[slot] = PARTICLE_KINDS[kind]; this.rotations[slot] = rotation;
    this.opacities[slot] = 1;
    this.version++;
    return true;
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0 || !this.live) return;
    for (let slot = 0; slot < this.live;) {
      this.life[slot] -= dt;
      if (this.life[slot] <= 0) { this.remove(slot); continue; }
      const offset = slot * 3;
      this.positions[offset] += this.velocities[offset] * dt;
      this.positions[offset + 1] += this.velocities[offset + 1] * dt;
      this.positions[offset + 2] += this.velocities[offset + 2] * dt;
      this.velocities[offset + 1] -= this.gravity[slot] * dt;
      this.opacities[slot] = Math.min(1, this.life[slot] / this.duration[slot] * 2);
      slot++;
    }
    this.version++;
  }

  clear(): void { this.live = 0; this.version++; }

  private remove(slot: number): void {
    const last = --this.live;
    if (slot === last) return;
    for (const array of this.vectorArrays) {
      const offset = slot * 3, end = last * 3;
      array[offset] = array[end]; array[offset + 1] = array[end + 1]; array[offset + 2] = array[end + 2];
    }
    for (const array of this.slotArrays) array[slot] = array[last];
  }
}

/** Reads authoritative state deltas; it never advances work, combat, or rewards. */
export class EffectSimulation {
  readonly pool: ParticlePool;
  private state?: GameState;
  private zone?: Zone;
  private x = 0;
  private y = 0;
  private hp = 0;
  private stepDistance = 0;
  private work: WorkProgress | null = null;
  private workElapsed = 0;
  private workRemaining = 0;
  private enemies = new Map<string, { hp: number; alive: boolean }>();
  private ambientTime = 0;
  private tokens = 48;
  private frameBudget = 0;
  private attackPending = false;
  private attackYaw = 0;
  private attackX = 0;
  private attackY = 0;
  private seed = 194716;

  constructor(capacity = PARTICLE_CAPACITY) { this.pool = new ParticlePool(capacity); }

  reset(state?: GameState): void {
    this.pool.clear(); this.state = state; this.zone = state?.zone;
    this.enemies.clear(); this.stepDistance = this.ambientTime = 0; this.tokens = 48; this.attackPending = false;
    this.work = null;
    if (state) this.remember(state);
  }

  /** Called only after store.attack; rejected inputs and cooldowns spend no stamina. */
  observePlayerAttack(state: GameState, staminaBefore: number, yaw: number): void {
    if (this.state !== state || this.zone !== state.zone || state.phase !== "playing" || state.zone !== "dungeon" ||
      !state.apostle.alive || staminaBefore - state.apostle.stamina < 9.999 || !Number.isFinite(yaw)) return;
    this.attackPending = true; this.attackYaw = yaw; this.attackX = state.apostle.x; this.attackY = state.apostle.y;
  }

  update(state: GameState, dt: number): void {
    if (state !== this.state || state.zone !== this.zone) { this.reset(state); return; }
    if (!Number.isFinite(dt) || dt <= 0 || state.phase !== "playing") {
      // Discard events which happened under an overlay, including a pending input.
      this.attackPending = false; this.stepDistance = 0; this.ambientTime = 0; this.remember(state); return;
    }
    dt = Math.min(dt, .1);
    this.pool.update(dt);
    this.tokens = Math.min(48, this.tokens + dt * 64);
    this.frameBudget = Math.min(32, Math.floor(this.tokens));
    const apostle = state.apostle;
    if (this.attackPending) {
      for (let i = 0; i < 10; i++) {
        const angle = this.attackYaw - .9 + i * .18;
        this.emit("arc", this.attackX * WORLD_SCALE + Math.sin(angle) * 1.05, 1.05,
          this.attackY * WORLD_SCALE + Math.cos(angle) * 1.05, 0, .02, 0, .24, .18, 0, -angle);
      }
      this.attackPending = false;
    }
    if (state.zone === "dungeon") {
      for (const enemy of state.enemies) {
        const before = this.enemies.get(enemy.id);
        if (before && ((before.hp > enemy.hp) || (before.alive && !enemy.alive))) {
          this.burst("hit", enemy.x, enemy.y, enemy.alive ? 7 : 12, .95);
        }
      }
      if (apostle.hp < this.hp) this.burst("hit", apostle.x, apostle.y, 6, 1);
    }
    this.observeWork(state);
    if (outside(state.zone) && apostle.alive) {
      const travelled = Math.hypot(apostle.x - this.x, apostle.y - this.y);
      if (travelled > .01 && travelled < 85) {
        this.stepDistance += travelled;
        if (this.stepDistance >= 24) {
          this.stepDistance %= 24;
          const bridge = state.zone === "village" && apostle.x >= 285 && apostle.x <= 485 && apostle.y >= 856 && apostle.y <= 930;
          this.burst("dust", apostle.x, apostle.y, 2, bridge ? .28 : .07);
        }
      } else if (travelled >= 85) this.stepDistance = 0;
      this.ambientTime += dt;
      if (this.ambientTime >= .65) {
        this.ambientTime %= .65;
        const region = regionForZone(state.zone);
        const x = Math.max(24, Math.min(region.width - 24, apostle.x + (this.random() - .5) * 560));
        const y = Math.max(24, Math.min(region.height - 24, apostle.y + (this.random() - .5) * 440));
        const night = state.minutes < 360 || state.minutes > 1110;
        this.emit(night ? "firefly" : "pollen", x * WORLD_SCALE, .7 + this.random() * 2.1, y * WORLD_SCALE,
          .035, .025, -.02, night ? .14 : .09, 3.8, 0, this.random() * 6.28);
      }
    }
    this.remember(state);
  }

  private observeWork(state: GameState): void {
    const work = state.frontier.work;
    if (this.work && !work) {
      const node = resourceNode(this.work.nodeId);
      // A cancelled action has no resource debit, so it cannot look like a harvest.
      if (node && node.zone === state.zone && (state.frontier.resources[node.id]?.remaining ?? this.workRemaining) < this.workRemaining) {
        this.burst(node.resource === "wood" ? "wood" : node.resource === "herb" ? "leaf" : "spark", node.x, node.y, 6, node.resource === "herb" ? .35 : .8);
      }
      return;
    }
    if (!work) return;
    const node = resourceNode(work.nodeId);
    if (!node || node.zone !== state.zone || !state.apostle.alive || Math.hypot(state.apostle.x - node.x, state.apostle.y - node.y) > 120) return;
    const elapsed = work === this.work ? this.workElapsed : 0;
    if (work.elapsed > elapsed && Math.floor(work.elapsed / .45) > Math.floor(elapsed / .45)) {
      this.burst(node.resource === "wood" ? "wood" : node.resource === "herb" ? "leaf" : "spark", node.x, node.y, node.resource === "herb" ? 3 : 4, node.resource === "herb" ? .35 : .8);
    }
  }

  private remember(state: GameState): void {
    this.x = state.apostle.x; this.y = state.apostle.y; this.hp = state.apostle.hp;
    this.work = state.frontier.work; this.workElapsed = this.work?.elapsed ?? 0;
    this.workRemaining = this.work ? state.frontier.resources[this.work.nodeId]?.remaining ?? 0 : 0;
    for (const enemy of state.enemies) {
      const previous = this.enemies.get(enemy.id);
      if (previous) { previous.hp = enemy.hp; previous.alive = enemy.alive; }
      else this.enemies.set(enemy.id, { hp: enemy.hp, alive: enemy.alive });
    }
  }

  private random(): number { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }

  private burst(kind: "dust" | "wood" | "spark" | "leaf" | "hit", x: number, y: number, count: number, height: number): void {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * Math.PI * 2, speed = (kind === "dust" ? .25 : .7) + this.random() * .9;
      this.emit(kind, x * WORLD_SCALE + (this.random() - .5) * .25, height, y * WORLD_SCALE + (this.random() - .5) * .25,
        Math.cos(angle) * speed, kind === "dust" ? .25 : .5 + this.random(), Math.sin(angle) * speed,
        kind === "dust" ? .3 + this.random() * .25 : kind === "leaf" ? .18 : .12 + this.random() * .09,
        kind === "leaf" ? 1.1 : kind === "dust" ? .7 : .45 + this.random() * .25,
        kind === "dust" ? .1 : kind === "leaf" ? .5 : 3, angle);
    }
  }

  private emit(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, gravity: number, rotation: number): void {
    if (this.frameBudget <= 0) return;
    if (this.pool.emit(kind, x, y, z, vx, vy, vz, size, life, gravity, rotation)) { this.frameBudget--; this.tokens--; }
  }
}

/** One draw call for all effects; all resources belong to this instance. */
export class WorldEffects {
  readonly group = new THREE.Group();
  readonly simulation = new EffectSimulation();
  private geometry = new THREE.BufferGeometry();
  private material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { pixelScale: { value: 700 } },
    vertexShader: `
      attribute float particleSize; attribute vec3 particleColor; attribute float particleOpacity;
      attribute float particleKind; attribute float particleRotation;
      uniform float pixelScale;
      varying vec3 tint; varying float alpha; varying float kind; varying float rotation;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(particleSize * pixelScale / max(1.0, -viewPosition.z), 1.0, 36.0);
        tint = particleColor; alpha = particleOpacity; kind = particleKind; rotation = particleRotation;
      }`,
    fragmentShader: `
      varying vec3 tint; varying float alpha; varying float kind; varying float rotation;
      void main() {
        vec2 point = gl_PointCoord * 2.0 - 1.0;
        float c = cos(rotation), s = sin(rotation);
        vec2 p = mat2(c, -s, s, c) * point;
        float shape;
        if (kind < 0.5) shape = (1.0 - smoothstep(0.15, 1.0, length(p))) * 0.4;
        else if (kind < 1.5) shape = 1.0 - smoothstep(0.65, 0.9, abs(p.x) + abs(p.y) * 1.7);
        else if (kind < 2.5) shape = (1.0 - smoothstep(0.1, 0.35, abs(p.x))) * (1.0 - smoothstep(0.35, 1.0, abs(p.y)));
        else if (kind < 3.5) shape = 1.0 - smoothstep(0.65, 1.0, length(p * vec2(1.6, 1.0)));
        else if (kind < 4.5) shape = (1.0 - smoothstep(0.08, 0.28, abs(p.y))) * (1.0 - smoothstep(0.5, 1.0, abs(p.x)));
        else if (kind < 5.5) shape = 1.0 - smoothstep(0.6, 1.0, abs(p.x) + abs(p.y));
        else shape = (1.0 - smoothstep(0.0, 1.0, length(p))) * (kind > 6.5 ? 0.85 : 0.45);
        if (shape * alpha < 0.015) discard;
        gl_FragColor = vec4(tint, shape * alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private points: THREE.Points;
  private attributes: THREE.BufferAttribute[] = [];
  private uploadedVersion = -1;
  private disposed = false;

  constructor() {
    this.group.name = "gameplay-effects";
    const pool = this.simulation.pool;
    for (const [name, array, size] of [
      ["position", pool.positions, 3], ["particleSize", pool.sizes, 1], ["particleColor", pool.colors, 3],
      ["particleOpacity", pool.opacities, 1], ["particleKind", pool.kinds, 1], ["particleRotation", pool.rotations, 1],
    ] as const) {
      const attribute = new THREE.BufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, attribute); this.attributes.push(attribute);
    }
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "pooled-particles"; this.points.frustumCulled = false; this.points.renderOrder = 3;
    this.group.add(this.points); this.upload();
  }

  get count(): number { return this.simulation.pool.count; }
  get capacity(): number { return this.simulation.pool.capacity; }
  get drawCalls(): number { return this.points.visible && !this.disposed ? 1 : 0; }
  get version(): number { return this.simulation.pool.version; }
  get counts(): Record<ParticleKind, number> {
    const counts = { dust: 0, wood: 0, spark: 0, leaf: 0, arc: 0, hit: 0, pollen: 0, firefly: 0 };
    const pool = this.simulation.pool;
    for (const kind in PARTICLE_KINDS) {
      const name = kind as ParticleKind;
      for (let slot = 0; slot < pool.count; slot++) if (pool.kinds[slot] === PARTICLE_KINDS[name]) counts[name]++;
    }
    return counts;
  }

  setProjection(height: number, pixelRatio: number, fov: number): void {
    this.material.uniforms.pixelScale.value = height * pixelRatio / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  reset(state?: GameState): void { if (!this.disposed) { this.simulation.reset(state); this.upload(); } }
  update(state: GameState, dt: number): void { if (!this.disposed) { this.simulation.update(state, dt); this.upload(); } }
  observePlayerAttack(state: GameState, staminaBefore: number, yaw: number): void {
    if (!this.disposed) this.simulation.observePlayerAttack(state, staminaBefore, yaw);
  }

  private upload(): void {
    const pool = this.simulation.pool;
    if (pool.version === this.uploadedVersion) return;
    this.geometry.setDrawRange(0, pool.count); this.points.visible = pool.count > 0;
    for (const attribute of this.attributes) attribute.needsUpdate = true;
    this.uploadedVersion = pool.version;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.simulation.reset(); this.geometry.dispose(); this.material.dispose(); this.group.clear();
  }
}

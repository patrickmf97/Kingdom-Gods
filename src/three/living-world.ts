import * as THREE from "three";

/**
 * Small signs of life, all presentation-only and GPU-animated from one time uniform:
 * chimney smoke, bird flocks wheeling overhead and butterflies over meadows.
 * Nothing here is saved, raycast or able to block the player.
 */
export const SMOKE_PUFFS = 18;
export const FLOCK_BIRDS = 9;
export const BUTTERFLIES = 36;

const softPuff = /* glsl */ `
  float puff(vec2 p) { float d = dot(p, p); return exp(-d * 4.0) * (1.0 - smoothstep(0.7, 1.0, d)); }
`;

export class LivingWorld {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly daylight = { value: 1 };
  private readonly wind = { value: new THREE.Vector2(.35, .12) };
  private readonly disposables: { dispose(): void }[] = [];

  constructor() {
    this.group.name = "living-world";
    this.group.userData.presentationOnly = true;
  }

  /** One smoke column per chimney top (world units). */
  setChimneys(tops: THREE.Vector3[]): void {
    for (const child of [...this.group.children]) if (child.name === "chimney-smoke") { this.group.remove(child); }
    if (!tops.length) return;
    const count = tops.length * SMOKE_PUFFS;
    const base = new Float32Array(count * 3), seed = new Float32Array(count);
    tops.forEach((top, c) => {
      for (let i = 0; i < SMOKE_PUFFS; i++) {
        const k = c * SMOKE_PUFFS + i;
        base.set([top.x, top.y, top.z], k * 3);
        seed[k] = i / SMOKE_PUFFS + c * .137;
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(base, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uDay: this.daylight, uWind: this.wind },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform vec2 uWind;
        varying float vAge; varying float vSeed;
        void main() {
          float age = fract(uTime * 0.07 + aSeed);
          vAge = age; vSeed = aSeed;
          vec3 p = position;
          p.y += age * 4.2;
          p.x += uWind.x * age * age * 5.0 + sin(uTime * 0.8 + aSeed * 40.0) * 0.18 * age;
          p.z += uWind.y * age * age * 5.0 + cos(uTime * 0.6 + aSeed * 31.0) * 0.18 * age;
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = (40.0 + age * 160.0) / max(1.0, -view.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDay; varying float vAge; varying float vSeed;
        ${softPuff}
        void main() {
          float a = puff(gl_PointCoord * 2.0 - 1.0);
          float life = smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
          vec3 colour = mix(vec3(0.16, 0.17, 0.19), vec3(0.78, 0.77, 0.74), uDay) * (0.9 + 0.1 * fract(vSeed * 7.0));
          gl_FragColor = vec4(colour, a * life * 0.32);
          if (gl_FragColor.a < 0.003) discard;
        }`,
    });
    const points = new THREE.Points(geometry, material);
    points.name = "chimney-smoke"; points.frustumCulled = false; points.raycast = () => {}; points.renderOrder = 8;
    this.group.add(points);
    this.disposables.push(geometry, material);
  }

  /** Flocks circle above a centre; wings flap in the vertex shader. */
  addFlocks(centres: THREE.Vector3[]): void {
    const wing = new THREE.BufferGeometry();
    // Two triangles sharing the body edge; x < 0 left wing, x > 0 right wing.
    wing.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, .12, -.42, 0, -.04, 0, 0, -.1, 0, 0, .12, 0, 0, -.1, .42, 0, -.04], 3));
    wing.computeVertexNormals();
    const count = centres.length * FLOCK_BIRDS;
    const mesh = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: 0x2b2a2a, side: THREE.DoubleSide }), count);
    const material = mesh.material as THREE.MeshBasicMaterial;
    const offsets = new Float32Array(count * 4);
    centres.forEach((centre, f) => {
      for (let i = 0; i < FLOCK_BIRDS; i++) {
        const k = f * FLOCK_BIRDS + i;
        offsets.set([centre.x, centre.y + (i % 3) * .8, centre.z, f * 1.7 + i * .21], k * 4);
        mesh.setMatrixAt(k, new THREE.Matrix4());
      }
    });
    wing.setAttribute("aFlock", new THREE.InstancedBufferAttribute(offsets, 4));
    material.onBeforeCompile = shader => {
      shader.uniforms.uTime = this.time; shader.uniforms.uDay = this.daylight;
      shader.vertexShader = `uniform float uTime; uniform float uDay; attribute vec4 aFlock;\n${shader.vertexShader}`
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          float id = aFlock.w;
          float flap = sin(uTime * (7.0 + fract(id * 3.1) * 3.0) + id * 9.0);
          transformed.y += abs(position.x) * flap * 0.8;
          float angle = uTime * (0.16 + fract(id * 1.3) * 0.05) + id * 0.7;
          float radius = 9.0 + fract(id * 5.7) * 6.0;
          vec3 centre = aFlock.xyz + vec3(cos(angle) * radius, sin(uTime * 0.3 + id) * 0.8, sin(angle) * radius);
          // Face along the circle's tangent.
          vec2 dir = normalize(vec2(-sin(angle), cos(angle)));
          transformed = vec3(transformed.x * dir.y + transformed.z * dir.x, transformed.y, -transformed.x * dir.x + transformed.z * dir.y);
          transformed = transformed * (uDay > 0.08 ? 1.0 : 0.0) + centre;`);
    };
    material.customProgramCacheKey = () => "kingdom-flock-v1";
    mesh.name = "bird-flocks"; mesh.frustumCulled = false; mesh.raycast = () => {};
    this.group.add(mesh);
    this.disposables.push(wing, material, mesh);
  }

  /** Butterflies flutter in loose loops over the given meadow points by day. */
  addButterflies(spots: THREE.Vector3[]): void {
    if (!spots.length) return;
    const count = Math.min(BUTTERFLIES, spots.length * 3);
    const base = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { const s = spots[i % spots.length]; base.set([s.x, .5, s.z], i * 3); seed[i] = i * .618; }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(base, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.time, uDay: this.daylight }, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uDay; varying float vSeed; varying float vFlap;
        void main() {
          vSeed = aSeed;
          float t = uTime * 0.5 + aSeed * 10.0;
          vec3 p = position + vec3(sin(t) * 1.4 + sin(t * 2.3) * 0.4, sin(t * 3.1) * 0.25 + 0.3, cos(t * 0.8) * 1.4);
          vFlap = abs(sin(uTime * 18.0 + aSeed * 30.0));
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = uDay < 0.15 ? 0.0 : 26.0 / max(1.0, -view.z);
        }`,
      fragmentShader: /* glsl */ `
        varying float vSeed; varying float vFlap;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          p.x /= max(0.15, vFlap);
          float wing = smoothstep(1.0, 0.6, length(vec2(abs(p.x) - 0.45, p.y * 1.3)));
          if (wing < 0.05) discard;
          vec3 colours[4] = vec3[](vec3(0.98, 0.85, 0.3), vec3(0.95, 0.95, 0.9), vec3(0.85, 0.45, 0.25), vec3(0.55, 0.65, 0.95));
          gl_FragColor = vec4(colours[int(mod(floor(vSeed * 3.7), 4.0))], wing);
        }`,
    });
    const points = new THREE.Points(geometry, material);
    points.name = "butterflies"; points.frustumCulled = false; points.raycast = () => {};
    this.group.add(points);
    this.disposables.push(geometry, material);
  }

  update(timeSeconds: number, daylight: number, wind = { x: .35, z: .12 }): void {
    this.time.value = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    this.daylight.value = Number.isFinite(daylight) ? THREE.MathUtils.clamp(daylight, 0, 1) : 1;
    this.wind.value.set(wind.x, wind.z);
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.group.clear();
  }
}

import * as THREE from "three";

/**
 * Presentation-only atmosphere around the camera focus: warm drifting motes by day,
 * blinking fireflies at dusk and night, cold embers in mines and crypts.
 * One Points draw call, fixed budget, never raycast and never part of the simulation.
 */
export const AMBIENCE_PARTICLES = 160;
const SPREAD = 22, HEIGHT = 5.5;

export type AmbienceMood = "outdoor" | "interior" | "underground";

export class AmbienceLayer {
  readonly group = new THREE.Group();
  private geometry = new THREE.BufferGeometry();
  private seeds = new Float32Array(AMBIENCE_PARTICLES * 4);
  private uniforms = {
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector3() },
    uDay: { value: 1 },
    uNight: { value: 0 },
    uMood: { value: 0 },
    uPixel: { value: 1 },
    uWet: { value: 0 },
  };
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;

  constructor() {
    this.group.name = "ambience";
    let state = 1013904223;
    const random = () => { state = Math.imul(state ^ state >>> 15, 2246822507) ^ Math.imul(state ^ state >>> 13, 3266489909); return ((state ^= state >>> 16) >>> 0) / 4294967295; };
    const base = new Float32Array(AMBIENCE_PARTICLES * 3);
    for (let i = 0; i < AMBIENCE_PARTICLES; i++) {
      base.set([random(), random(), random()], i * 3);
      this.seeds.set([random(), random(), random(), random()], i * 4);
    }
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(base, 3));
    this.geometry.setAttribute("seed", new THREE.Float32BufferAttribute(this.seeds, 4));
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        uniform float uTime, uDay, uNight, uMood, uPixel, uWet;
        uniform vec3 uFocus;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          float t = uTime * (0.05 + seed.x * 0.07);
          // Wrap a fixed cloud around the focus so motes never pop in at screen edges.
          vec3 local = vec3(position.x, position.y, position.z);
          local.x = fract(local.x + sin(t + seed.y * 6.283) * 0.04 + t * 0.12) - 0.5;
          local.z = fract(local.z + cos(t * 0.8 + seed.z * 6.283) * 0.04 + t * 0.05) - 0.5;
          local.y = fract(local.y + t * (uMood > 1.5 ? 0.35 : 0.08)) ;
          vec3 world = vec3(uFocus.x + local.x * ${SPREAD.toFixed(1)}, 0.15 + local.y * ${HEIGHT.toFixed(1)}, uFocus.z + local.z * ${SPREAD.toFixed(1)});
          // Fireflies hover low and wander; daylight motes float a little higher.
          world.y = mix(world.y, 0.25 + local.y * 2.2 + sin(uTime * 1.3 + seed.w * 20.0) * 0.18, uNight);
          vec4 view = modelViewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * view;
          float blink = 0.5 + 0.5 * sin(uTime * (1.5 + seed.x * 2.5) + seed.y * 40.0);
          float dayAlpha = 0.33 * smoothstep(0.15, 0.85, uDay) * (0.45 + 0.55 * seed.w) * (1.0 - uWet);
          float nightAlpha = uNight * pow(blink, 2.0) * step(0.35, seed.z) * 1.4 * (1.0 - uWet * 0.85);
          float underground = step(1.5, uMood) * (0.35 + 0.4 * blink) * step(0.55, seed.z);
          float interior = step(0.5, uMood) * step(uMood, 1.5) * 0.2 * (0.4 + 0.6 * seed.w);
          vAlpha = uMood < 0.5 ? max(dayAlpha, nightAlpha) : (uMood > 1.5 ? underground : interior);
          vColor = uMood > 1.5 ? vec3(1.0, 0.55, 0.22)
            : mix(vec3(1.0, 0.92, 0.72), vec3(0.78, 1.0, 0.45), uMood < 0.5 ? uNight : 0.0);
          float size = mix(1.6 + seed.x * 1.8, 3.2 + seed.y * 2.0, uMood < 0.5 ? uNight : (uMood > 1.5 ? 0.6 : 0.0));
          gl_PointSize = size * uPixel * (62.0 / max(1.0, -view.z));
          // Keep a lower bound so distant particles do not collapse into single noisy pixels.
          gl_PointSize = max(gl_PointSize, vAlpha > 0.01 ? 1.5 * uPixel : 0.0);
          // Near the eye, day motes stay pinpricks; only fireflies and embers may bloom larger.
          gl_PointSize = min(gl_PointSize, mix(3.5, 14.0, max(uNight, step(1.5, uMood))) * uPixel);
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float d = dot(p, p);
          if (d > 1.0 || vAlpha < 0.004) discard;
          float glow = exp(-d * 3.2);
          gl_FragColor = vec4(vColor * glow * vAlpha, glow * vAlpha);
        }`,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "ambience-motes";
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.raycast = () => {};
    this.points.userData.presentationOnly = true;
    this.group.add(this.points);
  }

  update(time: number, focus: THREE.Vector3, daylight: number, mood: AmbienceMood, wet: number, pixelRatio: number): void {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uFocus.value.copy(focus);
    const light = Number.isFinite(daylight) ? THREE.MathUtils.clamp(daylight, 0, 1) : 1;
    u.uDay.value = light;
    u.uNight.value = 1 - THREE.MathUtils.smoothstep(light, .05, .32);
    u.uMood.value = mood === "outdoor" ? 0 : mood === "interior" ? 1 : 2;
    u.uWet.value = THREE.MathUtils.clamp(wet, 0, 1);
    u.uPixel.value = pixelRatio;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }
}

/** Soft additive halo used around open flames, lanterns and lit windows. */
export function createGlowTexture(): THREE.DataTexture {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
    const a = Math.round(255 * Math.exp(-(dx * dx + dy * dy) * 4.2) * Math.max(0, 1 - Math.hypot(dx, dy)));
    data.set([255, 255, 255, a], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

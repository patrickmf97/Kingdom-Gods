import * as THREE from "three";
import type { WeatherSnapshot } from "../weather";
import type { Point } from "../types";
import { WORLD_SCALE } from "./coordinates";

export const WEATHER_CAPACITY = 296;
const TAU = Math.PI * 2;
const fract = (n: number) => n - Math.floor(n);
const seed = (i: number, salt: number) => fract(Math.sin(i * 127.1 + salt * 311.7) * 43758.5453);
const blend = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/** Recolors the two existing lights and atmospheric backdrop; creates no light or render pass. */
export function atmosphereFor(minutes: number, weather: WeatherSnapshot) {
  const hour = ((minutes % 1440) + 1440) % 1440;
  const daylight = Math.max(0, Math.sin((hour - 360) / 1440 * TAU));
  const twilight = Math.max(0, 1 - Math.min(Math.abs(hour - 390), Math.abs(hour - 1050)) / 115);
  const dayBlend = Math.min(1, daylight * 2.4);
  const cover = weather.outdoors ? weather.cloudiness : 0;
  const storm = weather.kind === "storm";
  const sky = blend(0x172c4d, 0xa8cbd0, dayBlend).lerp(new THREE.Color(0xe5b795), twilight * .44);
  sky.lerp(new THREE.Color(daylight > .1 ? 0x9cacae : 0x283e58), cover * .45);
  if (storm) sky.lerp(new THREE.Color(0x627786), .5);
  return {
    sky, sun: blend(0xa0b9ef, 0xffedce, dayBlend).lerp(new THREE.Color(0xffaa65), twilight * .85),
    ambient: blend(0x91b1e0, 0xfff0d8, dayBlend), ground: blend(0x344968, 0x697b55, dayBlend),
    ambientIntensity: .98 + daylight * (storm ? .8 : 1.02) - cover * .14,
    sunIntensity: .28 + daylight * 2.05 * (1 - cover * .42) * (storm ? .55 : 1) + twilight * .35,
    fogNear: weather.kind === "fog" ? 20 : storm ? 35 : weather.kind === "rain" ? 42 : 65,
    fogFar: weather.kind === "fog" ? 77 : storm ? 100 : weather.kind === "rain" ? 116 : 155,
    daylight, twilight,
  };
}

/** Fixed instanced quads: 256 rain streaks, 16 drifting clouds and 24 valley mist wisps. */
export class WeatherLayer {
  readonly group = new THREE.Group();
  readonly capacity = WEATHER_CAPACITY;
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly batches: THREE.InstancedMesh[] = [];
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly matrix = new THREE.Matrix4();
  private disposed = false;
  private signature = "";

  constructor() {
    this.group.name = "world-weather";
    for (const [kind, count] of [["rain", 256], ["clouds", 16], ["fog", 24]] as const) {
      const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
        uniforms: { tint: { value: new THREE.Color(kind === "rain" ? 0xd1e2ed : 0xe3e7de) }, opacity: { value: 0 }, rain: { value: kind === "rain" ? 1 : 0 } },
        vertexShader: `varying vec2 vUv;
          void main() {
            vUv = uv;
            vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
            center.xy += position.xy * vec2(sx, sy);
            gl_Position = projectionMatrix * center;
          }`,
        fragmentShader: `varying vec2 vUv; uniform vec3 tint; uniform float opacity; uniform float rain;
          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float shape = pow(max(0.0, 1.0 - dot(p, p)), 1.6);
            if (rain > 0.5) shape = (1.0 - smoothstep(0.25, 1.0, abs(p.x + p.y * 0.2))) * (1.0 - abs(p.y));
            float alpha = opacity * shape;
            if (alpha < 0.005) discard;
            gl_FragColor = vec4(tint, alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      const mesh = new THREE.InstancedMesh(this.geometry, material, count);
      mesh.name = `weather-${kind}`; mesh.userData.presentationOnly = true; mesh.raycast = () => {};
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = kind === "rain" ? 4 : 2;
      mesh.count = 0; mesh.visible = false; this.group.add(mesh); this.batches.push(mesh); this.materials.push(material);
    }
  }

  get count(): number { return this.disposed || !this.group.visible ? 0 : this.batches.reduce((total, mesh) => total + mesh.count, 0); }
  get drawCalls(): number { return this.disposed || !this.group.visible ? 0 : this.batches.filter(mesh => mesh.visible && mesh.count).length; }

  update(weather: WeatherSnapshot, presentationTime: number, focus: Point, minutes: number): void {
    if (this.disposed) return;
    const signature = `${weather.kind}:${weather.outdoors}:${weather.precipitation}:${weather.cloudiness}:${weather.wind}:${presentationTime}:${focus.x}:${focus.y}:${minutes}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.group.visible = weather.outdoors;
    if (!weather.outdoors) { for (const mesh of this.batches) { mesh.count = 0; mesh.visible = false; } return; }
    const time = Number.isFinite(presentationTime) ? Math.max(0, presentationTime) : 0;
    const profile = atmosphereFor(minutes, weather);
    const [rain, clouds, fog] = this.batches;
    rain.count = weather.kind === "rain" || weather.kind === "storm" ? Math.round(160 + Math.min(1, weather.precipitation) * 96) : 0;
    clouds.count = weather.cloudiness > .04 ? Math.ceil(5 + Math.min(1, weather.cloudiness) * 11) : 0;
    fog.count = weather.kind === "fog" ? 24 : weather.kind === "rain" || weather.kind === "storm" ? 8 : 0;
    this.materials[0].uniforms.opacity.value = .48;
    this.materials[1].uniforms.opacity.value = .1 + weather.cloudiness * .2;
    this.materials[2].uniforms.opacity.value = weather.kind === "fog" ? .21 : .07;
    this.materials[0].uniforms.tint.value.copy(profile.ambient);
    this.materials[1].uniforms.tint.value.copy(profile.sky).lerp(new THREE.Color(0xf5eee0), .12 + profile.daylight * .55);
    this.materials[2].uniforms.tint.value.copy(profile.sky);
    const x = focus.x * WORLD_SCALE, z = focus.y * WORLD_SCALE;
    for (let batch = 0; batch < this.batches.length; batch++) {
      const mesh = this.batches[batch]; mesh.visible = mesh.count > 0;
      for (let i = 0; i < mesh.count; i++) {
        const s = i + batch * 257, wind = weather.wind * time;
        const px = x + (fract(seed(s, 1) + wind * (batch === 0 ? .025 : .003)) - .5) * (batch === 0 ? 38 : 72);
        const pz = z + (seed(s, 2) - .5) * (batch === 0 ? 34 : 62);
        const py = batch === 0 ? .5 + fract(seed(s, 3) - time * .95) * 14 : batch === 1 ? 15 + seed(s, 4) * 9 : .6 + seed(s, 4) * 1.8;
        this.matrix.makeScale(batch === 0 ? .045 : batch === 1 ? 14 + seed(s, 5) * 13 : 10 + seed(s, 5) * 8,
          batch === 0 ? .58 + seed(s, 6) * .35 : batch === 1 ? 3 + seed(s, 6) * 3 : 1.3 + seed(s, 6), 1);
        this.matrix.setPosition(px, py, pz); mesh.setMatrixAt(i, this.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const mesh of this.batches) mesh.dispose();
    this.geometry.dispose(); for (const material of this.materials) material.dispose(); this.group.clear();
  }
}

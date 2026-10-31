import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SKY_SCATTERING_GLSL } from "./sky-scattering";


const ENV_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() { vDirection = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const ENV_FRAGMENT = /* glsl */ `
  uniform vec3 uSun; uniform float uDaylight; uniform float uCloudiness; uniform vec3 uGround;
  varying vec3 vDirection;
  ${SKY_SCATTERING_GLSL}
  void main() {
    vec3 d = normalize(vDirection);
    vec3 sky = kgSkyScattering(d, uSun, uDaylight, uCloudiness);
    // The lower hemisphere is lit ground, so shadows and undersides pick up grass bounce.
    vec3 ground = uGround * (0.15 + 0.85 * smoothstep(-0.02, 0.4, uDaylight));
    gl_FragColor = vec4(mix(ground, sky, smoothstep(-0.12, 0.05, d.y)), 1.0);
  }
`;

export interface SkyLightState {
  sunDirection: THREE.Vector3;
  daylight: number;
  cloudiness: number;
  outdoors: boolean;
}

/** Image-based lighting regenerated only when the sky changes noticeably. */
export class SkyEnvironment {
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private target: THREE.WebGLRenderTarget | null = null;
  private indoor: THREE.WebGLRenderTarget | null = null;
  private signature = "";

  constructor(private renderer: THREE.WebGLRenderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uDaylight: { value: 1 }, uCloudiness: { value: 0 }, uGround: { value: new THREE.Color(0x5f6d48) } },
      vertexShader: ENV_VERTEX, fragmentShader: ENV_FRAGMENT, side: THREE.BackSide, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.material);
    this.envScene.add(this.mesh);
  }

  /** Returns the current environment texture; rebuilds at most when light shifts by a visible amount. */
  update(sky: SkyLightState): THREE.Texture {
    if (!sky.outdoors) {
      // Warm, enclosed bounce for interiors, mines and crypts.
      if (!this.indoor) {
        this.material.uniforms.uSun.value.set(.2, .9, .3).normalize();
        this.material.uniforms.uDaylight.value = .55;
        this.material.uniforms.uCloudiness.value = 1;
        this.material.uniforms.uGround.value.set(0x6b5236);
        this.indoor = this.pmrem.fromScene(this.envScene, 0, .1, 50);
        this.signature = "";
      }
      return this.indoor.texture;
    }
    const q = (n: number, step: number) => Math.round(n / step);
    const signature = [q(sky.sunDirection.x, .08), q(sky.sunDirection.y, .05), q(sky.sunDirection.z, .08), q(sky.daylight, .05), q(sky.cloudiness, .1)].join(":");
    if (signature !== this.signature || !this.target) {
      this.signature = signature;
      this.material.uniforms.uSun.value.copy(sky.sunDirection);
      this.material.uniforms.uDaylight.value = sky.daylight;
      this.material.uniforms.uCloudiness.value = sky.cloudiness;
      this.material.uniforms.uGround.value.set(0x5f6d48);
      const previous = this.target;
      this.target = this.pmrem.fromScene(this.envScene, 0, .1, 50);
      previous?.dispose();
    }
    return this.target.texture;
  }

  dispose(): void {
    this.target?.dispose(); this.indoor?.dispose();
    this.pmrem.dispose(); this.material.dispose(); this.mesh.geometry.dispose();
  }
}

/** Filmic grade applied after tone mapping: gentle S-curve, warm highlights, cool shadows, vignette. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uVignette: { value: .32 }, uWarmth: { value: 1 }, uSaturation: { value: 1.08 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uVignette; uniform float uWarmth; uniform float uSaturation;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(luma), c, uSaturation);
      c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;
      vec3 shadows = vec3(0.94, 0.98, 1.05), highlights = vec3(1.05, 1.0, 0.93);
      c *= mix(vec3(1.0), mix(shadows, highlights, smoothstep(0.15, 0.85, luma)), uWarmth);
      vec2 p = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.8, dot(p, p) * 2.2);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
    }`,
};

export interface PostQuality { enabled: boolean; ambientOcclusion: boolean; bloom: boolean; samples: number }

/**
 * Choose a pipeline that stays smooth on phones and integrated GPUs.
 * `?gfx=high|low|off` in the address overrides the automatic choice.
 */
export function postQualityFor(coarsePointer: boolean, width: number, search = ""): PostQuality {
  const forced = new URLSearchParams(search).get("gfx");
  if (forced === "off") return { enabled: false, ambientOcclusion: false, bloom: false, samples: 0 };
  if (forced === "low") return { enabled: true, ambientOcclusion: false, bloom: false, samples: 0 };
  if (forced === "high") return { enabled: true, ambientOcclusion: true, bloom: true, samples: 4 };
  const small = coarsePointer || width < 760;
  return { enabled: true, ambientOcclusion: !small, bloom: true, samples: small ? 0 : 4 };
}

/** Frame-time watchdog: steps quality down when the average frame stays slow. */
export class FrameBudget {
  private total = 0;
  private frames = 0;
  constructor(private readonly limitMs = 30, private readonly window = 90) {}
  /** Returns true when a full window averaged above the limit. */
  sample(ms: number): boolean {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 1000) return false;
    this.total += ms; this.frames++;
    if (this.frames < this.window) return false;
    const slow = this.total / this.frames > this.limitMs;
    this.total = 0; this.frames = 0;
    return slow;
  }
}

export class PostProcessing {
  readonly composer: EffectComposer;
  private ao?: GTAOPass;
  private bloom?: UnrealBloomPass;
  private grade: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, readonly quality: PostQuality) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: quality.samples });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    if (quality.ambientOcclusion) {
      this.ao = new GTAOPass(scene, camera, size.x, size.y);
      this.ao.updateGtaoMaterial({ radius: .55, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 12, distanceFallOff: 1 });
      this.ao.blendIntensity = .85;
      this.composer.addPass(this.ao);
    }
    if (quality.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), .22, .55, .88);
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  /** Night lifts bloom so lanterns glow; interiors soften the vignette. */
  setMood(daylight: number, indoors: boolean): void {
    if (this.bloom) {
      const night = 1 - THREE.MathUtils.smoothstep(daylight, .05, .4);
      this.bloom.strength = .18 + night * .32;
      this.bloom.threshold = .9 - night * .25;
    }
    this.grade.uniforms.uVignette.value = indoors ? .26 : .32;
  }

  /** Drops the most expensive remaining effect; returns false when nothing is left to drop. */
  degrade(): boolean {
    if (this.ao?.enabled) { this.ao.enabled = false; return true; }
    if (this.composer.renderTarget1.samples > 0) {
      for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) { target.samples = 0; target.dispose(); }
      return true;
    }
    if (this.bloom?.enabled) { this.bloom.enabled = false; return true; }
    return false;
  }

  render(): void { this.composer.render(); }

  dispose(): void {
    this.ao?.dispose(); this.bloom?.dispose(); this.grade.dispose?.();
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    this.composer.dispose();
  }
}

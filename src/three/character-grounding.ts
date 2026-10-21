import * as THREE from "three";

export interface CharacterFoot { x: number; y: number; z: number }
export interface CharacterShadowLight { daylight: number; cloudiness: number; indoors: boolean }

/** Soft foot contact and projected silhouettes, batched without a shadow-map pass. */
export class CharacterGrounding {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { castStrength: { value: .2 }, contactStrength: { value: .28 } },
    vertexShader: `attribute float shadowKind; varying vec2 shadowUv; varying float kind;
      void main() { shadowUv = uv; kind = shadowKind;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 shadowUv; varying float kind;
      uniform float castStrength; uniform float contactStrength;
      float softOval(vec2 p, vec2 center, vec2 size) {
        vec2 q = (p - center) / size;
        return 1.0 - smoothstep(0.45, 1.0, length(q));
      }
      void main() {
        vec2 p = shadowUv * 2.0 - 1.0;
        float shape; float opacity;
        if (kind < 0.5) {
          shape = exp(-dot(p, p * vec2(3.4, 4.5))) * (1.0 - smoothstep(.7, 1.0, length(p)));
          opacity = contactStrength;
        } else {
          float head = softOval(p, vec2(0.0, .57), vec2(.32, .26));
          float shoulders = softOval(p, vec2(0.0, .22), vec2(.67, .28));
          float torso = softOval(p, vec2(0.0, -.05), vec2(.44, .52));
          float legs = max(softOval(p, vec2(-.16, -.57), vec2(.18, .40)),
                           softOval(p, vec2(.16, -.57), vec2(.18, .40)));
          shape = max(max(head, shoulders), max(torso, legs));
          opacity = castStrength * (1.0 - smoothstep(.45, 1.1, p.y) * .32);
        }
        float alpha = shape * opacity;
        if (alpha < .004) discard;
        gl_FragColor = vec4(.065, .085, .065, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  private readonly mesh: THREE.InstancedMesh;
  private readonly kinds: THREE.InstancedBufferAttribute;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private disposed = false;
  private readonly capacity: number;

  constructor(capacity = 64) {
    this.capacity = Math.max(1, Math.min(128, Number.isFinite(capacity) ? Math.floor(capacity) : 64));
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity * 2);
    this.mesh.name = "soft-character-shadows";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.kinds = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 2), 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("shadowKind", this.kinds);
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false;
    this.mesh.raycast = () => {}; this.mesh.renderOrder = 1;
    this.group.name = "character-grounding"; this.group.add(this.mesh);
  }
  get count(): number { return this.disposed ? 0 : this.mesh.count; }
  get drawCalls(): number { return this.count ? 1 : 0; }

  update(actors: readonly CharacterFoot[], light: CharacterShadowLight): void {
    if (this.disposed) return;
    const daylight = THREE.MathUtils.clamp(Number.isFinite(light.daylight) ? light.daylight : 0, 0, 1);
    const cover = THREE.MathUtils.clamp(Number.isFinite(light.cloudiness) ? light.cloudiness : 1, 0, 1);
    const cast = light.indoors || daylight > .06;
    const length = light.indoors ? 1.18 : 1.48 + (1 - daylight) * 1.6;
    this.material.uniforms.castStrength.value = light.indoors ? .075 : (.10 + daylight * .11) * (1 - cover * .72);
    this.material.uniforms.contactStrength.value = light.indoors ? .24 : .27;
    let index = 0, accepted = 0;
    const set = (actor: CharacterFoot, kind: number) => {
      if (kind === 0) {
        this.position.set(actor.x, actor.y + .055, actor.z);
        this.scale.set(.94, 1, .82); this.rotation.identity();
      } else {
        this.position.set(actor.x + .878 * length * .29, actor.y + .054, actor.z - .479 * length * .29);
        this.scale.set(.84, 1, length); this.rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, 2.07 + Math.PI);
      }
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(index, this.matrix); this.kinds.setX(index, kind); index++;
    };
    for (const actor of actors) {
      if (!Number.isFinite(actor.x + actor.y + actor.z)) continue;
      if (accepted++ === this.capacity) break;
      set(actor, 0); if (cast) set(actor, 1);
    }
    this.mesh.count = index; this.mesh.visible = index > 0;
    this.mesh.instanceMatrix.needsUpdate = true; this.kinds.needsUpdate = true;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    this.geometry.dispose(); this.material.dispose(); this.mesh.dispose(); this.group.clear();
  }
}

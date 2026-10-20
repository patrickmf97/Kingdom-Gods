import * as THREE from "three";
import type { GameState, Zone } from "../types";
import { LIGHTNING_RADIUS } from "../storms";
import { WORLD_SCALE } from "./coordinates";

/** A fixed two-draw warning/impact layer. It never decides or applies damage. */
export class LightningLayer {
  readonly group = new THREE.Group();
  private readonly ringGeometry = new THREE.RingGeometry(LIGHTNING_RADIUS * WORLD_SCALE * .92, LIGHTNING_RADIUS * WORLD_SCALE, 48);
  private readonly discGeometry = new THREE.CircleGeometry(LIGHTNING_RADIUS * WORLD_SCALE, 48);
  private readonly ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffdc8b, transparent: true, opacity: .8, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  private readonly discMaterial = new THREE.MeshBasicMaterial({ color: 0xee9d59, transparent: true, opacity: .09, side: THREE.DoubleSide, depthTest: false, depthWrite: false });
  private readonly boltMaterial = new THREE.LineBasicMaterial({ color: 0xe4efff, transparent: true, opacity: 1, depthTest: true, depthWrite: false });
  private readonly boltGeometry = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(144 * 3);
  private readonly ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
  private readonly disc = new THREE.Mesh(this.discGeometry, this.discMaterial);
  private readonly bolt: THREE.LineSegments;
  private impactId = -1;
  private disposed = false;
  flash = 0;

  constructor() {
    this.group.name = "lightning-events";
    this.boltGeometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.boltGeometry.setDrawRange(0, 0);
    this.bolt = new THREE.LineSegments(this.boltGeometry, this.boltMaterial);
    this.bolt.frustumCulled = false;
    for (const mesh of [this.ring, this.disc]) { mesh.rotation.x = -Math.PI / 2; mesh.position.y = .06; mesh.renderOrder = 8; }
    for (const object of [this.ring, this.disc, this.bolt]) { object.raycast = () => {}; this.group.add(object); }
    this.group.visible = false;
  }
  private buildBolt(id: number): void {
    let index = 0;
    const point = (step: number) => new THREE.Vector3(step === 12 ? 0 : Math.sin(step * 3.71 + id) * .6,
      26 * (1 - step / 12), step === 12 ? 0 : Math.cos(step * 2.27 + id) * .5);
    const segment = (a: THREE.Vector3, b: THREE.Vector3) => {
      for (const p of [a, b]) { this.positions[index++] = p.x; this.positions[index++] = p.y; this.positions[index++] = p.z; }
    };
    for (let step = 0; step < 12; step++) {
      segment(point(step), point(step + 1));
      if (step === 3 || step === 6 || step === 8) {
        const a = point(step), b = a.clone().add(new THREE.Vector3(Math.sin(id + step) * 3, -3, Math.cos(id + step) * 2));
        segment(a, b); segment(b, b.clone().add(new THREE.Vector3(.6, -2, -.7)));
      }
    }
    this.boltGeometry.setDrawRange(0, index / 3);
    this.boltGeometry.getAttribute("position").needsUpdate = true;
  }
  update(state: GameState, zone: Zone, presentationTime: number): void {
    if (this.disposed) return;
    this.flash = 0;
    const storm = state.worldLife?.storm;
    const warning = storm?.warning?.zone === zone ? storm.warning : null;
    const impact = storm?.impact?.zone === zone ? storm.impact : null;
    const event = warning ?? impact;
    this.group.visible = !!event && (zone === "village" || zone === "wilderness" || zone === "highlands");
    if (!event || !this.group.visible) return;
    this.group.position.set(event.x * WORLD_SCALE, 0, event.y * WORLD_SCALE);
    this.ring.visible = !!warning; this.disc.visible = true; this.bolt.visible = !!impact;
    this.ringMaterial.opacity = .65 + Math.sin(presentationTime * 8) * .18;
    this.discMaterial.opacity = warning ? .07 + (3.5 - warning.remaining) / 3.5 * .06 : impact!.remaining / 1.2 * .12;
    if (impact) {
      if (this.impactId !== impact.id) { this.impactId = impact.id; this.buildBolt(impact.id); }
      const age = 1.2 - impact.remaining;
      this.bolt.visible = age < .24;
      this.boltMaterial.opacity = Math.max(0, 1 - age / .24);
      this.flash = Math.max(0, 1 - age / .2) * .35;
    }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.flash = 0;
    this.ringGeometry.dispose(); this.discGeometry.dispose(); this.boltGeometry.dispose();
    this.ringMaterial.dispose(); this.discMaterial.dispose(); this.boltMaterial.dispose(); this.group.clear();
  }
}

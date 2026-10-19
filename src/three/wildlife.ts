import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { AnimalSpecies, AnimalState, GameState, Zone } from "../types";
import { WORLD_SCALE } from "./coordinates";

export interface WildlifeLayer {
  group: THREE.Group;
  update(state: GameState, zone: Zone, timeSeconds: number): void;
  dispose(): void;
}

type Shape = "round" | "box" | "cone" | "cylinder";
type V3 = [number, number, number];
interface Detail { name: string; shape: Shape; color: string; at: V3; size: V3; turn?: V3 }
interface Part { name: string; at: V3; details: Detail[] }
interface Template { parts: Part[]; legHeight: number; geometry: Map<string, THREE.BufferGeometry> }
interface AnimalModel {
  group: THREE.Group;
  rig: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  tail: THREE.Group;
  wings: THREE.Group[];
  species: AnimalSpecies;
  restOffset: number;
  phase: number;
  sample?: { x: number; y: number; time: number; moving: boolean };
}

const C = {
  ink: "#282b28", white: "#f6ead1", pink: "#ce978b", hoof: "#554c40",
  horn: "#bdac81", red: "#b84b39", beak: "#d9a440", leaf: "#567362",
};
const COATS: Record<AnimalSpecies, readonly [string, string, string][]> = {
  chicken: [["#eee5ce", "#bcad8d", "#615d4a"], ["#ad7140", "#dfb575", "#4c493b"], ["#5b4a3c", "#9a7b52", "#d2bb8d"]],
  sheep: [["#e2d7b8", "#8b7a62", "#b8aa8a"], ["#c8b798", "#544c40", "#a89778"], ["#eee5ce", "#88755e", "#cfc3a6"]],
  cow: [["#eee2c8", "#584638", "#8a6b50"], ["#b2774c", "#f3e4cb", "#654936"], ["#d5b08a", "#674f3d", "#a98563"]],
  dog: [["#aa7b4a", "#f0ddbb", "#614e36"], ["#7e6a51", "#e6cfaa", "#51493d"], ["#c09665", "#f0dfbf", "#66533e"]],
  deer: [["#ad7d51", "#e7d3ad", "#70533b"], ["#9b7756", "#e2ceb0", "#684e3a"], ["#ba8b5a", "#ecdbb9", "#7a5a40"]],
  rabbit: [["#aa967c", "#e9deca", "#6f6658"], ["#c2ae8f", "#f3e5cf", "#8a7c68"], ["#8d887b", "#ded5bf", "#655f53"]],
  fox: [["#ba6938", "#edddbc", "#574739"], ["#c77a43", "#f4e2c2", "#67503b"], ["#ad6339", "#e5d1af", "#4e4033"]],
};

function hash(id: string): number {
  let value = 2166136261;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** Articulated pieces are merged by joint, retaining a single vertex-coloured material. */
function anatomy(species: AnimalSpecies, variant: number): { parts: Part[]; legHeight: number } {
  const [coat, cream, dark] = COATS[species][variant];
  const parts: Part[] = [];
  function part(name: string, at: V3 = [0, 0, 0]): Part {
    const value = { name, at, details: [] }; parts.push(value); return value;
  }
  function add(to: Part, name: string, shape: Shape, color: string, at: V3, size: V3, turn?: V3) {
    to.details.push({ name, shape, color, at, size, turn });
  }
  function round(to: Part, name: string, color: string, at: V3, size: V3, turn?: V3) {
    add(to, name, "round", color, at, size, turn);
  }
  function eyes(head: Part, x: number, y: number, z: number, radius: number) {
    for (const side of [-1, 1]) {
      round(head, side < 0 ? "eye-left" : "eye-right", C.ink, [side * x, y, z], [radius, radius * 1.1, radius * .7]);
      round(head, "eye-glint", C.white, [side * (x + radius * .25), y + radius * .28, z + radius * .6], [radius * .22, radius * .22, radius * .22]);
    }
  }
  function ears(head: Part, x: number, y: number, z: number, width: number, height: number, length: number, tilt = .4, prefix = "ear") {
    for (const side of [-1, 1]) {
      const name = side < 0 ? "left" : "right";
      round(head, `${prefix}-${name}`, coat, [side * x, y, z], [width, height, length], [0, 0, -side * tilt]);
      round(head, `inner-ear-${name}`, species === "rabbit" ? C.pink : cream, [side * x, y, z + length * .7], [width * .52, height * .74, length * .32], [0, 0, -side * tilt]);
    }
  }
  function legs(height: number, spread: number, front: number, back: number, radius: number, footColor: string, rabbit = false) {
    for (const fore of [true, false]) for (const side of [-1, 1]) {
      const name = `${fore ? "front" : "hind"}-${side < 0 ? "left" : "right"}`;
      const leg = part(`leg-${name}`, [side * spread, height, fore ? front : back]);
      round(leg, "leg", coat, [0, -height * .38, 0], [radius, height * .43, radius]);
      add(leg, species === "fox" ? "dark-stocking" : `hoof-${name}`, "box", footColor,
        [0, -height + .065, .025], [radius * 1.85, .13, rabbit ? .28 : radius * 2.1]);
      if (rabbit && !fore) round(leg, `hind-foot-${side < 0 ? "left" : "right"}`, coat, [0, -height + .08, .07], [.105, .08, .24]);
    }
  }
  function branch(to: Part, name: string, from: V3, end: V3, radius: number, color = C.horn) {
    const direction = new THREE.Vector3(...end).sub(new THREE.Vector3(...from));
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
    add(to, name, "cylinder", color, [(from[0] + end[0]) / 2, (from[1] + end[1]) / 2, (from[2] + end[2]) / 2], [radius, direction.length(), radius], [rotation.x, rotation.y, rotation.z]);
  }

  const body = part("body");
  if (species === "chicken") {
    round(body, "breast", coat, [0, .44, .015], [.24, .29, .31]);
    round(body, "back", cream, [0, .54, -.1], [.21, .18, .27]);
    for (const side of [-1, 1]) {
      const wing = part(`wing-${side < 0 ? "left" : "right"}`, [side * .21, .49, -.015]);
      round(wing, wing.name, cream, [side * .015, -.035, -.015], [.065, .19, .255], [.15, 0, -side * .14]);
      for (let feather = 0; feather < 3; feather++) round(wing, "wing-feather", coat, [side * .045, -.13 + feather * .04, -.09 - feather * .025], [.032, .08, .13], [.25, 0, 0]);
      const leg = part(`leg-front-${side < 0 ? "left" : "right"}`, [side * .095, .235, .025]);
      add(leg, "shank", "cylinder", C.beak, [0, -.105, 0], [.021, .21, .021]);
      for (let toe = -1; toe <= 1; toe++) add(leg, `toe-${side < 0 ? "left" : "right"}`, "box", C.beak, [toe * .025, -.218, .045], [.022, .027, .15], [0, toe * .32, 0]);
    }
    const head = part("head", [0, .67, .18]);
    round(head, "neck", coat, [0, -.015, 0], [.12, .2, .12]);
    round(head, "head", coat, [0, .135, .07], [.15, .155, .15]);
    add(head, "beak", "cone", C.beak, [0, .09, .245], [.075, .18, .052], [Math.PI / 2, 0, 0]);
    for (let crest = 0; crest < 3; crest++) round(head, "comb", C.red, [0, .29 + (crest === 1 ? .025 : 0), .005 + crest * .06], [.035, .075, .052]);
    round(head, "wattle", C.red, [0, -.015, .185], [.038, .075, .04]);
    eyes(head, .123, .16, .153, .025);
    const tail = part("tail", [0, .56, -.245]);
    for (const side of [-1, 0, 1]) round(tail, "tail-feathers", dark, [side * .065, .14, -.09], [.07, .23, .075], [-.6, 0, side * .3]);
    return { parts, legHeight: .235 };
  }
  if (species === "sheep") {
    round(body, "wool", coat, [0, .83, 0], [.41, .4, .68]);
    for (const side of [-1, 1]) for (let tuft = 0; tuft < 4; tuft++) round(body, "wool-curl", variant === 1 ? cream : coat,
      [side * .255, .92 + (tuft % 2) * .07, -.4 + tuft * .26], [.23, .27, .25]);
    legs(.59, .24, .4, -.4, .065, C.hoof);
    const head = part("head", [0, .92, .54]);
    round(head, "face", cream, [0, -.02, .16], [.21, .25, .26]);
    round(head, "muzzle", cream, [0, -.17, .31], [.18, .13, .16]);
    round(head, "nose", dark, [0, -.13, .445], [.09, .055, .025]);
    round(head, "wool-cap", coat, [0, .17, .09], [.24, .13, .21]);
    ears(head, .265, .055, .06, .17, .07, .08, .32);
    eyes(head, .18, .035, .29, .029);
    const tail = part("tail", [0, .8, -.61]);
    round(tail, "wool-tail", coat, [0, -.06, -.055], [.1, .16, .11], [-.25, 0, 0]);
    return { parts, legHeight: .59 };
  }
  if (species === "cow") {
    round(body, "barrel", coat, [0, 1.11, -.03], [.49, .53, .88]);
    round(body, "shoulders", coat, [0, 1.22, .47], [.43, .43, .4]);
    for (const side of [-1, 1]) {
      round(body, "coat-patch", cream, [side * .43, 1.21, -.23], [.075, .28, .33], [0, side * .13, .2]);
      round(body, "coat-patch", cream, [side * .32, 1.42, .32], [.14, .14, .28]);
    }
    round(body, "udder", C.pink, [0, .66, -.32], [.22, .16, .22]);
    legs(.82, .305, .57, -.59, .095, C.hoof);
    const head = part("head", [0, 1.25, .76]);
    round(head, "neck", coat, [0, -.015, -.035], [.29, .35, .27]);
    round(head, "head", coat, [0, .05, .29], [.29, .35, .34]);
    round(head, "muzzle", variant === 0 ? C.pink : cream, [0, -.115, .56], [.31, .19, .21]);
    for (const side of [-1, 1]) {
      round(head, "nostril", dark, [side * .16, -.08, .744], [.042, .029, .02]);
      add(head, `horn-${side < 0 ? "left" : "right"}`, "cone", C.horn, [side * .255, .365, .19], [.055, .28, .055], [0, 0, -side * .55]);
    }
    round(head, "forehead-blaze", cream, [0, .18, .57], [.09, .21, .035]);
    ears(head, .36, .19, .145, .19, .085, .12, .2);
    eyes(head, .257, .105, .465, .035);
    const tail = part("tail", [0, 1.22, -.855]);
    branch(tail, "tail", [0, 0, 0], [.025, -.58, -.1], .034, coat);
    round(tail, "tail-tuft", dark, [.025, -.61, -.105], [.07, .13, .075]);
    return { parts, legHeight: .82 };
  }
  if (species === "deer") {
    round(body, "torso", coat, [0, 1.12, -.045], [.32, .36, .68]);
    round(body, "cream-belly", cream, [0, .92, -.08], [.26, .15, .52]);
    round(body, "white-rump", cream, [0, 1.12, -.65], [.23, .25, .06]);
    legs(.92, .205, .45, -.46, .045, C.hoof);
    const head = part("head", [0, 1.25, .5]);
    round(head, "long-neck", coat, [0, .19, .03], [.16, .44, .21], [-.35, 0, 0]);
    round(head, "throat", cream, [0, .17, .2], [.11, .3, .075], [-.35, 0, 0]);
    round(head, "head", coat, [0, .57, .14], [.18, .22, .26]);
    round(head, "muzzle", coat, [0, .48, .37], [.13, .13, .2], [-.15, 0, 0]);
    round(head, "nose", dark, [0, .47, .548], [.09, .065, .045]);
    ears(head, .24, .76, .09, .11, .23, .075, .7);
    eyes(head, .155, .59, .3, .032);
    if (variant !== 1) for (const side of [-1, 1]) {
      branch(head, `antler-${side < 0 ? "left" : "right"}`, [side * .11, .74, .04], [side * .24, 1.23, -.14], .026);
      branch(head, "antler-prong", [side * .17, .98, -.04], [side * .39, 1.19, .01], .021);
      branch(head, "antler-prong", [side * .21, 1.09, -.09], [side * .16, 1.36, -.06], .018);
    }
    const tail = part("tail", [0, 1.2, -.67]);
    round(tail, "short-tail", cream, [0, -.025, -.06], [.075, .12, .12], [-.5, 0, 0]);
    return { parts, legHeight: .92 };
  }
  if (species === "rabbit") {
    round(body, "round-haunch", coat, [0, .35, -.11], [.26, .3, .37]);
    round(body, "chest", cream, [0, .33, .17], [.19, .23, .19]);
    for (const side of [-1, 1]) round(body, "hind-haunch", coat, [side * .16, .23, -.21], [.16, .21, .22]);
    legs(.225, .15, .23, -.23, .047, coat, true);
    const head = part("head", [0, .48, .26]);
    round(head, "head", coat, [0, .055, .03], [.19, .21, .205]);
    ears(head, .105, .36, -.015, .065, .31, .06, .17, "long-ear");
    for (const side of [-1, 1]) round(head, "cheek", cream, [side * .075, -.04, .185], [.095, .085, .08]);
    round(head, "nose", C.pink, [0, -.005, .246], [.039, .027, .025]);
    eyes(head, .163, .095, .133, .033);
    const tail = part("tail", [0, .32, -.43]);
    round(tail, "cotton-tail", cream, [0, 0, -.02], [.12, .12, .12]);
    return { parts, legHeight: .225 };
  }
  const fox = species === "fox";
  const height = fox ? .47 : .52;
  round(body, "torso", coat, [0, fox ? .62 : .68, -.02], [fox ? .24 : .27, .27, fox ? .57 : .51]);
  round(body, "chest-bib", cream, [0, fox ? .65 : .71, .37], [.2, .25, .19]);
  legs(height, .17, .35, -.35, fox ? .052 : .064, fox ? dark : cream);
  const head = part("head", [0, fox ? .76 : .86, .43]);
  round(head, "head", coat, [0, .055, .13], [fox ? .22 : .225, .24, .25]);
  round(head, "muzzle", cream, [0, -.03, .36], [fox ? .105 : .155, .12, .23]);
  round(head, "nose", C.ink, [0, .005, .55], [fox ? .055 : .075, .045, .052]);
  eyes(head, .18, .125, .29, .033);
  for (const side of [-1, 1]) {
    if (fox) {
      add(head, `pointed-ear-${side < 0 ? "left" : "right"}`, "cone", dark, [side * .15, .33, .05], [.105, .34, .095], [0, 0, -side * .2]);
      add(head, "ear-inner", "cone", cream, [side * .15, .335, .11], [.055, .23, .032], [0, 0, -side * .2]);
      round(head, "cheek-ruff", cream, [side * .18, -.035, .17], [.13, .12, .17], [0, 0, side * .4]);
    } else {
      round(head, `ear-${side < 0 ? "left" : "right"}`, dark, [side * .22, .025, .07], [.095, .23, .14], [.1, 0, side * .18]);
    }
  }
  if (!fox) {
    round(body, "collar", C.leaf, [0, .86, .36], [.225, .085, .22], [-.35, 0, 0]);
    round(body, "collar-tag", C.beak, [0, .795, .565], [.045, .055, .02]);
    round(body, "saddle-marking", dark, [0, .84, -.08], [.23, .12, .35]);
  }
  const tail = part("tail", [0, fox ? .64 : .78, fox ? -.54 : -.46]);
  round(tail, "tail", coat, [0, fox ? -.06 : .16, -.26], [fox ? .17 : .085, fox ? .18 : .1, fox ? .4 : .32], [fox ? -.1 : .65, 0, 0]);
  if (fox) round(tail, "white-tail-tip", cream, [0, -.075, -.59], [.125, .135, .18], [-.1, 0, 0]);
  return { parts, legHeight: height };
}

/** Models face +Z. Only this layer owns its primitive, merged and material caches. */
export function createWildlifeLayer(): WildlifeLayer {
  const group = new THREE.Group(); group.name = "wildlife";
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .94 });
  const primitives = new Map<Shape, THREE.BufferGeometry>();
  const templates = new Map<string, Template>();
  const models = new Map<string, AnimalModel>();
  let disposed = false;
  function primitive(shape: Shape) {
    let value = primitives.get(shape);
    if (!value) {
      value = shape === "round" ? new THREE.SphereGeometry(1, 8, 6)
        : shape === "box" ? new THREE.BoxGeometry(1, 1, 1)
        : shape === "cone" ? new THREE.ConeGeometry(1, 1, 6)
        : new THREE.CylinderGeometry(1, 1, 1, 6);
      value.deleteAttribute("uv");
      primitives.set(shape, value);
    }
    return value;
  }
  function template(species: AnimalSpecies, variant: number) {
    const key = `${species}:${variant}`;
    let value = templates.get(key);
    if (value) return value;
    const definition = anatomy(species, variant);
    value = { ...definition, geometry: new Map() };
    for (const part of definition.parts) {
      const pieces = part.details.map(detail => {
        const geometry = primitive(detail.shape).clone();
        const color = new THREE.Color(detail.color);
        const colors = new Float32Array(geometry.getAttribute("position").count * 3);
        for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
        const transform = new THREE.Matrix4().compose(new THREE.Vector3(...detail.at),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(...(detail.turn ?? [0, 0, 0]))), new THREE.Vector3(...detail.size));
        geometry.applyMatrix4(transform);
        return geometry;
      });
      const geometry = mergeGeometries(pieces, false)!;
      for (const piece of pieces) piece.dispose();
      geometry.computeBoundingSphere();
      value.geometry.set(part.name, geometry);
    }
    templates.set(key, value);
    return value;
  }
  function model(animal: AnimalState) {
    const identity = hash(animal.id), variant = identity % 3;
    const cached = models.get(animal.id);
    if (cached?.species === animal.species) return cached;
    if (cached) group.remove(cached.group);
    const shape = template(animal.species, variant);
    const root = new THREE.Group(); root.name = `${animal.species}:${animal.id}`;
    root.userData.animalId = animal.id; root.userData.species = animal.species; root.userData.coat = variant;
    root.scale.setScalar(.92 + ((identity >>> 8) % 17) * .01);
    const rig = new THREE.Group(); rig.name = "animal-rig"; root.add(rig);
    const joints = new Map<string, THREE.Group>();
    for (const part of shape.parts) {
      const joint = new THREE.Group(); joint.name = part.name; joint.position.set(...part.at);
      const mesh = new THREE.Mesh(shape.geometry.get(part.name), material); mesh.name = `${part.name}-surface`;
      mesh.userData.features = part.details.map(detail => detail.name);
      mesh.castShadow = true; mesh.receiveShadow = false;
      joint.add(mesh); rig.add(joint); joints.set(part.name, joint);
    }
    const result: AnimalModel = {
      group: root, rig, head: joints.get("head")!, tail: joints.get("tail")!,
      legs: [...joints].filter(([name]) => name.startsWith("leg-")).map(([, joint]) => joint),
      wings: [...joints].filter(([name]) => name.startsWith("wing-")).map(([, joint]) => joint),
      species: animal.species, restOffset: -shape.legHeight * .54, phase: (identity % 1000) / 1000 * Math.PI * 2,
    };
    // Folded feet and haunches differ substantially between species. Ground
    // this pose once when building the rig, rather than applying one leg ratio
    // to rabbits, cattle and long-legged deer or measuring every frame.
    animate(result, { ...animal, behavior: "rest" }, 0);
    const restBounds = new THREE.Box3().setFromObject(root);
    result.restOffset += (.01 - restBounds.min.y) / root.scale.y;
    models.set(animal.id, result);
    return result;
  }
  function animate(model: AnimalModel, animal: AnimalState, time: number, displaced = false) {
    const moving = displaced && (animal.behavior === "walk" || animal.behavior === "approach" || animal.behavior === "flee");
    const fleeing = moving && animal.behavior === "flee", resting = animal.behavior === "rest", grazing = animal.behavior === "graze";
    const rabbit = animal.species === "rabbit", bird = animal.species === "chicken";
    const cycle = time * (fleeing ? 14 : bird ? 10 : rabbit ? 9 : 7) + model.phase;
    const stride = moving ? Math.sin(cycle) * (fleeing ? .83 : .48) : 0;
    model.rig.position.y = resting ? model.restOffset : moving ? Math.abs(Math.sin(cycle)) * (rabbit ? .15 : fleeing ? .09 : .026) : 0;
    model.rig.rotation.set(moving && rabbit ? Math.cos(cycle) * .12 : 0, 0, moving ? Math.sin(cycle) * .018 : 0);
    for (let index = 0; index < model.legs.length; index++) {
      const leg = model.legs[index], front = leg.name.includes("front"), left = leg.name.endsWith("left");
      leg.rotation.set(resting ? (front ? -1.35 : 1.35)
        : rabbit ? stride * (front ? -1 : 1) : stride * (front === left ? 1 : -1), 0, 0);
    }
    model.head.rotation.set(grazing ? (bird ? .75 + Math.max(0, Math.sin(time * 5 + model.phase)) * .45 : .86 + Math.sin(time * 2.2 + model.phase) * .1)
      : resting ? .2 : moving ? -.08 + Math.sin(cycle) * .035 : Math.sin(time * .8 + model.phase) * .035,
    !moving && !grazing ? Math.sin(time * .55 + model.phase) * .07 : 0, 0);
    model.tail.rotation.set(resting ? .3 : 0, resting ? .3 : Math.sin(time * (animal.species === "dog" ? 7 : 2) + model.phase) * (animal.species === "dog" ? .45 : .1), 0);
    for (let index = 0; index < model.wings.length; index++) model.wings[index].rotation.z = (index ? 1 : -1) * (fleeing ? .3 + Math.sin(cycle) * .2 : .035);
  }
  return {
    group,
    update(state, zone, timeSeconds) {
      if (disposed) return;
      const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      const active = new Set<string>();
      for (const animal of Object.values(state.wildlife.animals)) {
        if (animal.zone !== zone) continue;
        const visual = model(animal); active.add(animal.id);
        if (visual.group.parent !== group) group.add(visual.group);
        visual.group.position.set(animal.x * WORLD_SCALE, 0, animal.y * WORLD_SCALE);
        visual.group.rotation.y = Math.PI / 2 - animal.facing;
        const previous = visual.sample;
        const displaced = !!previous && (Math.hypot(animal.x - previous.x, animal.y - previous.y) > .01 ||
          (time === previous.time && previous.moving));
        visual.sample = { x: animal.x, y: animal.y, time, moving: displaced };
        animate(visual, animal, time, displaced);
      }
      for (const child of [...group.children]) if (!active.has(child.userData.animalId)) group.remove(child);
      // Imported campaigns are looked up by stable ID, never retained state references.
      for (const [id, visual] of models) if (!state.wildlife.animals[id]) { group.remove(visual.group); models.delete(id); }
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.clear(); models.clear();
      for (const value of templates.values()) for (const geometry of value.geometry.values()) geometry.dispose();
      for (const geometry of primitives.values()) geometry.dispose();
      material.dispose(); templates.clear(); primitives.clear();
    },
  };
}

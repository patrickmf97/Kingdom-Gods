import * as THREE from "three";
import type { ActorAppearance, CharacterModel } from "./characters";

/**
 * Blender-made villagers (art/blender/characters.py): a skinned body per sex, five clips and
 * every garment as its own mesh. Each person gets a clone showing only what they wear,
 * tinted with their saved colours. Geometry and skeleton templates are shared.
 */
type Template = { scene: THREE.Object3D; clips: THREE.AnimationClip[] };
const templates: Partial<Record<"male" | "female", Template>> = {};
let cloneSkinned: ((source: THREE.Object3D) => THREE.Object3D) | null = null;

/** Rig built at 1.75 m; the game's people stand about 2.2 world units tall. */
export const RIG_SCALE = 2.2 / 1.75;

export async function loadRiggedCharacters(base: string, loader: { loadAsync(url: string): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> }): Promise<void> {
  const utils = await import("three/examples/jsm/utils/SkeletonUtils.js");
  cloneSkinned = utils.clone;
  for (const sex of ["male", "female"] as const) {
    try {
      const gltf = await loader.loadAsync(`${base}models/characters-${sex}.glb`);
      templates[sex] = { scene: gltf.scene, clips: gltf.animations };
    } catch { /* the procedural figures remain */ }
  }
}

export function riggedCharactersReady(): boolean { return !!templates.male && !!templates.female && !!cloneSkinned; }

const TROUSERS = ["#5b4a3a", "#4a4f45", "#6b5840", "#3f4652", "#5e4b52", "#57503f"];
const ROBES = new Set(["matron", "innkeeper", "pilgrim"]);
const APRONS = new Set(["smith", "baker", "miller", "innkeeper"]);
const CAPES = new Set(["apostle", "ranger", "pilgrim", "courier", "traveler", "matron"]);
const SATCHELS = new Set(["merchant", "traveler", "courier", "fisher"]);
const HATS = new Set(["farmer", "fisher", "traveler"]);
const CAPS = new Set(["baker", "miller", "merchant", "porter"]);
const HOODS = new Set(["ranger", "pilgrim", "matron"]);

export interface Wardrobe { visible: Set<string>; hair: string }

/** Which garments a person wears; pure, so it can be tested without WebGL. */
export function wardrobe(appearance: ActorAppearance): Wardrobe {
  const role = appearance.role ?? "apostle";
  const female = appearance.sex === "female" || appearance.sex === "Feminino";
  let seed = 0;
  for (const c of String(appearance.variant ?? role)) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
  const visible = new Set(["body", "head", "face", "brows", "lips", "trousers", "boots", "belt", "buckle"]);
  visible.add(ROBES.has(role) ? "robe" : "tunic");
  if (APRONS.has(role)) visible.add("apron");
  if (CAPES.has(role)) visible.add("cape");
  if (SATCHELS.has(role)) { visible.add("satchel"); visible.add("strap"); }
  if (role === "porter") visible.add("pack");
  if (role === "ranger") visible.add("quiver");
  if (role === "guard") { visible.add("helmet"); visible.add("pauldrons"); visible.add("tabard"); }
  if (HOODS.has(role)) visible.add("hood");
  else if (HATS.has(role)) visible.add("hat");
  else if (CAPS.has(role)) visible.add("cap");
  const styles = female ? ["long", "bun", "braid", "long"] : ["short", "short", "long", "short"];
  const hair = `hair-${styles[seed % styles.length]}`;
  if (!visible.has("helmet") && !visible.has("hood")) visible.add(hair);
  if (!female && (appearance.age ?? 22) >= 25 && seed % 3 === 0) visible.add("beard");
  return { visible, hair };
}

const tint = (hex: string, fallback: string) => new THREE.Color(/^#[\da-f]{6}$/i.test(hex) ? hex : fallback);

export function createRiggedCharacter(appearance: ActorAppearance): CharacterModel | null {
  const female = appearance.sex === "female" || appearance.sex === "Feminino";
  const template = templates[female ? "female" : "male"];
  if (!template || !cloneSkinned) return null;
  const group = new THREE.Group();
  group.name = "rigged-character";
  const rig = cloneSkinned(template.scene);
  rig.scale.setScalar(RIG_SCALE);
  group.add(rig);
  const { visible } = wardrobe(appearance);
  const role = appearance.role ?? "apostle";
  let seed = 0;
  for (const c of String(appearance.variant ?? role)) seed = (Math.imul(seed, 31) + c.charCodeAt(0)) >>> 0;
  const skin = tint(appearance.skin, "#c9936f"), hair = tint(appearance.hair, "#543b2b");
  const colours: Record<string, THREE.Color> = {
    skin, hair, brows: hair.clone().multiplyScalar(.8), eyes: tint(appearance.eyes, "#729480"),
    outfit: tint(appearance.outfit, "#4d7961"), trousers: new THREE.Color(TROUSERS[seed % TROUSERS.length]),
    lips: skin.clone().lerp(new THREE.Color("#b5524c"), .38),
    leather: new THREE.Color(role === "smith" ? "#5a3d28" : "#6b4c34"),
    linen: new THREE.Color(role === "miller" ? "#d4ccb6" : "#e5dcc6"),
  };
  // Garments never read as bare skin: an outfit too close to the skin tone is deepened.
  const outfit = colours.outfit;
  if (Math.hypot(outfit.r - skin.r, outfit.g - skin.g, outfit.b - skin.b) < .2) outfit.multiplyScalar(.62).lerp(new THREE.Color("#4a3f36"), .25);
  const owned: THREE.Material[] = [];
  const copies = new Map<THREE.Material, THREE.Material>();
  let sword: THREE.Object3D | undefined, tool: THREE.Object3D | undefined;
  rig.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (object.name.startsWith("sword")) sword = object;
    if (object.name.startsWith("tool")) tool = object;
    if (!mesh.isMesh) return;
    // Node names carry the garment and sex: "tunic-male", "hair-bun-female".
    const garment = object.name.replace(/-(male|female)(_\d+)?$/, "");
    if (!object.name.startsWith("sword") && !object.name.startsWith("tool")) mesh.visible = visible.has(garment);
    mesh.frustumCulled = false;
    const swap = (material: THREE.Material) => {
      let copy = copies.get(material);
      if (!copy) {
        copy = material.clone();
        const colour = colours[material.name];
        if (colour) (copy as THREE.MeshStandardMaterial).color.copy(colour);
        // Cloth and skin read softer than the exporter's defaults.
        if (material.name === "skin") (copy as THREE.MeshStandardMaterial).roughness = .62;
        copies.set(material, copy); owned.push(copy);
      }
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  const mixer = new THREE.AnimationMixer(rig);
  const actions = new Map(template.clips.map(clip => [clip.name, mixer.clipAction(clip)]));
  const attack = actions.get("attack");
  if (attack) { attack.setLoop(THREE.LoopOnce, 1); attack.clampWhenFinished = false; }
  let current: THREE.AnimationAction | undefined;
  const play = (name: string, fade = .22) => {
    const next = actions.get(name);
    if (!next || next === current) return next;
    next.reset().play();
    if (current) next.crossFadeFrom(current, fade, false);
    current = next;
    return next;
  };
  const phase = (seed % 97) / 97;
  play("idle", 0);
  if (current) current.time = phase * current.getClip().duration;
  let last: number | undefined, equipped = false, workingNow = false, wasAttacking = false, disposed = false;
  const equipment = () => {
    if (sword) sword.visible = equipped && !workingNow;
    if (tool) tool.visible = workingNow;
  };
  equipment();
  return {
    group,
    animate(seconds, moving, working, attacking, speed) {
      if (disposed) return;
      const time = Number.isFinite(seconds) ? seconds : 0;
      const dt = last === undefined ? 0 : Math.max(0, Math.min(.1, time - last));
      last = time;
      workingNow = working && !attacking;
      const pace = moving ? Number.isFinite(speed) ? Math.max(0, speed!) : 3 : 0;
      if (attacking && !wasAttacking) { const a = play("attack", .08); if (a) a.timeScale = 1.6; }
      else if (!attacking) {
        if (workingNow) play("work");
        else if (pace > 4.6) { const a = play("run"); if (a) a.timeScale = THREE.MathUtils.clamp(pace / 6.5, .8, 1.5); }
        else if (moving) { const a = play("walk"); if (a) a.timeScale = THREE.MathUtils.clamp(pace / 3.2, .7, 1.5); }
        else play("idle", .35);
      }
      wasAttacking = attacking;
      mixer.update(dt);
      equipment();
    },
    setEquipment(value) { if (!disposed) { equipped = value; equipment(); } },
    setLighting() { /* standard PBR materials follow the scene lights */ },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(rig);
      owned.forEach(material => material.dispose());
      group.clear();
    },
  };
}

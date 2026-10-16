import * as THREE from "three";

/** Saved campaign colours are used directly; no character state lives in the renderer. */
export interface ActorAppearance {
  skin: string;
  hair: string;
  eyes: string;
  outfit: string;
}

export interface CharacterModel {
  group: THREE.Group;
  animate(timeSeconds: number, moving: boolean, working: boolean, attacking: boolean): void;
  setEquipment(equipped: boolean): void;
  dispose(): void;
}

/** A compact, genuinely volumetric actor. Feet are at Y=0 and the face looks along +Z. */
export function createCharacterModel(
  appearance: ActorAppearance,
  kind: "human" | "skeleton" = "human",
): CharacterModel {
  // Ownership is deliberately per actor. Removing an NPC must not break the player.
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const group = new THREE.Group();
  group.name = `${kind}-character`;
  const body = new THREE.Group();
  body.name = "animated-body";
  group.add(body);

  const colour = (value: string, fallback: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const skin = colour(appearance.skin, "#c9936f");
  const hair = colour(appearance.hair, "#543b2b");
  const eyes = colour(appearance.eyes, "#729480");
  const outfit = colour(appearance.outfit, "#4d7961");
  const capeColour = `#${new THREE.Color(outfit).multiplyScalar(0.65).getHexString()}`;
  const bone = "#d7cfb2";
  const leather = "#49392d";
  const iron = "#a7afb0";

  function geometry(shape: "box" | "round" | "cylinder" | "tunic" | "hair") {
    let result = geometries.get(shape);
    if (!result) {
      switch (shape) {
        case "box": result = new THREE.BoxGeometry(1, 1, 1); break;
        case "round": result = new THREE.SphereGeometry(1, 8, 6); break;
        case "cylinder": result = new THREE.CylinderGeometry(1, 1, 1, 8); break;
        case "tunic": result = new THREE.CylinderGeometry(0.82, 1, 1, 8); break;
        case "hair": result = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.43); break;
      }
      geometries.set(shape, result);
    }
    return result;
  }
  function material(hex: string, metal = false) {
    const key = `${hex}:${metal}`;
    let result = materials.get(key);
    if (!result) {
      result = new THREE.MeshStandardMaterial({
        color: hex, flatShading: true, roughness: metal ? 0.5 : 0.9, metalness: metal ? 0.45 : 0,
      });
      materials.set(key, result);
    }
    return result;
  }
  function mesh(
    name: string, parent: THREE.Object3D, shape: Parameters<typeof geometry>[0], hex: string,
    x: number, y: number, z: number, sx: number, sy: number, sz: number, metal = false,
  ) {
    const result = new THREE.Mesh(geometry(shape), material(hex, metal));
    result.name = name;
    result.position.set(x, y, z);
    result.scale.set(sx, sy, sz);
    result.castShadow = true;
    result.receiveShadow = true;
    parent.add(result);
    return result;
  }
  function joint(name: string, x: number, y: number, z = 0) {
    const result = new THREE.Group();
    result.name = name;
    result.position.set(x, y, z);
    body.add(result);
    return result;
  }

  const leftLeg = joint("leg-left", -0.145, 0.82);
  const rightLeg = joint("leg-right", 0.145, 0.82);
  for (const [side, leg] of [["left", leftLeg], ["right", rightLeg]] as const) {
    if (kind === "human") {
      mesh(`trouser-${side}`, leg, "cylinder", "#665843", 0, -0.31, 0, 0.093, 0.62, 0.098);
      mesh(`boot-${side}`, leg, "box", leather, 0, -0.71, 0.055, 0.205, 0.22, 0.33);
      mesh(`boot-cuff-${side}`, leg, "cylinder", "#6a4b34", 0, -0.54, 0, 0.102, 0.12, 0.112);
    } else {
      mesh(`leg-bone-${side}`, leg, "cylinder", bone, 0, -0.31, 0, 0.055, 0.62, 0.055);
      mesh(`knee-${side}`, leg, "round", "#b9b097", 0, -0.31, 0.015, 0.08, 0.08, 0.08);
      mesh(`foot-bones-${side}`, leg, "box", bone, 0, -0.745, 0.07, 0.13, 0.15, 0.31);
    }
  }

  const leftArm = joint("arm-left", -0.325, 1.36);
  const rightArm = joint("arm-right", 0.325, 1.36);
  for (const [side, arm] of [["left", leftArm], ["right", rightArm]] as const) {
    if (kind === "human") {
      mesh(`sleeve-${side}`, arm, "cylinder", outfit, 0, -0.14, 0, 0.112, 0.31, 0.112);
      mesh(`forearm-${side}`, arm, "cylinder", skin, 0, -0.37, 0.006, 0.071, 0.25, 0.071);
      mesh(`hand-${side}`, arm, "box", skin, 0, -0.54, 0.017, 0.14, 0.16, 0.13);
    } else {
      mesh(`arm-bone-${side}`, arm, "cylinder", bone, 0, -0.26, 0, 0.046, 0.5, 0.046);
      mesh(`elbow-${side}`, arm, "round", "#b9b097", 0, -0.26, 0, 0.066, 0.065, 0.066);
      mesh(`hand-bones-${side}`, arm, "box", bone, 0, -0.53, 0.018, 0.115, 0.15, 0.10);
    }
  }

  if (kind === "human") {
    mesh("tunic", body, "tunic", outfit, 0, 1.095, 0, 0.285, 0.63, 0.218);
    mesh("belt", body, "cylinder", leather, 0, 0.965, 0, 0.277, 0.075, 0.214);
    mesh("belt-buckle", body, "box", "#c8a45d", 0, 0.968, 0.218, 0.105, 0.085, 0.045, true);
    mesh("cape", body, "box", capeColour, 0, 1.11, -0.208, 0.48, 0.66, 0.055).rotation.x = -0.12;
    mesh("neck", body, "cylinder", skin, 0, 1.48, 0, 0.095, 0.18, 0.095);
    mesh("head", body, "round", skin, 0, 1.735, 0, 0.245, 0.27, 0.225);
    mesh("hair", body, "hair", hair, 0, 1.75, -0.008, 0.253, 0.282, 0.238);
    mesh("hair-back", body, "box", hair, 0, 1.765, -0.185, 0.37, 0.31, 0.10);
    for (const [side, x] of [["left", -0.088], ["right", 0.088]] as const) {
      mesh(`eye-white-${side}`, body, "box", "#f1e9d8", x, 1.765, 0.205, 0.086, 0.061, 0.035);
      mesh(`iris-${side}`, body, "box", eyes, x, 1.765, 0.227, 0.043, 0.051, 0.022);
      mesh(`ear-${side}`, body, "round", skin, Math.sign(x) * 0.235, 1.735, -0.005, 0.052, 0.078, 0.045);
    }
    mesh("nose", body, "box", skin, 0, 1.711, 0.231, 0.065, 0.082, 0.08);
    mesh("mouth", body, "box", "#8c5748", 0, 1.647, 0.186, 0.075, 0.02, 0.024);
  } else {
    mesh("spine", body, "cylinder", "#b9b097", 0, 1.16, -0.055, 0.065, 0.61, 0.065);
    mesh("pelvis", body, "box", bone, 0, 0.86, 0, 0.39, 0.18, 0.20);
    mesh("collar-bones", body, "box", bone, 0, 1.37, 0.01, 0.56, 0.07, 0.09);
    for (let row = 0; row < 3; row++) {
      for (const [side, sign] of [["left", -1], ["right", 1]] as const) {
        const rib = mesh(`rib-${side}-${row}`, body, "box", bone, sign * 0.13, 1.27 - row * 0.13, 0.045, 0.26, 0.065, 0.19);
        rib.rotation.z = -sign * 0.16;
      }
    }
    mesh("neck-bone", body, "cylinder", bone, 0, 1.49, 0, 0.065, 0.17, 0.065);
    mesh("skull", body, "round", bone, 0, 1.755, 0.005, 0.245, 0.266, 0.225);
    mesh("jaw", body, "box", "#c8bea2", 0, 1.565, 0.085, 0.30, 0.12, 0.23);
    for (const [side, x] of [["left", -0.093], ["right", 0.093]] as const) {
      mesh(`eye-socket-${side}`, body, "round", "#2c302b", x, 1.79, 0.196, 0.077, 0.083, 0.042);
      mesh(`iris-${side}`, body, "box", "#c09154", x, 1.79, 0.237, 0.027, 0.034, 0.012);
    }
    mesh("nasal-cavity", body, "box", "#49483a", 0, 1.695, 0.219, 0.05, 0.06, 0.025);
    mesh("teeth-line", body, "box", "#797461", 0, 1.604, 0.207, 0.25, 0.02, 0.016);
    // A weathered shoulder plate makes the hostile silhouette distinct at camera distance.
    mesh("shoulder-armour", leftArm, "round", "#68716b", 0, -0.03, 0, 0.16, 0.15, 0.17, true);
  }

  const sword = new THREE.Group();
  sword.name = "sword";
  sword.position.set(0, -0.55, 0.045);
  // The resting blade points toward the ground, just beyond the hand.
  sword.rotation.z = Math.PI;
  rightArm.add(sword);
  mesh("sword-hilt", sword, "cylinder", leather, 0, 0.025, 0, 0.035, 0.19, 0.035);
  mesh("sword-guard", sword, "box", "#9f8b58", 0, 0.135, 0, 0.25, 0.045, 0.065, true);
  // Keep the resting tip above the soles, including when the weapon is equipped.
  mesh("sword-blade", sword, "box", iron, 0, 0.445, 0, 0.075, 0.59, 0.035, true);
  mesh("sword-tip", sword, "tunic", iron, 0, 0.765, 0, 0.037, 0.07, 0.018, true).rotation.z = Math.PI;

  const tool = new THREE.Group();
  tool.name = "work-tool";
  tool.position.set(0, -0.55, 0.035);
  rightArm.add(tool);
  mesh("tool-handle", tool, "cylinder", "#9a7447", 0, -0.21, 0, 0.035, 0.70, 0.035);
  const pickHead = mesh("tool-pick-head", tool, "box", "#7c898b", 0, -0.49, 0, 0.54, 0.09, 0.10, true);
  pickHead.rotation.z = 0.15;
  mesh("tool-pick-point", tool, "tunic", iron, 0.32, -0.46, 0, 0.045, 0.19, 0.045, true).rotation.z = -Math.PI / 2;
  sword.visible = false;
  tool.visible = false;

  let equipped = false;
  let isWorking = false;
  let wasAttacking = false;
  let attackStarted = 0;
  let disposed = false;
  const updateEquipment = () => {
    sword.visible = equipped && !isWorking;
    tool.visible = isWorking;
  };

  return {
    group,
    setEquipment(value) {
      equipped = value;
      updateEquipment();
    },
    animate(timeSeconds, moving, working, attacking) {
      if (disposed) return;
      const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      const stride = moving ? Math.sin(time * 10) * 0.62 || 0 : 0;
      const oppositeStride = stride === 0 ? 0 : -stride;
      // Only the visual child bobs. The shared simulation position never changes.
      body.position.y = moving ? Math.abs(Math.sin(time * 10)) * 0.055 : 0;
      body.rotation.z = moving ? Math.sin(time * 10) * 0.025 : 0;
      leftLeg.rotation.x = stride;
      rightLeg.rotation.x = oppositeStride;
      leftArm.rotation.x = oppositeStride * 0.78;
      rightArm.rotation.x = stride * 0.78;
      leftArm.rotation.z = 0.075;
      rightArm.rotation.z = -0.075;
      isWorking = working && !attacking;
      if (isWorking) {
        rightArm.rotation.x = -1.75 + Math.sin(time * 6) * 0.85;
        rightArm.rotation.z = -0.14;
        leftArm.rotation.x = -0.8 + Math.sin(time * 6) * 0.24;
      }
      if (attacking) {
        if (!wasAttacking) attackStarted = time;
        const progress = THREE.MathUtils.clamp((time - attackStarted) / 0.28, 0, 1);
        rightArm.rotation.x = -2.8 + progress * 2.1;
        rightArm.rotation.z = -0.35 + Math.sin(progress * Math.PI) * 0.52;
        leftArm.rotation.x = -0.6;
        body.rotation.y = -0.25 + progress * 0.5;
      } else {
        body.rotation.y = 0;
      }
      wasAttacking = attacking;
      updateEquipment();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const owned of geometries.values()) owned.dispose();
      for (const owned of materials.values()) owned.dispose();
      geometries.clear();
      materials.clear();
      group.clear();
    },
  };
}

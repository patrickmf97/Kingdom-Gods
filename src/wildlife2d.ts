import type Phaser from "phaser";
import type { AnimalSpecies, AnimalState } from "./types";

type Pose = "idle" | "step-left" | "step-right" | "graze" | "rest";
export type WildlifeSprite = {
  sprite: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
};

const shapes: Record<AnimalSpecies, { width: number; height: number; shadow: number }> = {
  chicken: { width: 23, height: 27, shadow: 18 },
  sheep: { width: 40, height: 32, shadow: 34 },
  cow: { width: 49, height: 39, shadow: 42 },
  dog: { width: 40, height: 29, shadow: 32 },
  deer: { width: 45, height: 47, shadow: 36 },
  rabbit: { width: 25, height: 29, shadow: 20 },
  fox: { width: 45, height: 32, shadow: 32 },
};
const poses: Pose[] = ["idle", "step-left", "step-right", "graze", "rest"];
const textureKey = (species: AnimalSpecies, pose: Pose) => `wildlife-${species}-${pose}`;

/** Small hand-shaped silhouettes share cached poses instead of redrawing each frame. */
function drawAnimal(context: CanvasRenderingContext2D, species: AnimalSpecies, pose: Pose) {
  context.translate(36, 62);
  const rest = pose === "rest", graze = pose === "graze";
  const step = pose === "step-left" ? 2 : pose === "step-right" ? -2 : 0;
  const rect = (color: string, x: number, y: number, w: number, h: number) => {
    context.fillStyle = color; context.fillRect(x, y, w, h);
  };
  const ellipse = (color: string, x: number, y: number, w: number, h: number) => {
    context.fillStyle = color;
    context.beginPath(); context.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); context.fill();
  };
  const polygon = (color: string, points: number[][]) => {
    context.fillStyle = color; context.beginPath();
    points.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath(); context.fill();
  };
  const legs = (color: string, front: number, back: number, length: number, hoof = "#433f33") => {
    if (rest) return;
    for (const [x, offset] of [[back - 3, -step], [front - 3, step], [back + 1, step], [front + 1, -step]]) {
      rect(color, x + offset, -length, 3, length - 2);
      rect(hoof, x + offset, -3, 4, 3);
    }
  };
  const eye = (x: number, y: number) => {
    rect("#2c3029", x, y, 2, rest ? 1 : 2);
    if (!rest) rect("#fff4d8", x, y, 1, 1);
  };
  const floor = rest ? species === "chicken" || species === "rabbit" ? 2 : 7 : 0;
  context.translate(0, floor);

  if (species === "chicken") {
    if (!rest) {
      rect("#bc833b", -5 - step / 2, -8, 2, 7); rect("#bc833b", 2 + step / 2, -8, 2, 7);
      rect("#d1a34d", -7 - step / 2, -2, 5, 2); rect("#d1a34d", step / 2, -2, 5, 2);
    }
    polygon("#8b5737", [[-10, -12], [-14, -22], [-6, -18], [-5, -12]]);
    ellipse("#ddd1a0", -1, -13, 18, 17);
    ellipse("#bca76d", -3, -12, 11, 9);
    const hy = graze ? -10 : -24;
    ellipse("#f0e6be", 6, hy + 4, 10, 12);
    rect("#bd5842", 3, hy - 3, 3, 5); rect("#bd5842", 7, hy - 2, 3, 4);
    polygon("#d1a344", [[10, hy + 4], [16, hy + 6], [10, hy + 8]]);
    rect("#b64d3d", 8, hy + 9, 3, 4); eye(7, hy + 2);
    return;
  }

  if (species === "rabbit") {
    ellipse("#c5b799", -2, -10, 23, 17);
    ellipse("#e0d4ba", -10, -10, 7, 7);
    ellipse("#e4d9c2", -3 + step, -3 - floor, 13, 5);
    const hy = graze ? -11 : -19;
    ellipse("#d4c6a8", 6, hy + 4, 13, 13);
    if (!rest) {
      polygon("#bdae91", [[2, hy], [0, hy - 15], [5, hy - 14], [7, hy + 1]]);
      polygon("#d8c8aa", [[7, hy], [9, hy - 16], [13, hy - 14], [11, hy + 3]]);
      rect("#c59183", 3, hy - 11, 2, 10); rect("#c59183", 10, hy - 12, 2, 11);
    } else polygon("#bdae91", [[2, hy], [-8, hy - 2], [-9, hy + 2], [6, hy + 4]]);
    ellipse("#eee4ce", 12, hy + 8, 7, 5); rect("#a47f73", 14, hy + 6, 2, 2); eye(8, hy + 2);
    return;
  }

  const cow = species === "cow", deer = species === "deer", sheep = species === "sheep";
  const fox = species === "fox", dog = species === "dog";
  const height = cow ? 20 : deer ? 23 : sheep ? 14 : 12;
  const coat = cow ? "#e4dbc0" : deer ? "#aa7648" : sheep ? "#d8d2b3" : fox ? "#bc6439" : "#a47e52";
  const shade = cow ? "#6c6250" : deer ? "#755337" : sheep ? "#887c62" : fox ? "#773f2e" : "#725838";
  legs(shade, cow ? 13 : 10, cow ? -13 : -11, height, fox ? "#493d33" : undefined);
  if (fox) {
    polygon("#a85533", [[-11, -18], [-30, -23], [-24, -12], [-12, -8]]);
    polygon("#e6d9bc", [[-30, -23], [-25, -14], [-20, -12], [-24, -21]]);
  } else if (dog) {
    polygon("#806140", [[-15, -16], [-24, -25], [-26, -20], [-19, -10]]);
  } else {
    rect(shade, -21, -height - 8, 2, cow ? 16 : 9);
    if (cow) ellipse("#5c5546", -20, -height + 7, 5, 7);
  }
  ellipse(shade, -1, -height + 1, cow ? 40 : 34, cow ? 23 : sheep ? 25 : 19);
  ellipse(coat, -1, -height - 2, cow ? 40 : sheep ? 36 : 33, cow ? 22 : sheep ? 25 : 20);
  if (cow) {
    ellipse("#665b4b", -9, -height - 4, 14, 13); ellipse("#776851", 8, -height - 7, 12, 9);
    ellipse("#caa994", 2, -height + 10, 10, 5);
  } else if (sheep) {
    for (const [x, y] of [[-12, -19], [-5, -25], [4, -24], [12, -19], [-7, -14], [3, -15]])
      ellipse("#e4dec3", x, y, 13, 12);
  } else if (deer) {
    ellipse("#e7d5af", -14, -height, 10, 13);
    ellipse("#d7ba86", 3, -height + 3, 17, 10);
  } else ellipse(fox ? "#e7cc9f" : "#c6a273", 7, -height + 4, 13, 10);

  const hx = graze ? 21 : 15;
  const hy = graze ? -height + 12 : deer ? -height - 14 : -height - 6;
  if (deer) polygon(coat, [[7, -height], [8, hy - 3], [17, hy], [16, -height + 6]]);
  ellipse(sheep ? "#84795e" : coat, hx, hy, cow ? 16 : deer ? 13 : 15, cow ? 18 : 15);
  const muzzle = cow ? "#bd9b8b" : sheep ? "#6d644f" : fox ? "#eadac0" : dog ? "#cfb18a" : "#c7a879";
  ellipse(muzzle, hx + (cow ? 2 : 6), hy + 5, cow ? 16 : fox || dog ? 12 : 8, cow ? 8 : 6);
  if (fox || dog) rect("#3f3a31", hx + 10, hy + 3, 3, 3);
  if (cow || sheep) {
    ellipse(cow ? "#9a8770" : "#c1b899", hx - 8, hy - 4, 9, 5);
    if (cow) {
      polygon("#c2b793", [[hx - 7, hy - 6], [hx - 8, hy - 14], [hx - 3, hy - 8]]);
      polygon("#c2b793", [[hx + 4, hy - 7], [hx + 7, hy - 14], [hx + 8, hy - 6]]);
      rect("#7c6257", hx + 5, hy + 6, 2, 2);
    }
  } else {
    polygon(shade, [[hx - 6, hy - 3], [hx - 6, hy - (deer ? 15 : 12)], [hx + 1, hy - 5]]);
    polygon(coat, [[hx + 1, hy - 5], [hx + 6, hy - (deer ? 15 : 13)], [hx + 7, hy - 1]]);
    if (fox) polygon("#493f34", [[hx - 6, hy - 6], [hx - 6, hy - 12], [hx - 2, hy - 7]]);
  }
  if (dog) rect("#667d66", hx - 7, hy + 5, 7, 3);
  eye(hx + 2, hy - 3);
}

export function generateWildlifeTextures(scene: Phaser.Scene): void {
  for (const species of Object.keys(shapes) as AnimalSpecies[]) {
    for (const pose of poses) {
      const key = textureKey(species, pose);
      if (scene.textures.exists(key)) continue;
      const canvas = document.createElement("canvas"); canvas.width = 72; canvas.height = 64;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.imageSmoothingEnabled = false;
      drawAnimal(context, species, pose);
      scene.textures.addCanvas(key, canvas);
    }
  }
}

export function createWildlifeSprite(scene: Phaser.Scene, animal: AnimalState): WildlifeSprite {
  const shadow = scene.add.ellipse(animal.x, animal.y - 1, shapes[animal.species].shadow, 9, 0x233122, .23);
  const sprite = scene.add.image(animal.x, animal.y, textureKey(animal.species, "idle")).setOrigin(.5, 1);
  return { sprite, shadow };
}

export function updateWildlifeSprite(view: WildlifeSprite, animal: AnimalState, timeSeconds: number): void {
  const moving = animal.behavior === "walk" || animal.behavior === "flee" || animal.behavior === "approach";
  const phase = timeSeconds * (animal.behavior === "flee" ? 13 : 8) + animal.seed % 23;
  const grazing = animal.behavior === "graze" && Math.sin(timeSeconds * .85 + animal.seed % 17) > -.75;
  const pose: Pose = animal.behavior === "rest" ? "rest" : grazing ? "graze" :
    moving ? Math.sin(phase) > 0 ? "step-left" : "step-right" : "idle";
  const key = textureKey(animal.species, pose);
  if (view.sprite.texture.key !== key) view.sprite.setTexture(key);
  const bob = moving ? Math.abs(Math.sin(phase)) * (animal.species === "rabbit" ? 3 : 1.2) : 0;
  view.sprite.setPosition(animal.x, animal.y - bob).setDepth(animal.y)
    .setFlipX(Math.cos(animal.facing) < -.05)
    .setScale(1, animal.behavior === "rest" ? 1 + Math.sin(timeSeconds * 1.8 + animal.seed % 13) * .008 : 1);
  view.shadow.setPosition(animal.x, animal.y - 1).setDepth(animal.y - 2)
    .setScale(moving ? 1 - bob * .035 : 1, 1);
}

/** Hit only the painted body; the transparent 72×64 texture is not an actor. */
export function animalContainsPoint(animal: AnimalState, point: { x: number; y: number }): boolean {
  const shape = shapes[animal.species];
  return Math.abs(point.x - animal.x) <= shape.width / 2 + 6 &&
    point.y <= animal.y + 5 && point.y >= animal.y - shape.height - 5;
}
